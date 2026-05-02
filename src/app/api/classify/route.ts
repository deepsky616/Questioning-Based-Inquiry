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

const CLASSIFICATION_PROMPT = `당신은 초·중·고 수업에서 학생 질문을 분류하는 전문가입니다. 다음 질문을 분석해주세요.

[분류 기준]

1. 폐쇄형(closed) / 개방형(open) — 핵심 기준: 질문에 답하기 위해 학생에게 요구되는 사고 과정
   - 폐쇄형: 이미 알거나 찾아보면 확인할 수 있는 정보를 떠올리는 것으로 답할 수 있는 질문. 하나의 정답이 존재.
     예) "광합성이 일어나는 장소는?" (엽록체를 기억해서 확인 → 폐쇄형)
     예) "왜 식물은 초록색인가요?" (교과서 이유 확인 → 폐쇄형. "왜"로 시작해도 사실 확인이면 폐쇄형)
   - 개방형: 배운 내용을 바탕으로 스스로 추론·판단·상상해야 답할 수 있는 질문. 다양한 답이 가능.
     예) "광합성이 없다면 지구는 어떻게 될까요?" (추론 필요 → 개방형)
     예) "어떤 식물이 우주에서 가장 잘 자랄까요?" (판단·적용 필요 → 개방형)
   ⚠ 주의: "왜", "어떻게"로 시작해도 교과서 사실 확인이면 폐쇄형. 질문 형태가 아닌 요구되는 사고 과정이 기준.

2. 인지적 수준(cognitive):
   - 사실적(factual): 사실·정보를 확인하거나 기억에서 검색하는 질문. 예) "광합성에 필요한 세 가지는 무엇인가요?"
   - 개념적(conceptual): 내용의 의미를 파악하고 추론·비교·분석이 필요한 질문. 예) "낮과 밤에 식물의 호흡이 다른 이유는 무엇인가요?"
   - 논쟁적(controversial): 가치 판단·의견·기준 적용, 삶이나 가상 상황에 연결하는 질문. 예) "온실가스 감축을 위해 어떤 방법이 가장 효과적일까요?"

[출력 형식]
아래 JSON만 출력 (다른 텍스트 없이):
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "conceptual" 또는 "controversial",
  "closureScore": 0.0부터 1.0 사이의 숫자 (1에 가까울수록 폐쇄형),
  "cognitiveScore": 0.0부터 1.0 사이의 숫자 (분류 확신도),
  "reasoning": "분류 근거 50자 이내",
  "feedback": "잘 된 점을 먼저 칭찬하고, 닫힌 질문이면 열린 질문으로 발전시키는 구체적인 방법을 100자 이내로 제안"
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
