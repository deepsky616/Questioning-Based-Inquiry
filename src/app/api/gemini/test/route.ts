import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { isAllowedGeminiModel } from "@/lib/api-config";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { classifyGeminiError } from "@/lib/gemini-error";

const testSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().refine(isAllowedGeminiModel, "지원하지 않는 Gemini 모델입니다"),
});

const TEST_PROMPT = "안녕하세요. 이 메시지를 읽으면 응답해주세요.";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ success: false, error: "권한이 없습니다" }, { status: 403 });
  }

  const limited = checkRateLimit(`gemini-test:${(session.user as { id: string }).id}`, 20);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { apiKey, model } = testSchema.parse(body);
    const trimmedApiKey = apiKey?.trim() ?? "";

    if (trimmedApiKey && trimmedApiKey.length < 10) {
      return NextResponse.json({ success: false, error: "API 키는 10자 이상이어야 합니다" }, { status: 400 });
    }

    // 입력한 키가 있으면 그 키로, 없으면 교사 본인이 저장한 키로 테스트
    const savedCfg = trimmedApiKey ? null : await resolveUserAiConfig((session.user as { id: string }).id);
    const resolvedApiKey = trimmedApiKey || savedCfg?.apiKey;

    if (!resolvedApiKey) {
      return NextResponse.json({ success: false, error: "API 키를 입력해 주세요" }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(resolvedApiKey);
    const genModel = genAI.getGenerativeModel({ model });

    const result = await genModel.generateContent(TEST_PROMPT);
    const response = result.response;
    const text = response.text();

    return NextResponse.json({
      success: true,
      message: "연결 성공!",
      response: text.slice(0, 100),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: "입력 형식이 올바르지 않습니다",
        detail: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      }, { status: 400 });
    }

    const detail = error instanceof Error ? error.message : String(error);
    const { status, hint, action } = classifyGeminiError(error);
    logger.error(`Gemini test error [${status}]:`, detail);
    return NextResponse.json({
      success: false,
      error: hint,
      action,
      detail,
    }, { status });
  }
}
