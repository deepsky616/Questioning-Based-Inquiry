export const UNCLASSIFIABLE_QUESTION_CODE = "UNCLASSIFIABLE_QUESTION";

/** 짧은 질문이나 수식은 허용하고, 뜻을 읽을 수 없는 입력만 걸러낸다. */
export function getQuestionContentIssue(content: string): string | null {
  const compact = content.normalize("NFKC")
    .replace(/[\p{Cf}\p{Z}\p{P}\p{S}\s]/gu, "");
  const readable = compact.replace(/[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]/gu, "");
  if (!/[\p{L}\p{N}]/u.test(readable)) {
    return "질문으로 분류할 수 없어요. 웃음 표시나 기호 대신 무엇이 궁금한지 적어 주세요. 예: 물은 왜 증발하나요?";
  }
  if (/^(\p{L}{1,3})\1{3,}$/u.test(compact)) {
    return "같은 글자만 반복하면 질문으로 분류할 수 없어요. 무엇을 알고 싶은지 한 문장으로 적어 주세요.";
  }
  return null;
}

export function isUnclassifiedQuestion(question: { closure?: string | null; cognitive?: string | null }): boolean {
  return question.closure === "unclassified" || question.cognitive === "unclassified";
}
