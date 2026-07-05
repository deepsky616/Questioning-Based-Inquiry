import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 담당 학생이 작성한 '부적절 의심(flagged)' 질문·댓글의 미검토 수를 반환(교사 알림용)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { school: true, teacherClasses: { select: { grade: true, className: true } } },
  });
  const classes = teacher?.teacherClasses ?? [];
  if (!teacher?.school || classes.length === 0) {
    return NextResponse.json({ total: 0, questions: 0, comments: 0 });
  }

  const studentWhere = {
    role: "STUDENT" as const,
    school: teacher.school,
    OR: classes.map((c) => ({ grade: c.grade, className: c.className })),
  };
  const students = await prisma.user.findMany({ where: studentWhere, select: { id: true } });
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return NextResponse.json({ total: 0, questions: 0, comments: 0 });

  const [questions, comments] = await Promise.all([
    prisma.question.count({ where: { flagged: true, authorId: { in: ids } } }),
    prisma.comment.count({ where: { flagged: true, authorId: { in: ids } } }),
  ]);

  return NextResponse.json({ total: questions + comments, questions, comments });
}
