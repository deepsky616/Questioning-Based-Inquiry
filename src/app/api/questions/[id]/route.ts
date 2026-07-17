import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeContentForPersistence } from "@/lib/content-normalize-db";
import { checkProfanity } from "@/lib/profanity";
import {
  canDeleteQuestionForUser,
  canEditQuestionForUser,
  deleteQuestionWithGuard,
  loadQuestionAccessContext,
  updateQuestionWithGuard,
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
  const sessionRole = (session.user as { id: string; role?: string }).role;
  if (sessionRole !== "TEACHER" && sessionRole !== "STUDENT") {
    return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const data = patchQuestionSchema.parse(body);
    const { closure, cognitive, isPublic } = data;
    const patchedFields = Object.keys(data).filter((k) =>
      ["content", "closure", "cognitive", "closureScore", "cognitiveScore", "isPublic", "flagged"].includes(k)
    );
    const [viewer, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
      prisma.question.findUnique({ where: { id } }),
    ]);
    if (!existing) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }
    const userRole = viewer?.role;
    if (!(await canEditQuestionForUser({
      role: userRole, userId, questionId: id, authorId: existing.authorId, fields: patchedFields,
    }))) {
      return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    }
    // 내용이 바뀌면 정규화 키와 부적절 표현 플래그도 함께 갱신한다
    const nextContent = data.content?.trim();
    const normalizedContent = data.content !== undefined
      ? await normalizeContentForPersistence(nextContent ?? "")
      : null;
    if (normalizedContent !== null && normalizedContent.length === 0) {
      return NextResponse.json({ error: "질문에 글자를 입력해 주세요" }, { status: 400 });
    }
    if (
      data.content !== undefined &&
      userRole === "STUDENT" &&
      existing.sessionId &&
      existing.source !== "TEACHER_SHARED"
    ) {
      return NextResponse.json(
        { error: "포인트 지급 대상 질문은 수정할 수 없어요. 선생님께 요청해 주세요." },
        { status: 403 },
      );
    }
    const profanity = nextContent ? checkProfanity(nextContent) : null;
    const updateResult = await updateQuestionWithGuard({
      questionId: id, actorId: userId, userRole,
      contentChanged: data.content !== undefined,
      data: {
        ...(nextContent && normalizedContent !== null && {
          content: nextContent,
          normalizedContent,
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
    });
    if (updateResult.state === "MISSING") {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }
    if (updateResult.state === "BLOCKED") {
      return NextResponse.json({ error: updateResult.error }, { status: 403 });
    }
    if (updateResult.state === "FORBIDDEN") return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    return NextResponse.json(updateResult.question);
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
  const sessionRole = (session.user as { id: string; role?: string }).role;
  if (sessionRole !== "TEACHER" && sessionRole !== "STUDENT") {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }
  const [viewer, question] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.question.findUnique({ where: { id } }),
  ]);
  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }
  const userRole = viewer?.role;

  if (!(await canDeleteQuestionForUser({
    role: userRole, userId, questionId: id, authorId: question.authorId,
  }))) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  if (userRole === "STUDENT" && question.sessionId && question.source !== "TEACHER_SHARED") {
    return NextResponse.json(
      { error: "포인트 지급 대상 질문은 삭제할 수 없어요. 선생님께 요청해 주세요." },
      { status: 403 },
    );
  }

  // 질문 내용만 정리하고 이미 확정된 점수 장부는 감사 기록으로 보존한다.
  const deleteResult = await deleteQuestionWithGuard({ questionId: id, actorId: userId, userRole });

  if (deleteResult.state === "MISSING") {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (deleteResult.state === "BLOCKED") {
    return NextResponse.json({ error: deleteResult.error }, { status: 403 });
  }
  if (deleteResult.state === "FORBIDDEN") return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });

  return NextResponse.json({ success: true });
}
