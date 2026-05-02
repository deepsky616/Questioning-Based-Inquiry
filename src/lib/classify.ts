import type { ClassificationResult } from "@/types/question";

export type ClosureType = "closed" | "open";
export type CognitiveType = "factual" | "conceptual" | "controversial";

export function isValidClosureType(value: unknown): value is ClosureType {
  return value === "closed" || value === "open";
}

export function isValidCognitiveType(value: unknown): value is CognitiveType {
  return (
    value === "factual" ||
    value === "conceptual" ||
    value === "controversial"
  );
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
      ...(typeof parsed.feedback === "string" ? { feedback: parsed.feedback } : {}),
    };
  } catch {
    return null;
  }
}

export function fallbackClassification(content: string): ClassificationResult {
  // "무슨"/"어떤"은 폐쇄형("무슨 색이에요?")과 개방형("어떤 방법이 좋을까?") 모두에 나타나므로 제외
  const closedKeywords = ["무엇", "언제", "몇", "어디", "누구", "얼마"];
  const openKeywords = ["왜", "어떻게"];

  const factualKeywords = ["정의", "설명해", "알려줘", "뭐야", "무엇인가"];
  const conceptualKeywords = ["비교해", "분석해", "추론해", "차이", "왜냐면"];
  const controversialKeywords = [
    "어떻게 생각해",
    "판단해",
    "평가해",
    "의견",
    "가장 좋은",
    "더 나은",
    "만약",
    "라면",
    "내가",
    "나라면",
    "적용",
    "내 삶",
    "실제로",
    "활용",
  ];

  let closedCount = 0;
  let openCount = 0;

  for (const kw of closedKeywords) {
    if (content.includes(kw)) closedCount++;
  }
  for (const kw of openKeywords) {
    if (content.includes(kw)) openCount++;
  }

  const closureScore = Math.max(0, Math.min(1, 0.5 + (closedCount - openCount) * 0.15));
  const closure: ClosureType = closureScore > 0.5 ? "closed" : "open";

  let cognitive: CognitiveType = "factual";
  let cognitiveScore = 0.5;

  for (const kw of factualKeywords) {
    if (content.includes(kw)) cognitiveScore = Math.min(1, cognitiveScore + 0.1);
  }
  for (const kw of conceptualKeywords) {
    if (content.includes(kw)) { cognitive = "conceptual"; cognitiveScore = Math.min(1, cognitiveScore + 0.1); }
  }
  for (const kw of controversialKeywords) {
    if (content.includes(kw)) { cognitive = "controversial"; cognitiveScore = Math.min(1, cognitiveScore + 0.2); }
  }

  const feedbackMap: Record<string, Record<string, string>> = {
    closed: {
      factual: "정답이 하나인 닫힌 질문입니다. '왜' 또는 '어떻게'로 바꾸면 다양한 생각을 이끌어내는 열린 질문이 됩니다.",
      conceptual: "'왜 그럴까요?'처럼 이유와 과정을 탐색하는 형태로 바꾸면 더 깊은 이해를 이끌어낼 수 있습니다.",
      controversial: "판단과 적용을 묻는 질문입니다. 열린 형태로 바꾸면 더 다양한 관점의 의견을 이끌어낼 수 있습니다.",
    },
    open: {
      factual: "열린 질문입니다. '왜' 또는 '어떻게'를 추가해 이유와 과정까지 탐구해보세요.",
      conceptual: "훌륭한 개념적 질문입니다! 구체적인 비교 대상이나 관점을 추가하면 더욱 풍부해집니다.",
      controversial: "훌륭한 논쟁적 질문입니다! 판단의 기준을 함께 제시하면 더 깊은 논의가 가능해집니다.",
    },
  };

  return {
    closure,
    cognitive,
    closureScore,
    cognitiveScore,
    reasoning: "키워드 기반 자동 분류",
    feedback: feedbackMap[closure][cognitive],
  };
}
