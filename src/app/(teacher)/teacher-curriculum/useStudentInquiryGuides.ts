"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import { mergeGeneratedStudentGuides } from "@/lib/student-inquiry-guide";
import { normalizeStudentLearningGuides, type StudentLearningGuides } from "@/lib/student-learning-guide";
import type { InquiryQuestion } from "./types";

interface UseStudentInquiryGuidesOptions {
  questions: InquiryQuestion[];
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  setQuestions: Dispatch<SetStateAction<InquiryQuestion[]>>;
  generate: (step: string, extra: Record<string, unknown>) => Promise<unknown>;
  onSuccess: () => void;
  onError: () => void;
}

export function useStudentInquiryGuides({
  questions,
  coreIdea,
  coreSentences,
  essentialQuestions,
  setQuestions,
  generate,
  onSuccess,
  onError,
}: UseStudentInquiryGuidesOptions) {
  const [loadingStudentGuides, setLoadingStudentGuides] = useState(false);
  const [learningGuides, setLearningGuides] = useState<StudentLearningGuides | undefined>();

  const handleGenerateStudentGuides = async () => {
    const indexedQuestions = questions
      .map((question, originalIndex) => ({ question, originalIndex }))
      .filter(({ question }) => question.content.trim());
    if (indexedQuestions.length === 0) return;

    setLoadingStudentGuides(true);
    try {
      const result = await generate("learning_guides", {
        coreIdea,
        coreSentences,
        essentialQuestions,
        inquiryQuestions: indexedQuestions.map(({ question }) => ({
          type: question.type,
          content: question.content.trim(),
        })),
      });
      if (typeof result !== "object" || result === null) return;
      const guides = (result as { guides?: unknown }).guides;
      const nextLearningGuides = normalizeStudentLearningGuides((result as { learningGuides?: unknown }).learningGuides);
      if (nextLearningGuides) setLearningGuides(nextLearningGuides);
      if (!Array.isArray(guides) && !nextLearningGuides) return;

      if (Array.isArray(guides)) {
        const merged = mergeGeneratedStudentGuides(indexedQuestions.map(({ question }) => question), guides);
        const byOriginalIndex = new Map(indexedQuestions.map(({ originalIndex }, index) => [originalIndex, merged[index]]));
        setQuestions((previous) => previous.map((question, index) => byOriginalIndex.get(index) ?? question));
      }
      onSuccess();
    } catch {
      onError();
    } finally {
      setLoadingStudentGuides(false);
    }
  };

  const applyGeneratedLearningGuides = (value: unknown) => setLearningGuides(normalizeStudentLearningGuides(value));
  const clearLearningGuides = () => setLearningGuides(undefined);

  return {
    learningGuides,
    setLearningGuides,
    loadingStudentGuides,
    handleGenerateStudentGuides,
    applyGeneratedLearningGuides,
    clearLearningGuides,
  };
}
