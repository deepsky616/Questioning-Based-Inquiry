import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sortTeacherClasses } from "@/lib/teacher";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const teacher = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });

  if (!teacher) {
    return NextResponse.json({ error: "교사 정보를 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({
    name: teacher.name,
    email: teacher.email,
    school: teacher.school,
    teacherClasses: sortTeacherClasses(teacher.teacherClasses),
  });
}
