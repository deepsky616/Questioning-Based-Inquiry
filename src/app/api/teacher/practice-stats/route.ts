import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { PRACTICE_GAME_ID, practiceDayStartUtc } from "@/lib/practice-points";
import {
  buildPracticeDiagnostic,
  collectCustomPracticeItemIds,
  type PracticeAttemptInput,
  type PracticeCustomItemType,
} from "@/lib/practice-diagnostics";
import {
  loadTeacherStudentScope,
  studentWhereForTeacherScope,
} from "@/lib/teacher-student-access";

// 담당 학급 학생들의 질문 연습 현황(오늘/최근 7일 포인트, 모드별 성공 횟수).
// 연습 지급이 PointLog(gameId=PRACTICE)에 남으므로 추가 수집 없이 집계만 한다.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function compareAttemptsNewestFirst(
  left: PracticeAttemptInput,
  right: PracticeAttemptInput,
): number {
  const timeDifference = right.createdAt.getTime() - left.createdAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

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
    const emptySummary = buildPracticeDiagnostic([]);
    const teacherScope = await loadTeacherStudentScope(teacherId);
    if (!teacherScope) {
      const currentTeacher = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { role: true, school: true },
      });
      if (currentTeacher?.role === "TEACHER" && !currentTeacher.school) {
        return NextResponse.json({ summary: emptySummary, students: [] });
      }
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    // 담당 학급이 있으면 해당 학년·반만, 없으면 같은 학교 학생 전체 (기존 학생 목록과 동일 규칙)
    const students = await prisma.user.findMany({
      where: studentWhereForTeacherScope(teacherScope),
      select: { id: true, name: true, grade: true, className: true, studentNumber: true },
    });
    if (students.length === 0) {
      return NextResponse.json({ summary: emptySummary, students: [] });
    }

    const studentIds = students.map((student) => student.id);
    const allowedStudentIds = new Set(studentIds);
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const rawAttempts = await prisma.$queryRaw<PracticeAttemptInput[]>(Prisma.sql`
      SELECT id,
             student_id AS "studentId",
             mode,
             item_id AS "itemId",
             quiz_type AS "quizType",
             correct,
             created_at AS "createdAt"
      FROM (
        SELECT id, student_id, mode, item_id, quiz_type, correct, created_at,
               ROW_NUMBER() OVER (
                 PARTITION BY student_id ORDER BY created_at DESC, id DESC
               ) AS row_number
        FROM practice_attempts
        WHERE student_id IN (${Prisma.join(studentIds)})
          AND created_at >= ${cutoff}
      ) ranked
      WHERE row_number <= 101
      ORDER BY created_at DESC, id DESC
    `);
    const attemptsByStudent = new Map<string, PracticeAttemptInput[]>();
    for (const attempt of rawAttempts) {
      if (!allowedStudentIds.has(attempt.studentId)) continue;
      const studentAttempts = attemptsByStudent.get(attempt.studentId) ?? [];
      studentAttempts.push(attempt);
      attemptsByStudent.set(attempt.studentId, studentAttempts);
    }
    for (const studentAttempts of attemptsByStudent.values()) {
      studentAttempts.sort(compareAttemptsNewestFirst);
    }

    // 교사 커스텀 문항 시도도 유형 정답률에 반영 — 내장 은행에 없는 문항 id는
    // 커스텀 문항 테이블에서 유형(closure/cognitive/target)을 찾아 넘긴다
    const customItemIds = collectCustomPracticeItemIds(rawAttempts);
    const customItemTypes = new Map<string, PracticeCustomItemType>(
      customItemIds.length > 0
        ? (
            await prisma.practiceCustomItem.findMany({
              where: { id: { in: customItemIds } },
              select: { id: true, closure: true, cognitive: true, target: true },
            })
          ).map((item) => [item.id, item])
        : [],
    );

    const todayStart = practiceDayStartUtc();
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const logs = await prisma.pointLog.findMany({
      where: {
        gameId: PRACTICE_GAME_ID,
        studentId: { in: studentIds },
        status: "APPROVED",
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

    const diagnosticAttempts = students.flatMap((student) =>
      (attemptsByStudent.get(student.id) ?? []).slice(0, 100),
    );
    const result = students
      .sort(compareByClassAndNumber)
      .map((student) => {
        const attempts = attemptsByStudent.get(student.id) ?? [];
        return {
          id: student.id,
          name: student.name,
          grade: student.grade,
          className: student.className,
          studentNumber: student.studentNumber,
          todayPoints: byStudent.get(student.id)?.todayPoints ?? 0,
          weekPoints: byStudent.get(student.id)?.weekPoints ?? 0,
          quizCount: byStudent.get(student.id)?.quizCount ?? 0,
          transformCount: byStudent.get(student.id)?.transformCount ?? 0,
          createCount: byStudent.get(student.id)?.createCount ?? 0,
          ...buildPracticeDiagnostic(attempts.slice(0, 100), customItemTypes),
          capped: attempts.length > 100,
        };
      });

    return NextResponse.json({
      summary: buildPracticeDiagnostic(diagnosticAttempts, customItemTypes),
      students: result,
    });
  } catch (error) {
    logger.error("Practice stats error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
