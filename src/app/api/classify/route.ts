import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { fallbackClassification, parseClassificationResponse } from "@/lib/classify";
import { isAllowedGeminiModel, resolveApiKey, resolveGeminiModel } from "@/lib/api-config";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { getRequestLocale, languageDirective } from "@/lib/locale";

const classifySchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().refine(isAllowedGeminiModel, "지원하지 않는 Gemini 모델입니다").optional(),
  content: z.string().min(1).max(500),
});

const CLASSIFICATION_PROMPT = `당신은 초·중·고 수업에서 학생 질문을 분류하고 더 좋은 질문을 만들도록 돕는 선생님입니다.

[분류 기준]

1. 닫힌 질문(closed) / 열린 질문(open) — 핵심 기준: 질문에 답하기 위해 학생에게 요구되는 사고 과정
   - 닫힌 질문: 이미 알거나 찾아보면 확인할 수 있는 정보를 떠올리는 것으로 답할 수 있는 질문. 하나의 정답이 존재.
     예) "광합성이 일어나는 장소는?" (엽록체를 기억해서 확인 → 닫힌 질문)
     예) "왜 식물은 초록색인가요?" (교과서 이유 확인 → 닫힌 질문. "왜"로 시작해도 사실 확인이면 닫힌 질문)
   - 열린 질문: 배운 내용을 바탕으로 스스로 추론·판단·상상해야 답할 수 있는 질문. 다양한 답이 가능.
     예) "광합성이 없다면 지구는 어떻게 될까요?" (추론 필요 → 열린 질문)
     예) "어떤 식물이 우주에서 가장 잘 자랄까요?" (판단·적용 필요 → 열린 질문)
   ⚠ 주의: "왜", "어떻게"로 시작해도 교과서 사실 확인이면 닫힌 질문. 질문 형태가 아닌 요구되는 사고 과정이 기준.

2. 인지적 수준(cognitive):
   - 사실적(factual): 사실·정보를 확인하거나 기억에서 검색하는 질문. 예) "광합성에 필요한 세 가지는 무엇인가요?"
   - 개념적(conceptual): 내용의 의미를 파악하고 추론·비교·분석이 필요한 질문. 예) "낮과 밤에 식물의 호흡이 다른 이유는 무엇인가요?"
   - 논쟁적(controversial): 가치 판단·의견·기준을 스스로 세우고 여러 관점을 비교해야 하는 질문. 예) "온실가스 감축을 위해 어떤 방법이 가장 효과적일까요?"

[출력 형식]
아래 JSON만 출력 (다른 텍스트 없이):
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "conceptual" 또는 "controversial",
  "closureScore": 0.0부터 1.0 사이의 숫자 (1에 가까울수록 닫힌 질문),
  "cognitiveScore": 0.0부터 1.0 사이의 숫자 (분류 확신도),
  "reasoning": "이 질문이 왜 이 유형으로 분류됐는지를 학생이 이해할 수 있는 쉬운 말로 60자 이내",
  "feedback": "학생을 응원하는 말로 시작해. 질문의 좋은 점을 구체적으로 1문장 칭찬하고, 닫힌 질문이거나 사실적 질문이면 어떻게 바꾸면 더 깊이 생각할 수 있는 질문이 되는지 친근한 말투로 1~2문장 조언해. 전체 150자 이내.",
  "improvedExample": "closure가 closed이거나 cognitive가 factual인 경우에만 원래 질문을 열린 질문 또는 개념적·논쟁적 질문으로 발전시킨 예시 1개. 이미 open이고 cognitive가 conceptual 또는 controversial이면 빈 문자열(\"\").",
  "inappropriate": "질문에 욕설·비속어·비방·차별·혐오·폭력·성적 표현 등 학습에 부적절한 내용이 있으면 true, 정상이면 false (불리언)",
  "inappropriateReason": "inappropriate가 true일 때만 그 이유를 20자 이내로. 정상이면 빈 문자열(\"\")."
}

[중요] inappropriate가 true여도 closure·cognitive·score는 형식을 맞춰 채워라(분석은 항상 수행). 부적절 판단은 학습 맥락 기준으로 신중히 하되, 단순히 주제가 무겁거나 사회적 논쟁이 되는 질문(예: 환경·정치·역사 쟁점)은 부적절이 아니다.`;

export async function POST(req: Request) {
  // 인증: 로그인한 사용자만 분류 요청 가능 (서버 저장 Gemini 키 남용 방지)
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  try {
    const body = await req.json();
    const { apiKey: requestApiKey, model: requestModel, content } = classifySchema.parse(body);

    // 작업 사용자(학생→담당 교사, 교사→본인) 기준 AI 설정
    const serverCfg = await resolveUserAiConfig(userId);
    const apiKey = resolveApiKey(requestApiKey, serverCfg.apiKey ?? undefined);
    const model = requestModel ? resolveGeminiModel(requestModel) : serverCfg.model;

    // API 키가 없으면 키워드 기반 fallback 분류
    if (!apiKey) {
      return NextResponse.json(fallbackClassification(content));
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model });

    const fullPrompt = `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}${languageDirective(getRequestLocale(req))}`;

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

    logger.error("Gemini classify error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
