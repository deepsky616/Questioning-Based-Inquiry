import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { CLASSIFICATION_PROMPT, fallbackClassification, parseClassificationResponse } from "@/lib/classify";
import { isAllowedGeminiModel } from "@/lib/api-config";
import { AiKeyMissingError, AiQuotaError, generateJsonWithMetadata } from "@/lib/ai";

const classifySchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().refine(isAllowedGeminiModel, "지원하지 않는 Gemini 모델입니다").optional(),
  content: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  // 인증: 로그인한 사용자만 분류 요청 가능 (서버 저장 Gemini 키 남용 방지)
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // 레이트 리밋: 사용자당 분당 20회 (Gemini 호출 비용 보호)
  const userId = (session.user as { id: string }).id;
  const { success } = rateLimit(`classify:${userId}`, { limit: 20, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  let fallbackContent = "";
  try {
    const body = await req.json();
    const { apiKey: requestApiKey, model: requestModel, content } = classifySchema.parse(body);
    fallbackContent = content;

    const generated = await generateJsonWithMetadata<unknown>({
      userId,
      prompt: `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}`,
      req,
      localize: true,
      quality: true,
      temperature: 0,
      apiKeyOverride: requestApiKey,
      modelOverride: requestModel,
    });

    const parsed = parseClassificationResponse(JSON.stringify(generated.data));
    if (parsed) {
      return NextResponse.json({ ...parsed, analysisModel: generated.model });
    }

    return NextResponse.json(fallbackClassification(content));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    if (error instanceof AiKeyMissingError || error instanceof AiQuotaError) {
      // 키 없음·무료 한도 초과 — 키워드 기반 폴백 분류로 학생의 질문 작성 흐름을 끊지 않는다
      return NextResponse.json(fallbackClassification(fallbackContent));
    }

    logger.error("Gemini classify error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
