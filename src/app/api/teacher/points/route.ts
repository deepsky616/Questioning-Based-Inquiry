import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  isStudentInTeacherScope,
  loadTeacherStudentScope,
  studentWhereForTeacherScope,
} from "@/lib/teacher-student-access";

// 교사: 자기 담당 학생들의 포인트 조회
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 접근 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const scope = await loadTeacherStudentScope(teacherId);
  if (!scope) return NextResponse.json({ students: [] });

  const students = await prisma.user.findMany({
    where: studentWhereForTeacherScope(scope),
    select: {
      id: true, name: true, grade: true, className: true, studentNumber: true,
      totalPoints: true,
      _count: { select: { pointLogs: true } },
    },
    orderBy: [{ grade: "asc" }, { className: "asc" }, { studentNumber: "asc" }],
  });

  return NextResponse.json({ students });
}

// 교사: 포인트 수동 지급/회수
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const { studentId, points, reason } = body as { studentId: string; points: number; reason: string };
  if (!studentId || typeof points !== "number" || points === 0) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const scope = await loadTeacherStudentScope(teacherId);
  if (!scope) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  // 음수는 회수 (총 포인트가 음수가 되지 않게 자동 보정)
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      role: true,
      school: true,
      grade: true,
      className: true,
      totalPoints: true,
    },
  });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!isStudentInTeacherScope(scope, student)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const adjusted = points < 0 ? Math.max(points, -student.totalPoints) : points;

  try {
    await prisma.$transaction([
      prisma.pointLog.create({
        data: {
          studentId, gameId: "MANUAL", roomCode: null,
          bonusType: points >= 0 ? "TEACHER_GRANT" : "TEACHER_REVOKE",
          points: adjusted,
          reason: reason || (points >= 0 ? "교사 수동 지급" : "교사 회수"),
          awardedById: teacherId,
        } as Prisma.PointLogUncheckedCreateInput,
      }),
      prisma.user.update({
        where: { id: studentId },
        data: { totalPoints: { increment: adjusted } },
      }),
    ]);
  } catch {
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, adjusted });
}
