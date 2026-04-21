import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createQuestionSchema = z.object({
  content: z.string().min(10).max(500),
  context: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get("authorId");
  const isPublic = searchParams.get("isPublic");
  const closure = searchParams.get("closure");
  const cognitive = searchParams.get("cognitive");
  const search = searchParams.get("search");

  const where: any = {};

  if (authorId) {
    where.authorId = authorId;
  }

  if (isPublic === "true") {
    where.isPublic = true;
  }

  if (closure) {
    where.closure = closure;
  }

  if (cognitive) {
    where.cognitive = cognitive;
  }

  if (search) {
    where.content = { contains: search };
  }

  const questions = await prisma.question.findMany({
    where,
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
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(questions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = createQuestionSchema.parse(body);

    const { classifyQuestion } = await import("@/lib/gemini");
    const classification = await classifyQuestion(data.content, data.context);

    const question = await prisma.question.create({
      data: {
        content: data.content,
        context: data.context,
        closure: classification.closure,
        cognitive: classification.cognitive,
        closureScore: classification.closureScore,
        cognitiveScore: classification.cognitiveScore,
        isPublic: data.isPublic ?? false,
        authorId: (session.user as any).id,
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
    console.error("Create question error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}