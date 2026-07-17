import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canModerateQuestion, canViewQuestion } from "@/lib/content-visibility";
import { normalizeContentForPersistence } from "@/lib/content-normalize-db";
import { checkProfanity } from "@/lib/profanity";
import { cleanupCommentTranslations } from "@/lib/translation-cleanup";
import {
  lockCommentMutationTargets,
  rejectPendingActivityBonuses,
} from "@/lib/pending-activity-bonus-cleanup";
import {
  revalidateStudentOwnedMutationAfterLocks,
  revalidateTeacherQuestionManagementAfterLocks,
} from "@/lib/question-detail-service";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const patchSchema = z.object({
  flagged: z.boolean().optional(),
  content: z.string().min(1).max(300).optional(),
});

type Params = { params: Promise<{ id: string; commentId: string }> };

const AWARDED_COMMENT_LOCK_MESSAGE =
  "포인트를 받은 답변은 수정하거나 삭제할 수 없습니다. 선생님께 요청해 주세요.";

const questionAccessSelect = {
  isPublic: true,
  authorId: true,
  author: { select: { role: true, school: true, grade: true, className: true } },
  session: {
    select: {
      teacherId: true,
      targetType: true,
      targetGrade: true,
      targetClassName: true,
      targetStudentId: true,
      targetStudentIds: true,
      teacher: {
        select: {
          role: true,
          school: true,
          teacherClasses: { select: { grade: true, className: true } },
        },
      },
    },
  },
} as const;

async function getViewer(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      school: true,
      grade: true,
      className: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
}

/**
 * 댓글 수정.
 * - flagged 해제('이상없음'): 교사 전용
 * - content 수정: 작성자 본인 전용
 */
export async function PATCH(
  req: Request,
  { params }: Params,
) {
  const { id, commentId } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER" && role !== "STUDENT") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data = patchSchema.parse(body);

  const [viewer, existing] = await Promise.all([
    getViewer(userId),
    prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        authorId: true,
        questionId: true,
        question: { select: questionAccessSelect },
      },
    }),
  ]);
  if (!existing) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.questionId !== id) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }

  const updateData: { flagged?: boolean; flagReason?: string | null; content?: string; normalizedContent?: string } = {};
  if (data.flagged !== undefined) {
    if (role !== "TEACHER" || !canModerateQuestion(viewer, existing.question)) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    updateData.flagged = data.flagged;
    if (!data.flagged) updateData.flagReason = null;
  }
  if (data.content !== undefined) {
    const canAccessQuestion = role === "TEACHER"
      ? canModerateQuestion(viewer, existing.question)
      : canViewQuestion(viewer, existing.question);
    if (existing.authorId !== userId || !canAccessQuestion) {
      return NextResponse.json({ error: "본인 댓글만 수정할 수 있습니다" }, { status: 403 });
    }
    const content = data.content.trim();
    const normalizedContent = await normalizeContentForPersistence(content);
    if (viewer?.role === "STUDENT" && normalizedContent.length === 0) {
      return NextResponse.json({ error: "답변에 글자를 입력해 주세요" }, { status: 400 });
    }
    const profanity = checkProfanity(content);
    updateData.content = content;
    updateData.normalizedContent = normalizedContent;
    updateData.flagged = profanity.flagged;
    updateData.flagReason = profanity.flagged ? profanity.reason : null;
  }
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다" }, { status: 400 });
  }

  const updateComment = () => prisma.$transaction(async (tx) => {
    const locked = await lockCommentMutationTargets(tx, [commentId], [id]);
    const lockedQuestion = locked.questions.find((question) => question.id === id);
    const lockedComment = locked.comments.find((comment) => comment.id === commentId);
    if (
      !lockedQuestion ||
      !lockedComment ||
      lockedComment.questionId !== id
    ) {
      return { status: "MISSING" } as const;
    }

    if (
      role === "TEACHER" &&
      !(await revalidateTeacherQuestionManagementAfterLocks(tx, userId, {
        authorId: lockedQuestion.authorId,
        sessionId: lockedQuestion.sessionId,
      }))
    ) {
      return { status: "FORBIDDEN" } as const;
    }

    if (
      role === "STUDENT" &&
      !(await revalidateStudentOwnedMutationAfterLocks(
        tx,
        userId,
        lockedComment.authorId,
        lockedQuestion.sessionId,
      ))
    ) {
      return { status: "FORBIDDEN" } as const;
    }

    if (data.content !== undefined && lockedComment.authorId !== userId) {
      return { status: "FORBIDDEN" } as const;
    }

    if (data.content !== undefined && role === "STUDENT") {
      const isPointEligibleAnswer = lockedQuestion.authorId !== userId &&
        (existing.question.author?.role === "STUDENT" || existing.question.author?.role === "TEACHER");
      if (isPointEligibleAnswer) return { status: "LOCKED" } as const;

      const awardedPointCount = await tx.pointLog.count({
        where: {
          relatedCommentId: commentId,
          status: { in: ["PENDING", "APPROVED"] },
        },
      });
      if (awardedPointCount > 0) return { status: "LOCKED" } as const;
    }

    const comment = await tx.comment.update({
      where: { id: commentId },
      data: updateData,
      include: { author: { select: { id: true, name: true } } },
    });
    return { status: "UPDATED", comment } as const;
  });
  let updateResult: Awaited<ReturnType<typeof updateComment>>;
  try {
    updateResult = await updateComment();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "이미 같은 답변을 작성했어요. 다른 표현으로 바꿔보세요!", code: "DUPLICATE" },
        { status: 409 },
      );
    }
    throw error;
  }
  if (updateResult.status === "MISSING") {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (updateResult.status === "LOCKED") {
    return NextResponse.json({ error: AWARDED_COMMENT_LOCK_MESSAGE }, { status: 403 });
  }
  if (updateResult.status === "FORBIDDEN") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  if (data.content !== undefined) {
    await cleanupCommentTranslations([commentId]);
  }

  return NextResponse.json(updateResult.comment);
}

