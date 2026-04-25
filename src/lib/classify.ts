import type { ClassificationResult } from "@/types/question";

export type ClosureType = "closed" | "open";
export type CognitiveType = "factual" | "interpretive" | "evaluative";

export function isValidClosureType(value: unknown): value is ClosureType {
  return value === "closed" || value === "open";
}

export function isValidCognitiveType(value: unknown): value is CognitiveType {
  return value === "factual" || value === "interpretive" || value === "evaluative";
}

export function parseClassificationResponse(text: string): ClassificationResult | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!isValidClosureType(parsed.closure)) return null;
    if (!isValidCognitiveType(parsed.cognitive)) return null;

    const closureScore = Number(parsed.closureScore);
    const cognitiveScore = Number(parsed.cognitiveScore);

    if (isNaN(closureScore) || closureScore < 0 || closureScore > 1) return null;
    if (isNaN(cognitiveScore) || cognitiveScore < 0 || cognitiveScore > 1) return null;

    return {
      closure: parsed.closure,
      cognitive: parsed.cognitive,
      closureScore,
      cognitiveScore,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return null;
  }
}

export function fallbackClassification(content: string): ClassificationResult {
  const closedKeywords = ["무엇", "언제", "몇", "어디", "누구", "얼마"];
  const openKeywords = ["왜", "어떻게", "무슨", "어떤", "그래서"];

  const factualKeywords = ["정의", "설명해", "알려줘", "뭐야"];
  const interpretiveKeywords = ["비교해", "분석해", "추론해"];
  const evaluativeKeywords = ["어떻게 생각해", "판단해", "평가해", "의견"];

  let closedCount = 0;
  let openCount = 0;

  for (const kw of closedKeywords) {
    if (content.includes(kw)) closedCount++;
  }
  for (const kw of openKeywords) {
    if (content.includes(kw)) openCount++;
  }

  // 점수: closed가 많으면 1 방향, open이 많으면 0 방향
  const closureScore = Math.max(
    0,
    Math.min(1, 0.5 + (closedCount - openCount) * 0.15)
  );
  const closure: ClosureType = closureScore > 0.5 ? "closed" : "open";

  // 인지 수준 결정 (evaluative > interpretive > factual 우선순위)
  let cognitive: CognitiveType = "factual";
  let cognitiveScore = 0.5;

  for (const kw of factualKeywords) {
    if (content.includes(kw)) {
      cognitiveScore = Math.min(1, cognitiveScore + 0.1);
    }
  }

  for (const kw of interpretiveKeywords) {
    if (content.includes(kw)) {
      cognitive = "interpretive";
      cognitiveScore = Math.min(1, cognitiveScore + 0.1);
    }
  }

  // evaluative는 interpretive보다 나중에 확인해 우선순위를 가짐
  for (const kw of evaluativeKeywords) {
    if (content.includes(kw)) {
      cognitive = "evaluative";
      cognitiveScore = Math.min(1, cognitiveScore + 0.2);
    }
  }

  return {
    closure,
    cognitive,
    closureScore,
    cognitiveScore,
    reasoning: "키워드 기반 자동 분류",
  };
}
