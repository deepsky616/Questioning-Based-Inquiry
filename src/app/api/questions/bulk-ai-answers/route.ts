import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildAnswerPrompt } from "@/lib/ai-prompts";
import { validateBulkAiRequest } from "@/lib/questions";

const schema = z.object({
  questionIds: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 AI 일괄 답변을 생성할 수 있습니다" }, { status: 403 });
  }

  const userId = (session.user as { id: string }).id;

  try {
    const body = await req.json();
    const { questionIds } = schema.parse(body);

    const validationError = validateBulkAiRequest(questionIds);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const [apiKeyRecord, modelRecord] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
      prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
    ]);

    if (!apiKeyRecord?.value) {
      return NextResponse.json(
        { error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." },
        { status: 400 }
      );
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, content: true, context: true, closure: true, cognitive: true },
    });

    const genAI = new GoogleGenerativeAI(apiKeyRecord.value);
    const model = genAI.getGenerativeModel({ model: modelRecord?.value ?? "gemini-2.5-flash" });

    // 각 질문에 대해 AI 답변 동시 생성
    const aiResults = await Promise.allSettled(
      questions.map(async (q) => {
        const prompt = buildAnswerPrompt(
          q.content,
          q.closure ?? undefined,
          q.cognitive ?? undefined,
          q.context ?? undefined
        );
        const result = await model.generateContent(prompt);
        return { id: q.id, answer: result.response.text().trim() };
      })
    );

    // 성공한 답변만 댓글로 저장
    const successItems = aiResults
      .filter((r): r is PromiseFulfilledResult<{ id: string; answer: string }> => r.status === "fulfilled")
      .map((r) => r.value);

    await prisma.$transaction(
      successItems.map((item) =>
        prisma.comment.create({
          data: { content: item.answer, authorId: userId, questionId: item.id },
        })
      )
    );

    return NextResponse.json({
      success: successItems.length,
      failed: questions.length - successItems.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("Bulk AI answer error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
