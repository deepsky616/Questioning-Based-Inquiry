import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  flagged: z.boolean().optional(),
  content: z.string().min(1).max(1000).optional(),
});

/**
 * 댓글 수정.
 * - flagged 해제('이상없음'): 교사 전용
 * - content 수정: 작성자 본인 전용
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role?: string }).role;

  const body = await req.json().catch(() => ({}));
  const data = patchSchema.parse(body);

  const existing = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { authorId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }

  const updateData: { flagged?: boolean; content?: string } = {};
  if (data.flagged !== undefined) {
    if (role !== "TEACHER") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    updateData.flagged = data.flagged;
  }
  if (data.content !== undefined) {
    if (existing.authorId !== userId) {
      return NextResponse.json({ error: "본인 댓글만 수정할 수 있습니다" }, { status: 403 });
    }
    updateData.content = data.content.trim();
  }
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다" }, { status: 400 });
  }

  const comment = await prisma.comment.update({
    where: { id: params.commentId },
    data: updateData,
    include: { author: { select: { id: true, name: true } } },
  });

  return NextResponse.json(comment);
}

/** 댓글 삭제 (작성자 본인 또는 교사). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role?: string }).role;

  const comment = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { authorId: true },
  });
  if (!comment) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
  }
  if (comment.authorId !== userId && role !== "TEACHER") {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id: params.commentId } });
  return NextResponse.json({ ok: true });
}
