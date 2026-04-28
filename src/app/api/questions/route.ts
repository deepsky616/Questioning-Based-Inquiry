import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { buildQuestionCreateData, buildQuestionWhereClause, resolveIsPublicFilter } from "@/lib/questions";
import { sendQuestionNotificationEmail } from "@/lib/email";

const createQuestionSchema = z.object({
  content: z.string().min(1).max(500),
  context: z.string().optional(),
  isPublic: z.boolean().optional(),
  closure: z.string().optional(),
  cognitive: z.string().optional(),
  closureScore: z.number().optional(),
  cognitiveScore: z.number().optional(),
  sessionId: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const role = (session.user as { role?: string }).role;

  const where = buildQuestionWhereClause({
    authorId: searchParams.get("authorId"),
    isPublic: resolveIsPublicFilter(role, searchParams.get("isPublic")),
    closure: searchParams.get("closure"),
    cognitive: searchParams.get("cognitive"),
    search: searchParams.get("search"),
    sessionId: searchParams.get("sessionId"),
    date: searchParams.get("date"),
    subject: searchParams.get("subject"),
    topic: searchParams.get("topic"),
  });

  const questions = await prisma.question.findMany({
    where,
    include: {
      author: {
        select: { id: true, name: true, className: true, grade: true, studentNumber: true },
      },
      session: {
        select: { id: true, date: true, subject: true, topic: true },
      },
      comments: {
        include: {
          author: { select: { id: true, name: true } },
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
    const userId = (session.user as { id: string }).id;

    const question = await prisma.question.create({
      data: buildQuestionCreateData(data, userId),
      include: {
        author: {
          select: {
            id: true,
            name: true,
            className: true,
          },
        },
        session: {
          include: {
            teacher: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (question.session?.teacher.email && question.session.teacher.email !== session.user.email) {
      const sessionTitle = [question.session.subject, question.session.topic].filter(Boolean).join(" - ");
      const emailResult = await sendQuestionNotificationEmail({
        to: question.session.teacher.email,
        teacherName: question.session.teacher.name,
        studentName: question.author.name,
        sessionTitle: sessionTitle || question.session.date,
        question: question.content,
      });
      if (!emailResult.ok) {
        console.error("Question notification email error:", emailResult.error);
      }
    }

    return NextResponse.json(question);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("Create question error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
