import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  flagged: z.boolean().optional(),
});

/** 댓글 flagged 해제(교사 전용 — '이상없음' 처리). */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; commentId: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data = patchSchema.parse(body);

  const comment = await prisma.comment.update({
    where: { id: params.commentId },
    data: {
      ...(data.flagged !== undefined && { flagged: data.flagged }),
    },
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
