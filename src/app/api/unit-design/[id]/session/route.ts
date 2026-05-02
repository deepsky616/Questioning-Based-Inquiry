import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const inquiryQuestionSchema = z.object({
  type: z.enum(["factual", "conceptual", "controversial"]),
  content: z.string().min(1),
});

const createSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: z.string().min(1).optional(),
  defaultQuestionPublic: z.boolean().optional().default(true),
  sharedQuestions: z.array(inquiryQuestionSchema).min(1),
});

function questionKey(question: { type: string; content: string }) {
  return `${question.type}|${question.content.trim()}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const teacherId = (session.user as { id: string }).id;
    const body = await req.json();
    const data = createSessionSchema.parse(body);

    const rows = await prisma.$queryRaw<
      {
        id: string;
        teacher_id: string;
        title: string;
        subject: string;
        inquiry_questions: unknown;
      }[]
    >`
      SELECT id, teacher_id, title, subject, inquiry_questions
      FROM unit_designs
      WHERE id = ${id}
      LIMIT 1
    `;

    const design = rows[0];
    if (!design || design.teacher_id !== teacherId) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const savedQuestions = Array.isArray(design.inquiry_questions)
      ? design.inquiry_questions.filter(
          (question): question is { type: string; content: string } =>
            typeof question === "object" &&
            question !== null &&
            typeof (question as { type?: unknown }).type === "string" &&
            typeof (question as { content?: unknown }).content === "string" &&
            Boolean((question as { content: string }).content.trim()),
        )
      : [];

    const savedKeys = new Set(savedQuestions.map(questionKey));
    const selectedQuestions = data.sharedQuestions.map((question) => ({
      type: question.type,
      content: question.content.trim(),
    }));

    if (selectedQuestions.some((question) => !savedKeys.has(questionKey(question)))) {
      return NextResponse.json(
        { error: "저장된 탐구질문 중에서만 선택할 수 있습니다" },
        { status: 400 },
      );
    }

    const newSession = await prisma.questionSession.create({
      data: {
        date: data.date,
        subject: design.subject,
        topic: data.topic?.trim() || design.title,
        teacherId,
        unitDesignId: design.id,
        sharedQuestions: selectedQuestions,
        defaultQuestionPublic: data.defaultQuestionPublic,
      },
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("unit-design session create error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
