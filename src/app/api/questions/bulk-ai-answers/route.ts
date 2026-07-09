import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { buildAnswerPrompt } from "@/lib/ai-prompts";
import { validateBulkAiRequest } from "@/lib/questions";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { generateText } from "@/lib/ai";

const schema = z.object({
  questionIds: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 AI 일괄 답변을 생성할 수 있습니다" }, { status: 403 });
  }

  const limited = checkRateLimit(`bulk-ai-answers:${(session.user as { id: string }).id}`, 5);
  if (limited) return limited;

  const userId = (session.user as { id: string }).id;

  try {
    const body = await req.json();
    const { questionIds } = schema.parse(body);

    const validationError = validateBulkAiRequest(questionIds);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const aiCfg = await resolveUserAiConfig(userId);
    if (!aiCfg.apiKey) {
      return NextResponse.json(
        { error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." },
        { status: 400 }
      );
    }
    const apiKey = aiCfg.apiKey;

    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, content: true, context: true, closure: true, cognitive: true },
    });

    // 각 질문에 대해 AI 답변 동시 생성 (통합 AI 호출 계층에서 모델 자동 선택·재시도)
    const aiResults = await Promise.allSettled(
      questions.map(async (q) => {
        const prompt = buildAnswerPrompt(
          q.content,
          q.closure ?? undefined,
          q.cognitive ?? undefined,
          q.context ?? undefined
        );
        const answer = await generateText({
          userId,
          prompt,
          req,
          localize: true,
          apiKeyOverride: apiKey,
          modelOverride: aiCfg.model,
        });
        return { id: q.id, answer };
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
    logger.error("Bulk AI answer error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
