import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canCreateComment } from "@/lib/questions";

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

    const question = await prisma.question.findUnique({ where: { id: params.id } });
    if (!question) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (!canCreateComment(userRole, question.isPublic)) {
      return NextResponse.json({ error: "댓글 작성 권한이 없습니다" }, { status: 403 });
    }

    const comment = await prisma.comment.create({
      data: { content: content.trim(), authorId: userId, questionId: params.id },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Create comment error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
