import { GoogleGenerativeAI } from "@google/generative-ai";
import { fallbackClassification, parseClassificationResponse } from "@/lib/classify";
import type { ClassificationResult } from "@/types/question";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

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
  "reasoning": "분류 근거 50자 이내"
}`;

// 메모리 캐시 (Serverless 환경에서는 인스턴스당 캐시)
const questionCache = new Map<string, ClassificationResult>();

export async function classifyQuestion(
  content: string,
  context?: string
): Promise<ClassificationResult> {
  const cacheKey = `${content}::${context ?? ""}`;
  const cached = questionCache.get(cacheKey);
  if (cached) return cached;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const fullPrompt = `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}${context ? `\n[맥락] ${context}` : ""}`;

    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();

    const parsed = parseClassificationResponse(text);
    if (parsed) {
      questionCache.set(cacheKey, parsed);
      return parsed;
    }

    return fallbackClassification(content);
  } catch (error) {
    console.error("Gemini API error:", error);
    return fallbackClassification(content);
  }
}

export type { ClassificationResult };
