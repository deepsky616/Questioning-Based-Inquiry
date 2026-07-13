export type PracticeQuizType = "closure" | "cognitive";
export type PracticeTargetType = "open" | "conceptual" | "controversial";

const QUIZ_REASON_LABELS: Record<PracticeQuizType, string> = {
  closure: "닫힌 질문·열린 질문 분류 정답",
  cognitive: "사실적·개념적·논쟁적 질문 분류 정답",
};

const TARGET_LABELS: Record<PracticeTargetType, string> = {
  open: "열린 질문",
  conceptual: "개념적 질문",
  controversial: "논쟁적 질문",
};

export function practiceQuizPointReason(quizType: PracticeQuizType): string {
  return `질문 연습: ${QUIZ_REASON_LABELS[quizType]}`;
}

export function practiceTransformPointReason(target: PracticeTargetType, aiGenerated = false): string {
  return `질문 연습: ${TARGET_LABELS[target]}으로 바꾸기 성공${aiGenerated ? " (인공지능 출제)" : ""}`;
}

export function practiceCreatePointReason(target: PracticeTargetType, aiGenerated = false): string {
  return `질문 연습: ${TARGET_LABELS[target]} 만들기 성공${aiGenerated ? " (인공지능 출제)" : ""}`;
}

function legacyTargetFromReason(value: string): PracticeTargetType | null {
  if (value.includes("/open)")) return "open";
  if (value.includes("/conceptual)")) return "conceptual";
  if (value.includes("/controversial)")) return "controversial";
  return null;
}

export function normalizePointReasonForDisplay(reason: string | null | undefined): string {
  const value = (reason ?? "").trim();
  if (!value) return "";

  if (value.startsWith("질문 연습: 분류 정답 (")) {
    if (value.includes("/closure)")) return practiceQuizPointReason("closure");
    if (value.includes("/cognitive)")) return practiceQuizPointReason("cognitive");
  }

  if (value.startsWith("질문 연습: 질문 바꾸기 성공 (")) {
    return value.includes("AI 출제") || value.includes("인공지능 출제")
      ? "질문 연습: 질문 바꾸기 성공 (인공지능 출제)"
      : "질문 연습: 질문 바꾸기 성공";
  }

  if (value.startsWith("질문 연습: 질문 만들기 성공 (")) {
    const target = legacyTargetFromReason(value);
    if (target) return practiceCreatePointReason(target);
    return value.includes("AI 출제") || value.includes("인공지능 출제")
      ? "질문 연습: 질문 만들기 성공 (인공지능 출제)"
      : "질문 연습: 질문 만들기 성공";
  }

  return value;
}
