import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export interface ClassificationResult {
  closure: "closed" | "open";
  cognitive: "factual" | "interpretive" | "evaluative";
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
}

const CLASSIFICATION_PROMPT = `당신은 질문 유형 분류 전문가입니다. 다음 질문을 분석해주세요.

[분류 기준]
1. 페쇄형/개방형:
   - 페쇄형: "무엇", "언제", "몇", "어디", "누구"로 시작, 정답이 명확
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

const questionCache = new Map<string, ClassificationResult>();

export async function classifyQuestion(
  content: string,
  context?: string
): Promise<ClassificationResult> {
  const cacheKey = content.slice(0, 100);
  if (questionCache.has(cacheKey)) {
    return questionCache.get(cacheKey)!;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const fullPrompt = `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}${context ? `\n[맥락] ${context}` : ""}`;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const classification: ClassificationResult = {
        closure: parsed.closure,
        cognitive: parsed.cognitive,
        closureScore: parsed.closureScore,
        cognitiveScore: parsed.cognitiveScore,
        reasoning: parsed.reasoning,
      };
      questionCache.set(cacheKey, classification);
      return classification;
    }

    return fallbackClassification(content);
  } catch (error) {
    console.error("Gemini API error:", error);
    return fallbackClassification(content);
  }
}

function fallbackClassification(content: string): ClassificationResult {
  const closedKeywords = ["무엇", "언제", "몇", "어디", "누구", "얼마"];
  const openKeywords = ["왜", "어떻게", "무슨", "어떤", "그래서"];

  const factualKeywords = ["정의", "설명해", "알려줘", "뭐야"];
  const interpretiveKeywords = ["어떻게", "비교해", "분석해", "추론해"];
  const evaluativeKeywords = ["어떻게 생각해", "판단해", "평가해", "의견"];

  let closureScore = 0.5;
  let cognitiveScore = 0.5;
  let closure: "closed" | "open" = "open";
  let cognitive: "factual" | "interpretive" | "evaluative" = "factual";

  for (const kw of closedKeywords) {
    if (content.includes(kw)) {
      closureScore += 0.15;
      closure = "closed";
    }
  }

  for (const kw of openKeywords) {
    if (content.includes(kw)) {
      closureScore -= 0.15;
      closure = "open";
    }
  }

  for (const kw of evaluativeKeywords) {
    if (content.includes(kw)) {
      cognitiveScore += 0.2;
      cognitive = "evaluative";
    }
  }

  for (const kw of interpretiveKeywords) {
    if (content.includes(kw)) {
      cognitiveScore += 0.1;
      cognitive = "interpretive";
    }
  }

  closureScore = Math.max(0, Math.min(1, closureScore));
  cognitiveScore = Math.max(0, Math.min(1, cognitiveScore));

  return {
    closure,
    cognitive,
    closureScore,
    cognitiveScore,
    reasoning: "키워드 기반 자동 분류",
  };
}