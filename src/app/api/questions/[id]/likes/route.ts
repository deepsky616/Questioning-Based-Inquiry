import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canLikeQuestion } from "@/lib/question-likes";
import { formatErrorBody } from "@/lib/api-error";
import { canViewQuestion } from "@/lib/content-visibility";
import { loadQuestionAccessContext } from "@/lib/question-detail-service";

type Params = { params: Promise<{ id: string }> };

async function getQuestionAccess(userId: string, questionId: string) {
  const access = await loadQuestionAccessContext(userId, questionId);
  return {
    ...access,
    allowed: Boolean(access.question && canViewQuestion(access.viewer, access.question)),
  };
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { id: questionId } = await params;
  const userId = session.user.id;

  try {
    const access = await getQuestionAccess(userId, questionId);
    const question = access.question;

    if (!question) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }
    if (!access.allowed || !access.viewer) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }
    if (access.viewer.role !== "STUDENT") {
      return NextResponse.json({ error: "학생만 좋아요를 표시할 수 있습니다" }, { status: 403 });
    }

    // 세션이 비활성화돼 있으면 학생은 좋아요를 누를 수 없다(댓글과 동일)
    if (question.session && !question.session.isActive) {
      return NextResponse.json({ error: "선생님이 아직 활동을 열지 않았어요." }, { status: 403 });
    }

    const check = canLikeQuestion({
      likerId: userId,
      questionAuthorId: question.authorId,
      likerRole: access.viewer.role,
      isPublic: question.isPublic,
    });

    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 403 });
    }

    const like = await prisma.questionLike.create({
      data: { questionId, userId },
    });

    const count = await prisma.questionLike.count({ where: { questionId } });
    return NextResponse.json({ id: like.id, likeCount: count }, { status: 201 });
  } catch (error: unknown) {
    // 중복 좋아요 (unique constraint)
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json({ error: "이미 좋아요를 표시했습니다" }, { status: 409 });
    }
    const { message, status } = formatErrorBody(error);
    logger.error("Like create error:", { questionId, error: message });
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { id: questionId } = await params;
  const userId = session.user.id;

  try {
    await prisma.questionLike.delete({
      where: { questionId_userId: { questionId, userId } },
    });

    const count = await prisma.questionLike.count({ where: { questionId } });
    return NextResponse.json({ likeCount: count });
  } catch {
    return NextResponse.json({ error: "좋아요를 찾을 수 없습니다" }, { status: 404 });
  }
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { id: questionId } = await params;
  const userId = session.user.id;
  const access = await getQuestionAccess(userId, questionId);
  if (!access.question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!access.allowed || !access.viewer) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const likes = await prisma.questionLike.findMany({
    where: { questionId },
    select: { userId: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (access.viewer.role === "TEACHER") {
    return NextResponse.json({
      likeCount: likes.length,
      likedBy: likes.map((l) => ({ id: l.user.id, name: l.user.name })),
    });
  }

  return NextResponse.json({
    likeCount: likes.length,
    myLike: likes.some((l) => l.userId === userId),
  });
}
