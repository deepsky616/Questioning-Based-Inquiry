import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildActivityReport } from "@/lib/report-stats";

// 학급 활동 리포트(교사용)
//  - grade/className 미지정: 교사의 담당 학급 목록 반환(선택용)
//  - grade/className 지정: 해당 학급 전체 학생의 질문·좋아요·댓글 추세 + 학생별 롤업
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { school: true } });
  const school = teacher?.school ?? null;

  const grade = req.nextUrl.searchParams.get("grade");
  const className = req.nextUrl.searchParams.get("className");

  // 학급 미지정 → 담당 학급 목록(학생 수 포함)
  if (!grade || !className) {
    const classes = await prisma.teacherClass.findMany({
      where: { teacherId },
      select: { grade: true, className: true },
      orderBy: [{ grade: "asc" }, { className: "asc" }],
    });
    const withCounts = await Promise.all(
      classes.map(async (c) => ({
        grade: c.grade,
        className: c.className,
        studentCount: await prisma.user.count({
          where: { role: "STUDENT", grade: c.grade, className: c.className, ...(school ? { school } : {}) },
        }),
      })),
    );
    return NextResponse.json({ scope: "class-list", classes: withCounts });
  }

  // 해당 학급 학생들
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", grade, className, ...(school ? { school } : {}) },
    select: { id: true, name: true, studentNumber: true },
    orderBy: { studentNumber: "asc" },
  });
  const ids = students.map((s) => s.id);

  if (ids.length === 0) {
    return NextResponse.json({ error: "해당 학급에 학생이 없습니다" }, { status: 404 });
  }

  const [questions, likesGiven, comments, likesReceived, commentsReceived] = await Promise.all([
    prisma.question.findMany({ where: { authorId: { in: ids } }, select: { createdAt: true, closure: true, cognitive: true, authorId: true } }),
    prisma.questionLike.findMany({ where: { userId: { in: ids } }, select: { createdAt: true, userId: true } }),
    prisma.comment.findMany({ where: { authorId: { in: ids } }, select: { createdAt: true, authorId: true } }),
    prisma.questionLike.findMany({ where: { question: { authorId: { in: ids } } }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { question: { authorId: { in: ids } } }, select: { createdAt: true } }),
  ]);

  const report = buildActivityReport({ questions, likesGiven, comments, likesReceived, commentsReceived });

  // 학생별 롤업(쓴 활동 기준)
  const perStudent = students.map((s) => ({
    id: s.id,
    name: s.name,
    studentNumber: s.studentNumber,
    questions: questions.filter((q) => q.authorId === s.id).length,
    likesGiven: likesGiven.filter((l) => l.userId === s.id).length,
    comments: comments.filter((c) => c.authorId === s.id).length,
  }));

  return NextResponse.json({
    scope: "class",
    klass: { grade, className, studentCount: students.length, school },
    perStudent,
    ...report,
  });
}
