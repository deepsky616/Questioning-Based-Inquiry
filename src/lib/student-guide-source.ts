import type { InquiryQuestion } from "@/app/(teacher)/teacher-curriculum/types";

export interface StudentGuideSourceInput {
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: Pick<InquiryQuestion, "type" | "content">[];
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function withSelectedCoreIdea<T extends object>(
  payload: T,
  selectedCoreIdeaLines: string[],
): T & { coreIdea: string } {
  return { ...payload, coreIdea: selectedCoreIdeaLines.join("\n") };
}

export function buildStudentGuideSourceSignature(input: StudentGuideSourceInput): string {
  return JSON.stringify({
    coreIdea: clean(input.coreIdea),
    coreSentences: input.coreSentences.map(clean),
    essentialQuestions: input.essentialQuestions.map(clean),
    inquiryQuestions: input.inquiryQuestions
      .filter((question) => clean(question.content))
      .map((question) => ({ type: question.type, content: clean(question.content) })),
  });
}
