import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canCreateComment } from "@/lib/questions";
import { normalizeContent, ACTIVITY_BASE_POINTS } from "@/lib/content-normalize";
import { Prisma } from "@prisma/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const question = await prisma.question.findUnique({ where: { id: params.id } });
  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  const userRole = (session.user as { id: string; role?: string }).role;
  const userId = (session.user as { id: string; role?: string }).id;
  const isOwner = question.authorId === userId;

  if (!question.isPublic && !isOwner && userRole !== "TEACHER") {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const comments = await prisma.comment.findMany({
    where: { questionId: params.id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { id: string; role?: string }).role;
  const userId = (session.user as { id: string; role?: string }).id;

  try {
    const { content } = await req.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: "댓글 내용을 입력해 주세요" }, { status: 400 });
    }

    const question = await prisma.question.findUnique({
      where: { id: params.id },
      include: { session: { select: { isActive: true } } },
    });
    if (!question) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (!canCreateComment(userRole, question.isPublic)) {
      return NextResponse.json({ error: "댓글 작성 권한이 없습니다" }, { status: 403 });
    }

    if (question.session && !question.session.isActive && userRole !== "TEACHER") {
      return NextResponse.json({ error: "비활성화된 세션에서는 댓글을 작성할 수 없습니다" }, { status: 403 });
    }

    // 중복 검사 (학생 + 같은 질문 + 정규화 동일)
    const normalized = normalizeContent(content);
    if (userRole === "STUDENT" && normalized.length > 0) {
      const existing = await prisma.comment.findFirst({
        where: {
          questionId: params.id,
          authorId: userId,
          normalizedContent: normalized,
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "이미 같은 답변을 작성했어요. 다른 표현으로 바꿔보세요!", code: "DUPLICATE" },
          { status: 409 }
        );
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        normalizedContent: normalized,
        authorId: userId,
        questionId: params.id,
      } as Prisma.CommentUncheckedCreateInput,
      include: { author: { select: { id: true, name: true } } },
    });

    // 학생이 답변 작성 시 자동 기본 점수 (멱등)
    if (userRole === "STUDENT") {
      try {
        await prisma.$transaction([
          prisma.pointLog.create({
            data: {
              studentId: userId,
              gameId: "ACTIVITY",
              bonusType: "COMMENT_WRITE",
              points: ACTIVITY_BASE_POINTS.COMMENT_WRITE,
              reason: "친구 질문에 답변 작성",
              status: "APPROVED",
              sessionId: question.sessionId,
              relatedCommentId: comment.id,
              relatedQuestionId: question.id,
            },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { totalPoints: { increment: ACTIVITY_BASE_POINTS.COMMENT_WRITE } },
          }),
        ]);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
          logger.error("Comment point award failed:", e);
        }
      }
    }

    return NextResponse.json(comment);
  } catch (error) {
    logger.error("Create comment error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
