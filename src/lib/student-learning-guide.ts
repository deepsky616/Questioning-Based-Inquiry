import type { StudentInquiryKeyword } from "@/lib/student-inquiry-guide";

export interface StudentCoreIdeaGuide {
  explanation: string;
  lifeConnection: string;
  keywords: StudentInquiryKeyword[];
}

export interface StudentCoreSentenceGuide {
  index: number;
  explanation: string;
}

export interface StudentAchievementGuide {
  index: number;
  explanation: string;
}

export interface StudentEssentialQuestionGuide {
  index: number;
  thinkingFocus: string;
  perspectives: string[];
}

export interface StudentLearningGuides {
  coreIdea?: StudentCoreIdeaGuide;
  achievements?: StudentAchievementGuide[];
  coreSentences: StudentCoreSentenceGuide[];
  essentialQuestions: StudentEssentialQuestionGuide[];
}

export const EMPTY_STUDENT_LEARNING_GUIDES: StudentLearningGuides = {
  achievements: [],
  coreSentences: [],
  essentialQuestions: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKeywords(value: unknown): StudentInquiryKeyword[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((keyword) => ({
      term: typeof keyword.term === "string" ? keyword.term.trim().slice(0, 80) : "",
      meaning: typeof keyword.meaning === "string" ? keyword.meaning.trim().slice(0, 240) : "",
    }))
    .filter((keyword) => keyword.term)
    .slice(0, 5);
}

export function normalizeStudentLearningGuides(value: unknown): StudentLearningGuides | undefined {
  if (!isRecord(value)) return undefined;

  let coreIdea: StudentCoreIdeaGuide | undefined;
  if (isRecord(value.coreIdea)) {
    const explanation = typeof value.coreIdea.explanation === "string"
      ? value.coreIdea.explanation.trim().slice(0, 500)
      : "";
    const lifeConnection = typeof value.coreIdea.lifeConnection === "string"
      ? value.coreIdea.lifeConnection.trim().slice(0, 500)
      : "";
    const keywords = normalizeKeywords(value.coreIdea.keywords);
    if (explanation || lifeConnection || keywords.length > 0) {
      coreIdea = { explanation, lifeConnection, keywords };
    }
  }

  const achievements = Array.isArray(value.achievements)
    ? value.achievements
        .filter(isRecord)
        .map((guide) => ({
          index: typeof guide.index === "number" ? guide.index : -1,
          explanation: typeof guide.explanation === "string" ? guide.explanation.trim().slice(0, 500) : "",
        }))
        .filter((guide) => Number.isInteger(guide.index) && guide.index >= 0 && guide.explanation)
        .slice(0, 30)
    : [];

  const coreSentences = Array.isArray(value.coreSentences)
    ? value.coreSentences
        .filter(isRecord)
        .map((guide) => ({
          index: typeof guide.index === "number" ? guide.index : -1,
          explanation: typeof guide.explanation === "string" ? guide.explanation.trim().slice(0, 500) : "",
        }))
        .filter((guide) => Number.isInteger(guide.index) && guide.index >= 0 && guide.explanation)
        .slice(0, 20)
    : [];

  const essentialQuestions = Array.isArray(value.essentialQuestions)
    ? value.essentialQuestions
        .filter(isRecord)
        .map((guide) => ({
          index: typeof guide.index === "number" ? guide.index : -1,
          thinkingFocus: typeof guide.thinkingFocus === "string" ? guide.thinkingFocus.trim().slice(0, 500) : "",
          perspectives: Array.isArray(guide.perspectives)
            ? guide.perspectives
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim().slice(0, 80))
                .filter(Boolean)
                .slice(0, 3)
            : [],
        }))
        .filter((guide) => Number.isInteger(guide.index) && guide.index >= 0 && (guide.thinkingFocus || guide.perspectives.length > 0))
        .slice(0, 20)
    : [];

  if (!coreIdea && achievements.length === 0 && coreSentences.length === 0 && essentialQuestions.length === 0) {
    return undefined;
  }
  return {
    ...(coreIdea ? { coreIdea } : {}),
    ...(achievements.length > 0 ? { achievements } : {}),
    coreSentences,
    essentialQuestions,
  };
}

export function removeIndexedStudentLearningGuide(
  value: StudentLearningGuides | undefined,
  kind: "coreSentences" | "essentialQuestions",
  removedIndex: number,
): StudentLearningGuides | undefined {
  if (!value) return undefined;
  const next = {
    ...value,
    [kind]: value[kind]
      .filter((guide) => guide.index !== removedIndex)
      .map((guide) => guide.index > removedIndex ? { ...guide, index: guide.index - 1 } : guide),
  };
  return normalizeStudentLearningGuides(next);
}

export function remapStudentLearningGuides(
  value: StudentLearningGuides | undefined,
  coreSentenceSourceIndexes: number[],
  essentialQuestionSourceIndexes: number[],
): StudentLearningGuides | undefined {
  if (!value) return undefined;
  const sentenceIndexes = new Map(coreSentenceSourceIndexes.map((sourceIndex, index) => [sourceIndex, index]));
  const questionIndexes = new Map(essentialQuestionSourceIndexes.map((sourceIndex, index) => [sourceIndex, index]));
  return normalizeStudentLearningGuides({
    ...value,
    coreSentences: value.coreSentences.flatMap((guide) => {
      const index = sentenceIndexes.get(guide.index);
      return index === undefined ? [] : [{ ...guide, index }];
    }),
    essentialQuestions: value.essentialQuestions.flatMap((guide) => {
      const index = questionIndexes.get(guide.index);
      return index === undefined ? [] : [{ ...guide, index }];
    }),
  });
}
