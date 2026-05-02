interface QuestionSummary {
  content: string;
  closure: string;
  cognitive: string;
}

function normalizeCognitive(value: string) {
  if (value === "conceptual" || value === "interpretive") return "conceptual";
  if (value === "controversial" || value === "evaluative" || value === "applicative") return "controversial";
  return "factual";
}

// 폐쇄형/개방형 × 인지적 수준의 2차원 조합별 답변 지침
const ANSWER_GUIDE: Record<string, Record<string, string>> = {
  factual: {
    closed:
      "사실적·폐쇄형: 핵심 사실을 간결하게 확인해 주세요. 마지막에 관련 원리나 비슷한 예시를 하나 덧붙여 이해를 자연스럽게 확장하세요.",
    open:
      "사실적·개방형: 여러 측면의 사실을 함께 제시하고, 어떤 부분이 더 궁금한지 생각해보도록 유도하는 문장으로 마무리하세요.",
  },
  conceptual: {
    closed:
      "개념적·폐쇄형: 이유나 원리를 단계적으로 설명하세요. '그렇다면 다른 상황에서는 어떨까요?'처럼 사고를 확장하는 질문으로 마무리하세요.",
    open:
      "개념적·개방형: 여러 가지 해석 가능성을 열어두고 설명하세요. 학생이 어떤 해석이 더 설득력 있다고 느끼는지 스스로 생각해보도록 격려하세요.",
  },
  controversial: {
    closed:
      "논쟁적·폐쇄형: 판단의 기준을 명확히 제시하되, 기준이 달라지면 답도 달라질 수 있음을 보여주세요. 학생 스스로 자신의 기준을 세워보도록 돕는 마무리를 포함하세요.",
    open:
      "논쟁적·개방형: 다양한 관점이 모두 가능함을 인정하고, 좋은 판단을 위해 어떤 기준을 고려해야 하는지 생각해보도록 유도하세요. 정답을 단정하지 마세요.",
  },
};

export function buildAnswerPrompt(
  question: string,
  closure?: string,
  cognitive?: string,
  context?: string
): string {
  const contextPart = context ? `\n[수업 맥락] ${context}` : "";

  const normalizedCognitive = normalizeCognitive(cognitive ?? "");
  const cogKey = ANSWER_GUIDE[normalizedCognitive] ? normalizedCognitive : null;
  const closureKey = closure === "closed" || closure === "open" ? closure : null;
  const combinedGuide =
    cogKey && closureKey ? ANSWER_GUIDE[cogKey][closureKey] : null;

  const guidePart = combinedGuide
    ? `\n[질문 유형 안내]\n${combinedGuide}`
    : "";

  return `당신은 초·중·고 교사를 돕는 교육 AI입니다. 학생이 수업 중에 제출한 질문에 대해 교사가 학생에게 댓글로 달아줄 답변을 작성해 주세요.

[공통 원칙]
- 학생 수준에 맞는 친절하고 명확한 언어 사용
- 150자 이내로 핵심만 간결하게
- 학생의 질문 유형에 맞는 방식으로 답변${guidePart}

[학생 질문]
${question}${contextPart}

답변:`;
}

export function buildSessionAnalysisPrompt(
  questions: QuestionSummary[],
  subject: string,
  topic: string
): string {
  const total = questions.length;
  const closedCount = questions.filter((q) => q.closure === "closed").length;
  const openCount = questions.filter((q) => q.closure === "open").length;
  const factualCount = questions.filter((q) => normalizeCognitive(q.cognitive) === "factual").length;
  const conceptualCount = questions.filter((q) => normalizeCognitive(q.cognitive) === "conceptual").length;
  const controversialCount = questions.filter((q) => normalizeCognitive(q.cognitive) === "controversial").length;

  const questionList =
    questions.length > 0
      ? questions.map((q, i) => `${i + 1}. [${q.closure === "closed" ? "폐쇄" : "개방"}·${
          normalizeCognitive(q.cognitive) === "factual" ? "사실" :
          normalizeCognitive(q.cognitive) === "conceptual" ? "개념" : "논쟁"
        }] ${q.content}`).join("\n")
      : "(질문 없음)";

  return `당신은 교사의 수업 분석을 도와주는 교육 전문 AI입니다. 아래 수업 세션에서 학생들이 제출한 ${total}개 질문을 분석해 주세요.

[수업 정보]
- 교과: ${subject}
- 주제: ${topic || "미지정"}
- 총 질문 수: ${total}개
- 폐쇄형 / 개방형: ${closedCount} / ${openCount}
- 사실적 / 개념적 / 논쟁적: ${factualCount} / ${conceptualCount} / ${controversialCount}

[질문 유형 기준]
- 폐쇄형: 정답이 하나인 확인형 질문
- 개방형: 다양한 답이 나올 수 있는 탐구형 질문
- 사실적: 사실·정보 확인
- 개념적: 추론·분석·비교
- 논쟁적: 판단·의견·가치 적용, 배운 내용을 삶·새 상황에 연결

[학생 질문 목록]
${questionList}

아래 JSON 형식으로만 응답하세요:
{
  "summary": "학생들이 어떤 내용에 관심을 가졌는지, 질문 유형 분포가 어떤 의미인지 2~3문장으로 요약",
  "themes": ["핵심 주제 키워드 3~5개"],
  "insights": "닫힌 질문 비율이 높으면 열린 질문 유도 전략을, 논쟁적 질문이 많으면 근거와 판단 기준을 세우는 활동을 제안하는 등 질문 분포에 맞는 다음 수업 방향 2~3문장"
}`;
}
