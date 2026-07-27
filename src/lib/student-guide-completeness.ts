import {
  normalizeStudentLearningGuides,
  type StudentCoreIdeaGuide,
  type StudentLearningGuides,
} from "@/lib/student-learning-guide";
import {
  normalizeStudentInquiryGuide,
  type GeneratedStudentInquiryGuide,
} from "@/lib/student-inquiry-guide";

export interface StudentGuideExpectedCounts {
  achievementCount?: number;
  coreSentenceCount: number;
  essentialQuestionCount: number;
  inquiryQuestionCount: number;
}

export type CompleteStudentLearningGuides = StudentLearningGuides & { coreIdea: StudentCoreIdeaGuide };
export type CompleteStudentGuideBundle = {
  learningGuides: CompleteStudentLearningGuides;
  guides: GeneratedStudentInquiryGuide[];
};
export type StudentGuideValidationResult =
  | { ok: true; value: CompleteStudentGuideBundle }
  | { ok: false; issues: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasTooManyRawKeywords = (value: unknown, maximum: number) =>
  isRecord(value) && Array.isArray(value.keywords) && value.keywords.length > maximum;

const hasUniqueTermsWithMeanings = (
  keywords: Array<{ term: string; meaning: string }>,
  minimum: number,
  maximum: number,
) => {
  const terms = keywords.map((item) => item.term.trim().toLocaleLowerCase());
  return keywords.length >= minimum
    && keywords.length <= maximum
    && keywords.every((item) => item.term.trim() && item.meaning.trim())
    && new Set(terms).size === terms.length;
};

const hasExactIndexes = (items: Array<{ index: number }>, count: number) =>
  items.length === count
  && items.map((item) => item.index).sort((a, b) => a - b).every((index, position) => index === position);

export function validateStudentGuideBundle(
  value: unknown,
  expected: StudentGuideExpectedCounts,
): StudentGuideValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ["응답이 객체가 아닙니다."] };

  const learningGuides = normalizeStudentLearningGuides(value.learningGuides);
  const coreIdea = learningGuides?.coreIdea;
  const rawCoreIdea = isRecord(value.learningGuides)
    ? value.learningGuides.coreIdea
    : undefined;
  if (!coreIdea?.explanation || !coreIdea.lifeConnection) issues.push("핵심 아이디어 설명이 빠졌습니다.");
  if (
    !coreIdea
    || hasTooManyRawKeywords(rawCoreIdea, 5)
    || !hasUniqueTermsWithMeanings(coreIdea.keywords, 3, 5)
  ) {
    issues.push("핵심 아이디어 핵심 낱말은 서로 다른 3~5개이며 뜻이 있어야 합니다.");
  }
  const achievementCount = expected.achievementCount ?? 0;
  if (!learningGuides || !hasExactIndexes(learningGuides.achievements, achievementCount)) {
    issues.push("모든 성취기준의 쉬운 설명과 번호가 필요합니다.");
  }
  if (!learningGuides || learningGuides.achievements.some((item) => !item.explanation.trim())) {
    issues.push("성취기준 쉬운 설명이 비어 있습니다.");
  }
  if (!learningGuides || !hasExactIndexes(learningGuides.coreSentences, expected.coreSentenceCount)) {
    issues.push("모든 핵심 문장의 쉬운 설명과 번호가 필요합니다.");
  }
  if (!learningGuides || learningGuides.coreSentences.some((item) => !item.explanation.trim())) {
    issues.push("핵심 문장 쉬운 설명이 비어 있습니다.");
  }
  if (!learningGuides || !hasExactIndexes(learningGuides.essentialQuestions, expected.essentialQuestionCount)) {
    issues.push("모든 핵심 질문의 설명과 번호가 필요합니다.");
  }
  if (!learningGuides || learningGuides.essentialQuestions.some((item) =>
    !item.thinkingFocus.trim() || item.perspectives.length < 2 || item.perspectives.length > 3
  )) issues.push("핵심 질문마다 생각할 범위와 관점 2~3개가 필요합니다.");

  const rawGuides = Array.isArray(value.guides) ? value.guides : [];
  const guides = Array.isArray(value.guides)
    ? value.guides.flatMap((candidate) => {
        if (!isRecord(candidate) || !Number.isInteger(candidate.index)) return [];
        const guide = normalizeStudentInquiryGuide(candidate);
        return guide ? [{ index: candidate.index as number, ...guide }] : [];
      })
    : [];
  if (!hasExactIndexes(guides, expected.inquiryQuestionCount)) {
    issues.push("모든 탐구 질문의 학생용 설명과 번호가 필요합니다.");
  }
  if (
    rawGuides.some((candidate) => hasTooManyRawKeywords(candidate, 5))
    || guides.some((guide) =>
      !guide.meaning.trim()
      || !guide.thinkingStart.trim()
      || !hasUniqueTermsWithMeanings(guide.keywords, 2, 5)
    )
  ) issues.push("탐구 질문마다 뜻, 생각 단서, 서로 다른 핵심 낱말 2~5개가 필요합니다.");

  if (issues.length > 0 || !learningGuides || !coreIdea) return { ok: false, issues };
  return { ok: true, value: { learningGuides: { ...learningGuides, coreIdea }, guides } };
}

export function buildStudentGuideRepairPrompt(
  originalPrompt: string,
  rawResponse: string,
  issues: string[],
): string {
  return `${originalPrompt}\n\n이전 응답은 아래 검사를 통과하지 못했습니다.\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\n이전 응답:\n${rawResponse.slice(0, 12000)}\n\n모든 항목을 빠짐없이 고쳐 완전한 JSON 객체만 다시 출력하세요.`;
}
