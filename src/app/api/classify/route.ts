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

const CLASSIFICATION_PROMPT = `당신은 초·중·고 수업에서 학생 질문을 분류하고 더 좋은 질문을 만들도록 돕는 선생님입니다.

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
   - 해석적(interpretive): 내용의 의미를 파악하고 추론·비교·분석이 필요한 질문. 예) "낮과 밤에 식물의 호흡이 다른 이유는 무엇인가요?"
   - 평가적(evaluative): 가치 판단·의견·기준을 스스로 적용해야 하는 질문. 예) "온실가스 감축을 위해 어떤 방법이 가장 효과적일까요?"
   - 적용적(applicative): 배운 내용을 자신의 삶이나 새로운 가상 상황에 연결·적용하는 질문. "만약 ~라면?", "내가 ~라면?" 형태. 예) "내가 화성에서 식물을 키운다면 어떤 방법을 쓸 수 있을까요?"

[출력 형식]
아래 JSON만 출력 (다른 텍스트 없이):
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "interpretive" 또는 "evaluative" 또는 "applicative",
  "closureScore": 0.0부터 1.0 사이의 숫자 (1에 가까울수록 폐쇄형),
  "cognitiveScore": 0.0부터 1.0 사이의 숫자 (분류 확신도),
  "reasoning": "이 질문이 왜 이 유형으로 분류됐는지를 학생이 이해할 수 있는 쉬운 말로 60자 이내",
  "feedback": "학생을 응원하는 말로 시작해. 질문의 좋은 점을 구체적으로 1문장 칭찬하고, 닫힌 질문이거나 사실적 질문이면 어떻게 바꾸면 더 깊이 생각할 수 있는 질문이 되는지 친근한 말투로 1~2문장 조언해. 전체 150자 이내.",
  "improvedExample": "closure가 closed이거나 cognitive가 factual인 경우에만 원래 질문을 개방형 또는 해석적·평가적·적용적 질문으로 발전시킨 예시 1개. 이미 open이고 interpretive/evaluative/applicative이면 빈 문자열(\"\")."
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
