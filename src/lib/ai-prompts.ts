interface QuestionSummary {
  content: string;
  closure: string;
  cognitive: string;
}

export function buildAnswerPrompt(question: string, context?: string): string {
  const contextPart = context ? `\n[수업 맥락] ${context}` : "";
  return `당신은 초·중·고 교사를 돕는 교육 AI입니다. 학생이 수업 중에 제출한 질문에 대해 교사가 학생에게 댓글로 달아줄 답변을 작성해 주세요.

[답변 원칙]
- 학생 수준에 맞는 친절하고 명확한 언어 사용
- 150자 이내로 핵심만 간결하게
- 추가 탐구를 유도하는 마무리 문장 포함

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

  const questionList =
    questions.length > 0
      ? questions.map((q, i) => `${i + 1}. ${q.content}`).join("\n")
      : "(질문 없음)";

  return `당신은 교사의 수업 분석을 도와주는 교육 전문 AI입니다. 아래 수업 세션에서 학생들이 제출한 ${total}개 질문을 분석해 주세요.

[수업 정보]
- 교과: ${subject}
- 주제: ${topic || "미지정"}
- 총 질문 수: ${total}개
- 폐쇄형/개방형: ${closedCount}/${openCount}
- 사실적/해석적/평가적: ${factualCount}/${interpretiveCount}/${evaluativeCount}

[학생 질문 목록]
${questionList}

아래 JSON 형식으로만 응답하세요:
{
  "summary": "학생들이 어떤 내용에 관심을 가졌는지 2~3문장으로 요약",
  "themes": ["핵심 주제 키워드 3~5개"],
  "insights": "이 질문 분포가 교사에게 주는 시사점 및 다음 수업 제안 (2~3문장)"
}`;
}
