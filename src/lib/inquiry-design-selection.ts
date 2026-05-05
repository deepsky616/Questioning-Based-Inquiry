export type InquiryQuestionType = "factual" | "conceptual" | "controversial";

export interface InquiryQuestionSelectionItem {
  type: InquiryQuestionType;
  content: string;
}

export const INQUIRY_GENERATION_TARGETS: Record<
  InquiryQuestionType,
  { min: number; max: number }
> = {
  factual: { min: 3, max: 4 },
  conceptual: { min: 3, max: 4 },
  controversial: { min: 2, max: 2 },
};

export function selectAllIndices<T>(items: T[]): number[] {
  return items.map((_, index) => index);
}

export function toggleSelectedIndex(selectedIndices: number[], index: number): number[] {
  if (selectedIndices.includes(index)) {
    return selectedIndices.filter((selectedIndex) => selectedIndex !== index);
  }
  return [...selectedIndices, index].sort((a, b) => a - b);
}

export function filterSelectedTexts(items: string[], selectedIndices: number[]): string[] {
  const selected = new Set(selectedIndices);
  return items
    .map((item, index) => ({ item: item.trim(), index }))
    .filter(({ item, index }) => item.length > 0 && selected.has(index))
    .map(({ item }) => item);
}

export function filterSelectedInquiryQuestions<T extends InquiryQuestionSelectionItem>(
  items: T[],
  selectedIndices: number[],
): T[] {
  const selected = new Set(selectedIndices);
  return items
    .map((item, index) => ({
      item: { ...item, content: item.content.trim() },
      index,
    }))
    .filter(({ item, index }) => item.content.length > 0 && selected.has(index))
    .map(({ item }) => item);
}

export function countInquiryQuestionsByType(
  items: InquiryQuestionSelectionItem[],
): Record<InquiryQuestionType, number> {
  return items.reduce<Record<InquiryQuestionType, number>>(
    (counts, item) => {
      counts[item.type] += item.content.trim() ? 1 : 0;
      return counts;
    },
    { factual: 0, conceptual: 0, controversial: 0 },
  );
}

