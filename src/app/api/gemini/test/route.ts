import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const testSchema = z.object({
  apiKey: z.string().min(10),
  model: z.string(),
});

const TEST_PROMPT = "안녕하세요. 이 메시지를 읽으면 응답해주세요.";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, model } = testSchema.parse(body);

    const genAI = new GoogleGenerativeAI(apiKey);
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

    console.error("Gemini test error:", error);
    return NextResponse.json({
      success: false,
      error: "Gemini API 연결에 실패했습니다. API 키와 모델을 확인해 주세요."
    }, { status: 500 });
  }
}