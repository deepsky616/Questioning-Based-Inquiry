import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  AccountDeletionConflictError,
  AccountDeletionForbiddenError,
  deleteStudentAccountData,
} from "@/lib/account-deletion";
import { logger } from "@/lib/logger";
import { retryPendingQuestionGameRoomSettlementsForUser } from
  "@/lib/account-deletion-room-settlement";

type Params = { params: Promise<{ id: string }> };

async function requireManagedStudent(teacherId: string, studentId: string) {
  const [teacher, student] = await Promise.all([
    prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        role: true,
        school: true,
        teacherClasses: { select: { grade: true, className: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true, school: true, grade: true, className: true },
    }),
  ]);

  if (!student || student.role !== "STUDENT") {
    return { ok: false as const, status: 404, message: "학생을 찾을 수 없습니다" };
  }
  if (teacher?.role !== "TEACHER" || !teacher.school || teacher.school !== student.school) {
    return { ok: false as const, status: 403, message: "권한이 없습니다" };
  }
  if (teacher.teacherClasses.length > 0) {
    const inClass = teacher.teacherClasses.some(
      (item) => item.grade === student.grade && item.className === student.className,
    );
    if (!inClass) return { ok: false as const, status: 403, message: "담당 학생이 아닙니다" };
  }
  return { ok: true as const };
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });

  const teacherId = (session.user as { id: string }).id;
  const { id: studentId } = await params;
  const scope = await requireManagedStudent(teacherId, studentId);
  if (!scope.ok) return NextResponse.json({ error: scope.message }, { status: scope.status });

  try {
    await retryPendingQuestionGameRoomSettlementsForUser(studentId);
    await prisma.$transaction((tx) => deleteStudentAccountData(tx, studentId, teacherId), {
      timeout: 20_000,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AccountDeletionConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AccountDeletionForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error("Student account deletion error:", error);
    return NextResponse.json({ error: "학생 회원 탈퇴 처리 중 오류가 발생했습니다" }, { status: 500 });
  }
}
