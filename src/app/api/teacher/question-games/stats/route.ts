import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadTeacherQuestionGameStats } from "@/lib/teacher-question-game-stats";
import {
  loadTeacherStudentScope,
  studentWhereForTeacherScope,
} from "@/lib/teacher-student-access";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  const teacherScope = await loadTeacherStudentScope(teacherId);
  if (!teacherScope) {
    return NextResponse.json(
      { error: "담당 학교 정보가 없습니다" },
      { status: 403 },
    );
  }

  const students = await prisma.user.findMany({
    where: studentWhereForTeacherScope(teacherScope),
    select: { id: true, name: true, studentNumber: true },
  });
  const byGame = await loadTeacherQuestionGameStats(students);
  return NextResponse.json({ byGame });
}
