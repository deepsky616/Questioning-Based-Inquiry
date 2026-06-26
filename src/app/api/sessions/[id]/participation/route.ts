import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. 인증 확인
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. 교사 권한 확인
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json(
      { error: "교사만 참여 현황을 조회할 수 있습니다" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const teacherId = (session.user as { id?: string }).id as string;

  // 3. 세션 조회
  const questionSession = await prisma.questionSession.findUnique({
    where: { id },
  });

  if (!questionSession) {
    return NextResponse.json(
      { error: "세션을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 4. 본인 세션만 조회 가능
  if (questionSession.teacherId !== teacherId) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    // 5. 해당 교사의 담당 학급 조회
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        teacherClasses: {
          select: { grade: true, className: true },
        },
      },
    });

    const classes = teacher?.teacherClasses ?? [];

    // 6. 담당 학급에 속한 모든 학생 조회
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        OR:
          classes.length > 0
            ? classes.map((c) => ({ grade: c.grade, className: c.className }))
            : [{ id: "" }], // 담당 학급이 없으면 결과 없음
      },
      select: {
        id: true,
        name: true,
        grade: true,
        className: true,
        studentNumber: true,
      },
      orderBy: [{ grade: "asc" }, { className: "asc" }, { studentNumber: "asc" }],
    });

    // 7. 해당 세션의 모든 질문 조회
    const questions = await prisma.question.findMany({
      where: { sessionId: id },
      select: { id: true, authorId: true, content: true, createdAt: true },
    });

    // 8. 질문을 제출한 학생 ID Set 생성
    const submittedIds = new Set(questions.map((q) => q.authorId));

    // 8-1. 이 세션 질문들에 달린 댓글 / 좋아요 (학생별 활동 집계용)
    const sessionQuestionIds = questions.map((q) => q.id);
    const comments = sessionQuestionIds.length
      ? await prisma.comment.findMany({
          where: { questionId: { in: sessionQuestionIds } },
          select: { authorId: true, createdAt: true },
        })
      : [];
    const likes = sessionQuestionIds.length
      ? await prisma.questionLike.findMany({
          where: { questionId: { in: sessionQuestionIds } },
          select: { userId: true, createdAt: true },
        })
      : [];

    // 오름차순 시각 배열로 정리(인라인=마지막, 툴팁=전체)
    const sortedTimes = (arr: { createdAt: Date }[]) =>
      arr.map((x) => x.createdAt.toISOString()).sort((a, b) => a.localeCompare(b));

    // 9. 학생별 활동 집계
    const studentList = students.map((s) => ({
      ...s,
      hasQuestion: submittedIds.has(s.id),
      questionContent:
        questions.find((q) => q.authorId === s.id)?.content?.slice(0, 50) ??
        null,
      questionCount: questions.filter((q) => q.authorId === s.id).length,
      commentCount: comments.filter((c) => c.authorId === s.id).length,
      likeCount: likes.filter((l) => l.userId === s.id).length,
      questionTimes: sortedTimes(questions.filter((q) => q.authorId === s.id)),
      commentTimes: sortedTimes(comments.filter((c) => c.authorId === s.id)),
      likeTimes: sortedTimes(likes.filter((l) => l.userId === s.id)),
    }));

    // 10. 응답 반환
    return NextResponse.json({
      sessionId: id,
      totalStudents: students.length,
      submittedCount: submittedIds.size,
      students: studentList,
    });
  } catch (error) {
    logger.error("Participation fetch error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
