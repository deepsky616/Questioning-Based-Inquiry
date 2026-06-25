export const CLOSURE_LABEL: Record<string, string> = {
  closed: "닫힌 질문",
  open: "열린 질문",
};

export const CLOSURE_STYLE: Record<string, string> = {
  closed: "bg-blue-100 text-blue-700",
  open: "bg-green-100 text-green-700",
};

export const COGNITIVE_LABEL: Record<string, string> = {
  factual: "사실적 질문",
  conceptual: "개념적 질문",
  controversial: "논쟁적 질문",
};

export const COGNITIVE_STYLE: Record<string, string> = {
  factual: "bg-gray-100 text-gray-700",
  conceptual: "bg-purple-100 text-purple-700",
  controversial: "bg-orange-100 text-orange-700",
};

export const COGNITIVE_CATEGORIES = [
  { value: "factual", label: "사실적 질문", values: ["factual"] },
  { value: "conceptual", label: "개념적 질문", values: ["conceptual"] },
  { value: "controversial", label: "논쟁적 질문", values: ["controversial"] },
] as const;

export function normalizeCognitiveType(value: string | null | undefined): "factual" | "conceptual" | "controversial" {
  if (value === "conceptual") return "conceptual";
  if (value === "controversial") return "controversial";
  return "factual";
}

export function matchesCognitiveCategory(value: string, category: string): boolean {
  return normalizeCognitiveType(value) === category;
}
