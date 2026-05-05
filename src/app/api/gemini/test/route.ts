import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAllowedGeminiModel } from "@/lib/api-config";

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

  try {
    const body = await req.json();
    const { apiKey, model } = testSchema.parse(body);
    const trimmedApiKey = apiKey?.trim() ?? "";

    if (trimmedApiKey && trimmedApiKey.length < 10) {
      return NextResponse.json({ success: false, error: "API 키는 10자 이상이어야 합니다" }, { status: 400 });
    }

    const savedApiKey = trimmedApiKey
      ? null
      : await prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } });
    const resolvedApiKey = trimmedApiKey || savedApiKey?.value;

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
      return NextResponse.json({ success: false, error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }

    const err = error as any;
    if (err.message?.includes("API_KEY_INVALID") || err.message?.includes("invalid api key")) {
      return NextResponse.json({ success: false, error: "API 키가 올바르지 않습니다" }, { status: 400 });
    }

    logger.error("Gemini test error:", error);
    return NextResponse.json({
      success: false,
      error: "Gemini API 연결에 실패했습니다. API 키와 모델을 확인해 주세요."
    }, { status: 500 });
  }
}
