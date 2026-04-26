import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { fallbackClassification, parseClassificationResponse } from "@/lib/classify";
import { resolveApiKey } from "@/lib/api-config";
import { prisma } from "@/lib/db";

const classifySchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
  content: z.string().min(1).max(500),
  context: z.string().optional(),
});

const CLASSIFICATION_PROMPT = `당신은 질문 유형 분류 전문가입니다. 다음 질문을 분석해주세요.

[분류 기준]
1. 폐쇄형/개방형:
   - 폐쇄형: "무엇", "언제", "몇", "어디", "누구"로 시작, 정답이 명확
   - 개방형: "왜", "어떻게", "무슨", "어떤"로 시작, 다양한 답 가능

2. 인지적 수준:
   - 사실적: 사실/정보 확인, 검색적 질문
   - 해석적: 내용 파악, 추론, 비교 분석
   - 평가적: 판단, 의견, 가치 기준 적용

[출력 형식]
아래 JSON만 출력:
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "interpretive" 또는 "evaluative",
  "closureScore": 0.0부터 1.0 사이의 숫자,
  "cognitiveScore": 0.0부터 1.0 사이의 숫자,
  "reasoning": "분류 근거 50자 이내",
  "feedback": "이 질문을 더 좋은 탐구 질문으로 발전시킬 수 있는 구체적인 제안 100자 이내. 잘 된 점은 칭찬하고 개선 방향을 제시한다."
}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey: requestApiKey, model: requestModel, content, context } = classifySchema.parse(body);

    // 서버에 저장된 API 키 조회
    const [serverKeyRecord, serverModelRecord] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
      prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
    ]);

    const apiKey = resolveApiKey(requestApiKey, serverKeyRecord?.value);
    const model = requestModel || serverModelRecord?.value || "gemini-2.0-flash";

    // API 키가 없으면 키워드 기반 fallback 분류
    if (!apiKey) {
      return NextResponse.json(fallbackClassification(content));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model });

    const fullPrompt = `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}${context ? `\n[맥락] ${context}` : ""}`;

    const result = await genModel.generateContent(fullPrompt);
    const text = result.response.text();

    const parsed = parseClassificationResponse(text);
    if (parsed) {
      return NextResponse.json(parsed);
    }

    return NextResponse.json(fallbackClassification(content));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }

    console.error("Gemini classify error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
