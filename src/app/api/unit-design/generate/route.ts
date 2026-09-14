import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { unitDesignGenerateSchema } from "@/lib/unit-design-prompt";
import { generateText, AiKeyMissingError } from "@/lib/ai";
import { AiInvalidResponseError, AiOutputTruncatedError } from "@/lib/ai-errors";
import { generateUnitDesignData } from "@/lib/unit-design-ai-generation";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const limited = checkRateLimit(`unit-design-generate:${(session.user as { id: string }).id}`, 10);
  if (limited) return limited;

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = unitDesignGenerateSchema.parse(body);

    const generate = (nextPrompt: string, responseJsonSchema?: unknown) => generateText({
      userId: (session.user as { id: string }).id,
      prompt: nextPrompt,
      req,
      localize: true,
      quality: true,
      thinkingBudget: 0,
      maxOutputTokens: 2_048,
      responseMimeType: "application/json",
      responseJsonSchema,
    });
    const aiFailureResponse = (aiErr: unknown) => {
      if (aiErr instanceof AiKeyMissingError) {
        return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
      }
      if (aiErr instanceof AiInvalidResponseError) {
        return NextResponse.json({
          error: data.step === "learning_guides" || data.step === "student_guides"
            ? "학생용 설명을 완전하게 만들지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요."
            : "인공지능 응답을 완전하게 받지 못했어요. 다시 시도해 주세요.",
          code: aiErr instanceof AiOutputTruncatedError ? "AI_OUTPUT_TRUNCATED" : "AI_INVALID_RESPONSE",
        }, { status: 502 });
      }
      logger.warn("탐구설계 인공지능 생성 요청을 완료하지 못했습니다");
      return NextResponse.json({
        error: "AI 호출에 실패했어요. 설정 페이지에서 API 키와 모델을 확인해주세요.",
      }, { status: 502 });
    };

    try {
      return NextResponse.json(await generateUnitDesignData(data, generate));
    } catch (aiErr) {
      return aiFailureResponse(aiErr);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "입력 형식이 올바르지 않습니다",
        detail: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      }, { status: 400 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("unit-design generate error:", detail);
    return NextResponse.json({
      error: "서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
      detail,
    }, { status: 500 });
  }
}
