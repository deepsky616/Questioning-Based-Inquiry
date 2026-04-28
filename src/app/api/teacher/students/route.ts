import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const teacherId = (session.user as { id: string }).id;

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });

  if (!teacher) {
    return NextResponse.json({ error: "교사 정보를 찾을 수 없습니다" }, { status: 404 });
  }

  // school 미설정이면 빈 목록 반환
  if (!teacher.school) {
    return NextResponse.json({ students: [], teacherClasses: [] });
  }

  const teacherClasses = teacher.teacherClasses;

  // teacherClasses가 없으면 같은 학교 학생 전체, 있으면 해당 학년·반만
  const studentWhere =
    teacherClasses.length === 0
      ? { role: "STUDENT" as const, school: teacher.school }
      : {
          role: "STUDENT" as const,
          school: teacher.school,
          OR: teacherClasses.map((tc) => ({ grade: tc.grade, className: tc.className })),
        };

  const students = await prisma.user.findMany({
    where: studentWhere,
    select: {
      id: true,
      name: true,
      grade: true,
      className: true,
      studentNumber: true,
      school: true,
      _count: { select: { questions: true } },
    },
    orderBy: [{ grade: "asc" }, { className: "asc" }, { studentNumber: "asc" }],
  });

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade ?? "",
      className: s.className ?? "",
      studentNumber: s.studentNumber ?? "",
      school: s.school ?? "",
      questionCount: s._count.questions,
    })),
    teacherClasses,
  });
}
