"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import { mergeGeneratedStudentGuides } from "@/lib/student-inquiry-guide";
import type { InquiryQuestion } from "./types";

interface UseStudentInquiryGuidesOptions {
  questions: InquiryQuestion[];
  setQuestions: Dispatch<SetStateAction<InquiryQuestion[]>>;
  generate: (step: string, extra: Record<string, unknown>) => Promise<unknown>;
  onSuccess: () => void;
  onError: () => void;
}

export function useStudentInquiryGuides({
  questions,
  setQuestions,
  generate,
  onSuccess,
  onError,
}: UseStudentInquiryGuidesOptions) {
  const [loadingStudentGuides, setLoadingStudentGuides] = useState(false);

  const handleGenerateStudentGuides = async () => {
    const indexedQuestions = questions
      .map((question, originalIndex) => ({ question, originalIndex }))
      .filter(({ question }) => question.content.trim());
    if (indexedQuestions.length === 0) return;

    setLoadingStudentGuides(true);
    try {
      const result = await generate("student_guides", {
        inquiryQuestions: indexedQuestions.map(({ question }) => ({
          type: question.type,
          content: question.content.trim(),
        })),
      });
      if (typeof result !== "object" || result === null || !("guides" in result)) return;
      const guides = (result as { guides?: unknown }).guides;
      if (!Array.isArray(guides)) return;

      const merged = mergeGeneratedStudentGuides(
        indexedQuestions.map(({ question }) => question),
        guides,
      );
      const byOriginalIndex = new Map(
        indexedQuestions.map(({ originalIndex }, index) => [originalIndex, merged[index]]),
      );
      setQuestions((previous) => previous.map((question, index) => byOriginalIndex.get(index) ?? question));
      onSuccess();
    } catch {
      onError();
    } finally {
      setLoadingStudentGuides(false);
    }
  };

  return { loadingStudentGuides, handleGenerateStudentGuides };
}
