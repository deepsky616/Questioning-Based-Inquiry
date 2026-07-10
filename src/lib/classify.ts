import type { ClassificationResult } from "@/types/question";

// 질문 분류 공용 프롬프트 — /api/classify와 /api/points/practice(연습 판정)가 함께 쓴다
export const CLASSIFICATION_PROMPT = `당신은 초·중·고 수업에서 학생 질문을 분류하고 더 좋은 질문을 만들도록 돕는 선생님입니다.

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
      inappropriate: parsed.inappropriate === true,
      inappropriateReason: typeof parsed.inappropriateReason === "string" ? parsed.inappropriateReason : "",
    };
  } catch {
    return null;
  }
}

export function fallbackClassification(content: string): ClassificationResult {
  // "무슨"/"어떤"은 닫힌 질문("무슨 색이에요?")과 열린 질문("어떤 방법이 좋을까?") 모두에 나타나므로 제외
  const closedKeywords = ["무엇", "언제", "몇", "어디", "누구", "얼마"];
  const openKeywords = ["왜", "어떻게"];

  const factualKeywords = ["정의", "설명해", "알려줘", "뭐야", "무엇인가"];
  const conceptualKeywords = ["비교해", "분석해", "추론해", "차이", "왜냐면", "관계", "원리"];
  const controversialKeywords = ["어떻게 생각해", "판단해", "평가해", "의견", "가장 좋은", "더 나은", "찬성", "반대"];

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
      conceptual: "'왜 그럴까요?'처럼 이유와 관계를 탐색하는 형태로 바꾸면 더 깊은 이해를 이끌어낼 수 있습니다.",
      controversial: "판단을 묻는 질문입니다. 열린 형태로 바꾸면 더 다양한 관점의 의견을 이끌어낼 수 있습니다.",
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
    inappropriate: false,
    inappropriateReason: "",
  };
}
