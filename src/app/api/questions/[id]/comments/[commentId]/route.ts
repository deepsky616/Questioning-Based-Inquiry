import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canModerateQuestion, canViewQuestion } from "@/lib/content-visibility";
import { normalizeContent } from "@/lib/content-normalize";
import { checkProfanity } from "@/lib/profanity";
import { cleanupCommentTranslations } from "@/lib/translation-cleanup";
import { z } from "zod";

const patchSchema = z.object({
  flagged: z.boolean().optional(),
  content: z.string().min(1).max(300).optional(),
});

type Params = { params: Promise<{ id: string; commentId: string }> };

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
    const profanity = checkProfanity(content);
    updateData.content = content;
    updateData.normalizedContent = normalizeContent(content);
    updateData.flagged = profanity.flagged;
    updateData.flagReason = profanity.flagged ? profanity.reason : null;
  }
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다" }, { status: 400 });
  }

  const comment = await prisma.comment.update({
    where: { id: commentId },
    data: updateData,
    include: { author: { select: { id: true, name: true } } },
  });

  if (data.content !== undefined) {
    await cleanupCommentTranslations([commentId]);
  }

  return NextResponse.json(comment);
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

  await prisma.comment.delete({ where: { id: commentId } });
  await cleanupCommentTranslations([commentId]);
  return NextResponse.json({ ok: true });
}
