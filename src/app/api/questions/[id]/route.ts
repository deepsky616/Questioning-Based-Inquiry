import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canPatchQuestion } from "@/lib/questions";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const question = await prisma.question.findUnique({
    where: { id: params.id },
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
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  const userRole = (session.user as { id: string; role?: string }).role;
  const userId = (session.user as { id: string; role?: string }).id;

  if (!question.isPublic && question.authorId !== userId && userRole !== "TEACHER") {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  return NextResponse.json(question);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const userRole = (session.user as { id: string; role?: string }).role;

  try {
    const body = await req.json();
    const { closure, cognitive, isPublic } = body;

    const patchedFields = Object.keys(body).filter((k) =>
      ["closure", "cognitive", "isPublic"].includes(k)
    );

    const existing = await prisma.question.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (!canPatchQuestion(userRole, userId, existing.authorId, patchedFields)) {
      return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    }

    const question = await prisma.question.update({
      where: { id: params.id },
      data: {
        ...(closure !== undefined && { closure }),
        ...(cognitive !== undefined && { cognitive }),
        ...(isPublic !== undefined && { isPublic }),
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
    console.error("Update question error:", error);
    return NextResponse.json({ error: "질문을 찾을 수 없거나 수정에 실패했습니다" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const userRole = (session.user as { id: string; role?: string }).role;

  const question = await prisma.question.findUnique({
    where: { id: params.id },
  });

  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  if (question.authorId !== userId && userRole !== "TEACHER") {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  await prisma.question.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true });
}