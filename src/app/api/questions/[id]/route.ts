import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeContent } from "@/lib/content-normalize";
import { checkProfanity } from "@/lib/profanity";
import { cleanupQuestionTranslations } from "@/lib/translation-cleanup";
import {
  canDeleteQuestionForUser,
  canEditQuestionForUser,
  getStudentQuestionDeleteBlockReason,
  getStudentQuestionEditBlockReason,
  loadQuestionAccessContext,
} from "@/lib/question-detail-service";
import { canViewQuestion, isCommentVisibleToViewer } from "@/lib/content-visibility";
import { z } from "zod";

const patchQuestionSchema = z.object({
  content: z.string().min(1).max(200).optional(),
  closure: z.enum(["closed", "open"]).optional(),
  cognitive: z.enum(["factual", "conceptual", "controversial"]).optional(),
  closureScore: z.number().min(0).max(1).optional(),
  cognitiveScore: z.number().min(0).max(1).optional(),
  isPublic: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const access = await loadQuestionAccessContext(userId, id);
  if (!access.question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!canViewQuestion(access.viewer, access.question)) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          className: true,
        },
      },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      session: { select: { commentsVisibleToPeers: true } },
    },
  });

  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  const visibleComments = question.comments
    .filter((comment) => isCommentVisibleToViewer({
      viewerRole: access.viewer?.role ?? "",
      viewerId: userId,
      commentsVisibleToPeers: question.session?.commentsVisibleToPeers ?? true,
      commentAuthorId: comment.author.id,
      commentAuthorRole: comment.author.role,
      questionAuthorId: question.authorId,
    }))
    .map(({ author, ...comment }) => ({
      ...comment,
      author: { id: author.id, name: author.name },
    }));
  return NextResponse.json({ ...question, session: undefined, comments: visibleComments });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const userRole = (session.user as { id: string; role?: string }).role;

  try {
    const body = await req.json();
    const data = patchQuestionSchema.parse(body);
    const { closure, cognitive, isPublic } = data;

    const patchedFields = Object.keys(data).filter((k) =>
      ["content", "closure", "cognitive", "closureScore", "cognitiveScore", "isPublic", "flagged"].includes(k)
    );

    const existing = await prisma.question.findUnique({
      where: { id },
      include: { _count: { select: { likes: true, comments: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (!(await canEditQuestionForUser({
      role: userRole, userId, questionId: id, authorId: existing.authorId, fields: patchedFields,
    }))) {
      return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    }

    // 학생 본인 내용 수정: 반응(좋아요·댓글)이나 포인트가 붙기 전까지만 허용
    if (data.content !== undefined && userRole === "STUDENT") {
      const blockReason = await getStudentQuestionEditBlockReason(id, existing._count);
      if (blockReason) {
        return NextResponse.json({ error: blockReason }, { status: 403 });
      }
    }

    // 내용이 바뀌면 정규화 키와 부적절 표현 플래그도 함께 갱신한다
    const nextContent = data.content?.trim();
    const profanity = nextContent ? checkProfanity(nextContent) : null;

    const question = await prisma.question.update({
      where: { id },
      data: {
        ...(nextContent && {
          content: nextContent,
          normalizedContent: normalizeContent(nextContent),
          flagged: profanity?.flagged ?? false,
          flagReason: profanity?.flagged ? profanity.reason : null,
        }),
        ...(closure !== undefined && { closure }),
        ...(cognitive !== undefined && { cognitive }),
        ...(data.closureScore !== undefined && { closureScore: data.closureScore }),
        ...(data.cognitiveScore !== undefined && { cognitiveScore: data.cognitiveScore }),
        ...(isPublic !== undefined && { isPublic }),
        ...(data.flagged !== undefined && !nextContent && { flagged: data.flagged }),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            className: true,
          },
        },
      },
    });

    return NextResponse.json(question);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Update question error:", error);
    return NextResponse.json({ error: "질문을 찾을 수 없거나 수정에 실패했습니다" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const userRole = (session.user as { id: string; role?: string }).role;

  const question = await prisma.question.findUnique({
    where: { id },
  });

  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  if (!(await canDeleteQuestionForUser({
    role: userRole, userId, questionId: id, authorId: question.authorId,
  }))) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  // 학생 본인 삭제: 반응(좋아요·댓글)이나 포인트가 붙기 전까지만 허용(교사는 제한 없음)
  if (userRole === "STUDENT") {
    const blockReason = await getStudentQuestionDeleteBlockReason(id);
    if (blockReason) {
      return NextResponse.json({ error: blockReason }, { status: 403 });
    }
  }

  // 번역 캐시 정리(삭제 전 호출 — 댓글 id 확보)
  await cleanupQuestionTranslations([id]);

  // 댓글(외래키 Restrict)·좋아요·관련 PointLog까지 함께 정리
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { questionId: id } }),
    prisma.questionLike.deleteMany({ where: { questionId: id } }),
    prisma.pointLog.deleteMany({ where: { relatedQuestionId: id } }),
    prisma.question.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
