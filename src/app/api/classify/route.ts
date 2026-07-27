import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { CLASSIFICATION_PROMPT, fallbackClassification, parseClassificationResponse } from "@/lib/classify";
import { isAllowedGeminiModel } from "@/lib/api-config";
import {
  AiBusyError,
  AiKeyMissingError,
  AiQuotaError,
  generateJsonWithMetadata,
} from "@/lib/ai";
import { JsonExtractionError } from "@/lib/json-extract";

const classifySchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().refine(isAllowedGeminiModel, "지원하지 않는 Gemini 모델입니다").optional(),
  content: z.string().min(1).max(200),
});

const CLASSIFICATION_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    closure: { type: "string", enum: ["closed", "open"] },
    cognitive: {
      type: "string",
      enum: ["factual", "conceptual", "controversial"],
    },
    closureScore: { type: "number", minimum: 0, maximum: 1 },
    cognitiveScore: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string", maxLength: 200 },
    feedback: { type: "string", maxLength: 500 },
    improvedExample: { type: "string", maxLength: 300 },
    inappropriate: { type: "boolean" },
    inappropriateReason: { type: "string", maxLength: 100 },
  },
  required: [
    "closure",
    "cognitive",
    "closureScore",
    "cognitiveScore",
    "reasoning",
    "feedback",
    "improvedExample",
    "inappropriate",
    "inappropriateReason",
  ],
} as const;

type FallbackReason = "missing-key" | "quota" | "busy" | "invalid-response";

function fallbackResponse(content: string, fallbackReason: FallbackReason) {
  logger.warn("질문 분석이 기본 분석으로 전환됐습니다", { fallbackReason });
  return NextResponse.json({
    ...fallbackClassification(content),
    analysisSource: "fallback" as const,
    fallbackReason,
  });
}

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
      responseMimeType: "application/json",
      responseJsonSchema: CLASSIFICATION_RESPONSE_JSON_SCHEMA,
      maxOutputTokens: 1_024,
    });

    const parsed = parseClassificationResponse(JSON.stringify(generated.data));
    if (parsed) {
      return NextResponse.json({
        ...parsed,
        analysisSource: "ai",
        analysisModel: generated.model,
      });
    }

    return fallbackResponse(content, "invalid-response");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    if (error instanceof AiKeyMissingError) {
      return fallbackResponse(fallbackContent, "missing-key");
    }
    if (error instanceof AiQuotaError) {
      return fallbackResponse(fallbackContent, "quota");
    }
    if (error instanceof AiBusyError) {
      return fallbackResponse(fallbackContent, "busy");
    }
    if (error instanceof JsonExtractionError) {
      return fallbackResponse(fallbackContent, "invalid-response");
    }

    logger.error("Gemini classify error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
