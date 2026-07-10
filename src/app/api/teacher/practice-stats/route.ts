import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { PRACTICE_GAME_ID, practiceDayStartUtc } from "@/lib/practice-points";

// 담당 학급 학생들의 질문 연습 현황(오늘/최근 7일 포인트, 모드별 성공 횟수).
// 연습 지급이 PointLog(gameId=PRACTICE)에 남으므로 추가 수집 없이 집계만 한다.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  try {
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        school: true,
        teacherClasses: { select: { grade: true, className: true } },
      },
    });
    if (!teacher?.school) {
      return NextResponse.json({ students: [] });
    }

    // 담당 학급이 있으면 해당 학년·반만, 없으면 같은 학교 학생 전체 (기존 학생 목록과 동일 규칙)
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        school: teacher.school,
        ...(teacher.teacherClasses.length > 0
          ? { OR: teacher.teacherClasses.map((c) => ({ grade: c.grade, className: c.className })) }
          : {}),
      },
      select: { id: true, name: true, grade: true, className: true, studentNumber: true },
    });
    if (students.length === 0) {
      return NextResponse.json({ students: [] });
    }

    const todayStart = practiceDayStartUtc();
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const logs = await prisma.pointLog.findMany({
      where: {
        gameId: PRACTICE_GAME_ID,
        studentId: { in: students.map((s) => s.id) },
        createdAt: { gte: new Date(Math.min(weekStart.getTime(), Date.now() - WEEK_MS)) },
      },
      select: { studentId: true, bonusType: true, points: true, createdAt: true },
    });

    const byStudent = new Map<
      string,
      { todayPoints: number; weekPoints: number; quizCount: number; transformCount: number; createCount: number }
    >();
    for (const log of logs) {
      const stat =
        byStudent.get(log.studentId) ??
        { todayPoints: 0, weekPoints: 0, quizCount: 0, transformCount: 0, createCount: 0 };
      stat.weekPoints += log.points;
      if (log.createdAt >= todayStart) stat.todayPoints += log.points;
      if (log.bonusType === "PRACTICE_QUIZ") stat.quizCount += 1;
      else if (log.bonusType === "PRACTICE_TRANSFORM") stat.transformCount += 1;
      else if (log.bonusType === "PRACTICE_CREATE") stat.createCount += 1;
      byStudent.set(log.studentId, stat);
    }

    const result = students
      .sort(compareByClassAndNumber)
      .map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        className: s.className,
        studentNumber: s.studentNumber,
        todayPoints: byStudent.get(s.id)?.todayPoints ?? 0,
        weekPoints: byStudent.get(s.id)?.weekPoints ?? 0,
        quizCount: byStudent.get(s.id)?.quizCount ?? 0,
        transformCount: byStudent.get(s.id)?.transformCount ?? 0,
        createCount: byStudent.get(s.id)?.createCount ?? 0,
      }));

    return NextResponse.json({ students: result });
  } catch (error) {
    logger.error("Practice stats error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