/** 댓글 삭제 (작성자 본인 또는 교사). */
export async function DELETE(
  _req: Request,
  { params }: Params,
) {
  const { id, commentId } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER" && role !== "STUDENT") {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  const [viewer, comment] = await Promise.all([
    getViewer(userId),
    prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        authorId: true,
        questionId: true,
        question: { select: questionAccessSelect },
      },
    }),
  ]);
  if (!comment) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (comment.questionId !== id) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  const canDelete = role === "TEACHER"
    ? canModerateQuestion(viewer, comment.question)
    : comment.authorId === userId && canViewQuestion(viewer, comment.question);
  if (!canDelete) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  const deleteResult = await prisma.$transaction(async (tx) => {
    const locked = await lockCommentMutationTargets(tx, [commentId], [id]);
    const lockedQuestion = locked.questions.find((question) => question.id === id);
    const lockedComment = locked.comments.find((item) => item.id === commentId);
    if (
      !lockedQuestion ||
      !lockedComment ||
      lockedComment.questionId !== id
    ) {
      return "MISSING" as const;
    }

    if (
      role === "TEACHER" &&
      !(await revalidateTeacherQuestionManagementAfterLocks(tx, userId, {
        authorId: lockedQuestion.authorId,
        sessionId: lockedQuestion.sessionId,
      }))
    ) {
      return "FORBIDDEN" as const;
    }

    if (
      role === "STUDENT" &&
      !(await revalidateStudentOwnedMutationAfterLocks(
        tx,
        userId,
        lockedComment.authorId,
        lockedQuestion.sessionId,
      ))
    ) {
      return "FORBIDDEN" as const;
    }

    if (role === "STUDENT" && lockedComment.authorId !== userId) {
      return "FORBIDDEN" as const;
    }

    if (role === "STUDENT") {
      const protectedPointCount = await tx.pointLog.count({
        where: {
          relatedCommentId: commentId,
          status: { in: ["PENDING", "APPROVED"] },
        },
      });
      if (protectedPointCount > 0) return "AWARDED" as const;
    }

    await rejectPendingActivityBonuses(tx, { commentIds: [lockedComment.id] });
    await tx.comment.delete({ where: { id: commentId } });
    return "DELETED" as const;
  });

  if (deleteResult === "MISSING") {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (deleteResult === "AWARDED") {
    return NextResponse.json({ error: AWARDED_COMMENT_LOCK_MESSAGE }, { status: 403 });
  }
  if (deleteResult === "FORBIDDEN") {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await cleanupCommentTranslations([commentId]);
  return NextResponse.json({ ok: true });
}
