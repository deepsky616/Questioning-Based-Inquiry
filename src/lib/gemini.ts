import { GoogleGenerativeAI } from "@google/generative-ai";
import { fallbackClassification, parseClassificationResponse } from "@/lib/classify";
import type { ClassificationResult } from "@/types/question";
import { DEFAULT_GEMINI_MODEL } from "@/lib/api-config";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

const CLASSIFICATION_PROMPT = `당신은 질문 유형 분류 전문가입니다. 다음 질문을 분석해주세요.

[분류 기준]
1. 폐쇄형/개방형:
   - 폐쇄형: "무엇", "언제", "몇", "어디", "누구"로 시작, 정답이 명확
   - 개방형: "왜", "어떻게", "무슨", "어떤"로 시작, 다양한 답 가능

2. 인지적 수준:
   - 사실적: 사실/정보 확인, 검색적 질문
   - 개념적: 내용 파악, 추론, 비교 분석
   - 논쟁적: 판단, 의견, 가치 기준 적용

[출력 형식]
아래 JSON만 출력:
{
  "closure": "closed" 또는 "open",
  "cognitive": "factual" 또는 "conceptual" 또는 "controversial",
  "closureScore": 0.0부터 1.0 사이의 숫자,
  "cognitiveScore": 0.0부터 1.0 사이의 숫자,
  "reasoning": "분류 근거 50자 이내"
}`;

// 메모리 캐시 (Serverless 환경에서는 인스턴스당 캐시)
// 무한 증가로 인한 메모리 누수를 막기 위해 LRU 방식으로 상한을 둔다.
const MAX_CACHE_SIZE = 500;
const questionCache = new Map<string, ClassificationResult>();

function getCached(key: string): ClassificationResult | undefined {
  const cached = questionCache.get(key);
  if (cached) {
    // 최근 사용 항목을 맨 뒤로 이동 (LRU 갱신)
    questionCache.delete(key);
    questionCache.set(key, cached);
  }
  return cached;
}

function setCached(key: string, value: ClassificationResult): void {
  if (questionCache.size >= MAX_CACHE_SIZE) {
    const oldest = questionCache.keys().next().value;
    if (oldest !== undefined) questionCache.delete(oldest);
  }
  questionCache.set(key, value);
}

export async function classifyQuestion(
  content: string,
  context?: string
): Promise<ClassificationResult> {
  const cacheKey = `${content}::${context ?? ""}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const model = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

    const fullPrompt = `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}${context ? `\n[맥락] ${context}` : ""}`;

    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();

    const parsed = parseClassificationResponse(text);
    if (parsed) {
      setCached(cacheKey, parsed);
      return parsed;
    }

    return fallbackClassification(content);
  } catch (error) {
    console.error("Gemini API error:", error);
    return fallbackClassification(content);
  }
}

export type { ClassificationResult };
