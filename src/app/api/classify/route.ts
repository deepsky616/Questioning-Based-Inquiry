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

1. 폐쇄형(closed) / 개방형(open):
   - 폐쇄형: 제시된 정보나 이미 아는 내용을 떠올려 확인하는 질문. 하나의 정답이 존재. 예) "광합성이 일어나는 장소는 어디인가요?"
   - 개방형: 배운 내용을 바탕으로 숨겨진 의미를 생각하거나 새로운 상황에 적용하는 질문. 다양한 답이 나올 수 있음. 예) "광합성이 없다면 지구는 어떻게 될까요?"

2. 인지적 수준(cognitive):
   - 사실적(factual): 사실·정보를 확인하거나 검색하는 질문. 예) "광합성에 필요한 세 가지는 무엇인가요?"
   - 해석적(interpretive): 내용의 의미를 파악하고 추론·비교·분석하는 질문. 예) "낮과 밤에 식물의 호흡이 다른 이유는 무엇인가요?"
   - 평가적(evaluative): 가치 판단·의견·기준을 적용하는 질문. 예) "온실가스 감축을 위해 어떤 방법이 가장 효과적일까요?"
   - 적용적(applicative): 배운 내용을 자신의 삶이나 새로운 상황에 연결·적용하는 질문. "만약 ~라면?", "내가 ~라면?" 형태. 예) "내가 화성에서 식물을 키운다면 어떤 방법을 쓸 수 있을까요?"

[출력 형식]
아래 JSON만 출력 (다른 텍스트 없이):
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "interpretive" 또는 "evaluative" 또는 "applicative",
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
