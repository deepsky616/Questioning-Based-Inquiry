export interface StudentInquiryKeyword {
  term: string;
  meaning: string;
}

export interface StudentInquiryGuide {
  meaning: string;
  keywords: StudentInquiryKeyword[];
  thinkingStart: string;
}

export interface GeneratedStudentInquiryGuide extends StudentInquiryGuide {
  index: number;
}

export const EMPTY_STUDENT_INQUIRY_GUIDE: StudentInquiryGuide = {
  meaning: "",
  keywords: [],
  thinkingStart: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeStudentInquiryGuide(value: unknown): StudentInquiryGuide | undefined {
  if (!isRecord(value)) return undefined;

  const meaning = typeof value.meaning === "string" ? value.meaning.trim().slice(0, 500) : "";
  const thinkingStart = typeof value.thinkingStart === "string"
    ? value.thinkingStart.trim().slice(0, 500)
    : "";
  const keywords = Array.isArray(value.keywords)
    ? value.keywords
        .filter(isRecord)
        .map((keyword) => ({
          term: typeof keyword.term === "string" ? keyword.term.trim().slice(0, 80) : "",
          meaning: typeof keyword.meaning === "string" ? keyword.meaning.trim().slice(0, 240) : "",
        }))
        .filter((keyword) => keyword.term)
        .slice(0, 5)
    : [];

  if (!meaning && keywords.length === 0 && !thinkingStart) return undefined;
  return { meaning, keywords, thinkingStart };
}

export function parseInquiryKeywordLines(value: string): StudentInquiryKeyword[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colonIndex = line.indexOf(":");
      const dashMatch = line.match(/\s+-\s+/);
      const separatorIndex = colonIndex >= 0 ? colonIndex : dashMatch?.index ?? -1;
      const separatorLength = colonIndex >= 0 ? 1 : dashMatch?.[0].length ?? 0;
      if (separatorIndex < 0) return { term: line.slice(0, 80), meaning: "" };
      return {
        term: line.slice(0, separatorIndex).trim().slice(0, 80),
        meaning: line.slice(separatorIndex + separatorLength).trim().slice(0, 240),
      };
    })
    .filter((keyword) => keyword.term)
    .slice(0, 5);
}

export function formatInquiryKeywordLines(keywords: StudentInquiryKeyword[] | undefined): string {
  return (keywords ?? [])
    .map((keyword) => `${keyword.term}${keyword.meaning ? `: ${keyword.meaning}` : ""}`)
    .join("\n");
}

export function mergeGeneratedStudentGuides<T extends object>(
  questions: T[],
  value: unknown,
): Array<T & { studentGuide?: StudentInquiryGuide }> {
  if (!Array.isArray(value)) return questions;
  const guides = new Map<number, StudentInquiryGuide>();
  for (const candidate of value) {
    if (!isRecord(candidate) || !Number.isInteger(candidate.index)) continue;
    const guide = normalizeStudentInquiryGuide(candidate);
    if (guide) guides.set(candidate.index as number, guide);
  }
  return questions.map((question, index) => {
    const guide = guides.get(index);
    return guide ? { ...question, studentGuide: guide } : question;
  });
}
