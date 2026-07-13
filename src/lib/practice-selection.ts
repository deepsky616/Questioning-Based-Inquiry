import type { PracticeFocus } from "@/lib/practice-diagnostics";
import type { PracticeQuizItem } from "@/lib/question-practice-data";

export interface PracticeSelection {
  tab: "quiz" | "transform" | "create";
  quizMode: "closure" | "cognitive";
  focus: PracticeFocus | null;
}

export function parsePracticeSelection(
  params: Pick<URLSearchParams, "get">,
): PracticeSelection {
  const tab = params.get("tab");
  const quizMode = params.get("quizMode");
  const focus = params.get("focus");
  const safeTab = tab === "transform" || tab === "create" ? tab : "quiz";
  const safeQuizMode = quizMode === "closure" ? "closure" : "cognitive";
  let safeFocus: PracticeFocus | null = null;

  if (safeQuizMode === "closure" && (focus === "closed" || focus === "open")) {
    safeFocus = focus;
  }
  if (
    safeQuizMode === "cognitive" &&
    (focus === "factual" || focus === "conceptual" || focus === "controversial")
  ) {
    safeFocus = focus;
  }

  return {
    tab: safeTab,
    quizMode: safeQuizMode,
    focus: safeTab === "quiz" ? safeFocus : null,
  };
}

export function practiceSelectionSearch(selection: PracticeSelection): string {
  const params = new URLSearchParams({
    tab: selection.tab,
    quizMode: selection.quizMode,
  });
  if (selection.focus) params.set("focus", selection.focus);
  return params.toString();
}

export function focusedPracticeQuizBank<
  T extends Pick<PracticeQuizItem, "closure" | "cognitive">,
>(
  bank: readonly T[],
  quizMode: PracticeSelection["quizMode"],
  focus: PracticeFocus | null,
): readonly T[] {
  if (!focus) return bank;
  const filtered = bank.filter((item) =>
    quizMode === "closure" ? item.closure === focus : item.cognitive === focus,
  );
  return filtered.length > 0 ? filtered : bank;
}
