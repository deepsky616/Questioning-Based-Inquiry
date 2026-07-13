import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compareStudentNumber } from "@/lib/student-sort";
import { buildStudentReport } from "@/lib/student-report";
import {
  isClassInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const grade = typeof body.grade === "string" ? body.grade.trim() : "";
  const className = typeof body.className === "string" ? body.className.trim() : "";
  if (!grade || !className) {
    return NextResponse.json({ error: "학년과 반이 필요합니다" }, { status: 400 });
  }

  const teacherScope = await loadTeacherStudentScope(teacherId);
  if (!teacherScope) {
    return NextResponse.json({ error: "학생 보고서 조회 권한이 없습니다" }, { status: 403 });
  }
  if (!isClassInTeacherScope(teacherScope, grade, className)) {
    return NextResponse.json({ error: "담당 학급만 출력할 수 있습니다" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      school: teacherScope.school,
      grade,
      className,
    },
    select: { id: true, studentNumber: true },
  });
  students.sort((a, b) => compareStudentNumber(a.studentNumber, b.studentNumber));

  const reports = (await Promise.all(students.map((student) => buildStudentReport(student.id))))
    .filter((report): report is NonNullable<typeof report> => Boolean(report));

  return NextResponse.json({ reports });
}
