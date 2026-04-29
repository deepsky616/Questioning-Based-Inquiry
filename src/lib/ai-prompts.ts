interface QuestionSummary {
  content: string;
  closure: string;
  cognitive: string;
}

const COGNITIVE_GUIDE: Record<string, string> = {
  factual:
    "사실적 질문입니다. 정확한 사실·개념을 명확히 설명하고, 이해를 확인하는 마무리 문장을 포함하세요.",
  interpretive:
    "해석적 질문입니다. 이유·원리·관계를 설명하고, '왜 그럴까?' 생각을 유도하는 마무리 문장을 포함하세요.",
  evaluative:
    "평가적 질문입니다. 다양한 관점을 인정하면서 판단 기준이나 근거를 생각해보도록 유도하세요. 정답을 단정짓지 말고 학생 스스로 기준을 세우도록 돕는 마무리 문장을 포함하세요.",
  applicative:
    "적용적 질문입니다. 배운 내용을 실제 삶이나 새로운 상황에 연결하는 것을 격려하고, 상상력을 더 발휘하도록 유도하는 마무리 문장을 포함하세요. '만약 ~라면?' 형태의 추가 질문을 덧붙이면 좋습니다.",
};

const CLOSURE_GUIDE: Record<string, string> = {
  closed:
    "닫힌 질문(폐쇄형)입니다. 명확한 답을 제공하되, 비슷한 맥락에서 더 열린 방향으로 생각을 확장할 수 있는 힌트를 살짝 제시하세요.",
  open:
    "열린 질문(개방형)입니다. 다양한 답이 가능함을 인정하고, 학생의 창의적 사고를 격려하세요.",
};

export function buildAnswerPrompt(
  question: string,
  closure?: string,
  cognitive?: string,
  context?: string
): string {
  const contextPart = context ? `\n[수업 맥락] ${context}` : "";
  const cogGuide = cognitive ? COGNITIVE_GUIDE[cognitive] ?? "" : "";
  const closureGuide = closure ? CLOSURE_GUIDE[closure] ?? "" : "";
  const guidePart =
    cogGuide || closureGuide
      ? `\n[질문 유형 안내]\n${closureGuide}${cogGuide ? "\n" + cogGuide : ""}`
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
  const factualCount = questions.filter((q) => q.cognitive === "factual").length;
  const interpretiveCount = questions.filter((q) => q.cognitive === "interpretive").length;
  const evaluativeCount = questions.filter((q) => q.cognitive === "evaluative").length;
  const applicativeCount = questions.filter((q) => q.cognitive === "applicative").length;

  const questionList =
    questions.length > 0
      ? questions.map((q, i) => `${i + 1}. [${q.closure === "closed" ? "폐쇄" : "개방"}·${
          q.cognitive === "factual" ? "사실" :
          q.cognitive === "interpretive" ? "해석" :
          q.cognitive === "evaluative" ? "평가" : "적용"
        }] ${q.content}`).join("\n")
      : "(질문 없음)";

  return `당신은 교사의 수업 분석을 도와주는 교육 전문 AI입니다. 아래 수업 세션에서 학생들이 제출한 ${total}개 질문을 분석해 주세요.

[수업 정보]
- 교과: ${subject}
- 주제: ${topic || "미지정"}
- 총 질문 수: ${total}개
- 폐쇄형 / 개방형: ${closedCount} / ${openCount}
- 사실적 / 해석적 / 평가적 / 적용적: ${factualCount} / ${interpretiveCount} / ${evaluativeCount} / ${applicativeCount}

[질문 유형 기준]
- 폐쇄형: 정답이 하나인 확인형 질문
- 개방형: 다양한 답이 나올 수 있는 탐구형 질문
- 사실적: 사실·정보 확인
- 해석적: 추론·분석·비교
- 평가적: 판단·의견·가치 적용
- 적용적: 배운 내용을 삶·새 상황에 연결 ("만약 ~라면?" 형태)

[학생 질문 목록]
${questionList}

아래 JSON 형식으로만 응답하세요:
{
  "summary": "학생들이 어떤 내용에 관심을 가졌는지, 질문 유형 분포가 어떤 의미인지 2~3문장으로 요약",
  "themes": ["핵심 주제 키워드 3~5개"],
  "insights": "닫힌 질문 비율이 높으면 열린 질문 유도 전략을, 적용적 질문이 많으면 실생활 연계 활동을 제안하는 등 질문 분포에 맞는 다음 수업 방향 2~3문장"
}`;
}
