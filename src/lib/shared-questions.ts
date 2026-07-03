export interface SharedQuestionItem {
  type?: string;
  content: string;
  contentGroup?: string;
  priority?: number;
  source?: "student" | "teacher";
  /** 비슷한 질문 묶기로 이 대표 질문에 합쳐진 학생 원본 질문들 */
  mergedFrom?: string[];
}

export interface NormalizedSharedQuestion {
  type: string;
  content: string;
  contentGroup: string;
  priority: number;
  source: "student" | "teacher";
  mergedFrom?: string[];
}

export const DEFAULT_GROUP = "수업 순서";

export function normalizeSharedQuestions(raw: SharedQuestionItem[]): NormalizedSharedQuestion[] {
  return raw.map((item, index) => {
    const mergedFrom = Array.isArray(item.mergedFrom)
      ? item.mergedFrom.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    return {
      type: item.type || "student",
      content: item.content,
      contentGroup: item.contentGroup?.trim() || DEFAULT_GROUP,
      priority: typeof item.priority === "number" ? item.priority : index + 1,
      source: item.source === "teacher" ? "teacher" : "student",
      ...(mergedFrom.length > 0 ? { mergedFrom } : {}),
    };
  });
}

export function groupSharedQuestions(
  items: SharedQuestionItem[],
): { group: string; questions: NormalizedSharedQuestion[] }[] {
  const normalized = normalizeSharedQuestions(items);
  const map = new Map<string, NormalizedSharedQuestion[]>();
  for (const q of normalized) {
    map.set(q.contentGroup, [...(map.get(q.contentGroup) ?? []), q]);
  }
  const groups = Array.from(map.entries()).map(([group, questions]) => ({
    group,
    questions: [...questions].sort((a, b) => a.priority - b.priority),
  }));
  groups.sort(
    (a, b) =>
      Math.min(...a.questions.map((q) => q.priority)) -
      Math.min(...b.questions.map((q) => q.priority)),
  );
  return groups;
}
