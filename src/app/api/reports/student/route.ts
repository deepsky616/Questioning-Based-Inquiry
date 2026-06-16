import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildActivityReport } from "@/lib/report-stats";

// 학생 활동 리포트: 본인(학생) 또는 교사가 지정한 학생의 질문·좋아요·댓글(쓴 것+받은 것) 추세
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;

  const requestedId = req.nextUrl.searchParams.get("studentId");
  const targetId = role === "TEACHER" && requestedId ? requestedId : userId;

  const student = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, grade: true, className: true, studentNumber: true, school: true },
  });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
  }

  const [questions, likesGiven, comments, likesReceived, commentsReceived] = await Promise.all([
    prisma.question.findMany({ where: { authorId: targetId }, select: { createdAt: true, closure: true, cognitive: true } }),
    prisma.questionLike.findMany({ where: { userId: targetId }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { authorId: targetId }, select: { createdAt: true } }),
    prisma.questionLike.findMany({ where: { question: { authorId: targetId } }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { question: { authorId: targetId } }, select: { createdAt: true } }),
  ]);

  const report = buildActivityReport({ questions, likesGiven, comments, likesReceived, commentsReceived });

  return NextResponse.json({
    scope: "student",
    student: {
      id: student.id, name: student.name, grade: student.grade,
      className: student.className, studentNumber: student.studentNumber, school: student.school,
    },
    ...report,
  });
}
