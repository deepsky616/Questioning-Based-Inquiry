"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { mergeGeneratedStudentGuides } from "@/lib/student-inquiry-guide";
import { validateStudentGuideBundle } from "@/lib/student-guide-completeness";
import { buildStudentGuideSourceSignature } from "@/lib/student-guide-source";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";
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
  const sourceSignature = buildStudentGuideSourceSignature({
    coreIdea,
    coreSentences,
    essentialQuestions,
    inquiryQuestions: questions,
  });
  const [loadingStudentGuides, setLoadingStudentGuides] = useState(false);
  const [learningGuides, setLearningGuides] = useState<StudentLearningGuides | undefined>();
  const [generatedSourceSignature, setGeneratedSourceSignature] = useState<string | null>(null);
  const inquiryQuestions = questions.filter((question) => question.content.trim());
  const currentBundle = validateStudentGuideBundle({
    learningGuides,
    guides: inquiryQuestions.flatMap((question, index) => question.studentGuide
      ? [{ ...question.studentGuide, index }]
      : []),
  }, {
    coreSentenceCount: coreSentences.length,
    essentialQuestionCount: essentialQuestions.length,
    inquiryQuestionCount: inquiryQuestions.length,
  });
  const hasStudentGuides = Boolean(learningGuides) || questions.some((question) => question.studentGuide);
  const hasFreshStudentGuides = currentBundle.ok && generatedSourceSignature === sourceSignature;
  const hasStaleStudentGuides = hasStudentGuides && !hasFreshStudentGuides;

  useEffect(() => {
    if (generatedSourceSignature === null && currentBundle.ok) {
      setGeneratedSourceSignature(sourceSignature);
    }
  }, [currentBundle.ok, generatedSourceSignature, sourceSignature]);

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
      const checked = validateStudentGuideBundle(result, {
        coreSentenceCount: coreSentences.length,
        essentialQuestionCount: essentialQuestions.length,
        inquiryQuestionCount: indexedQuestions.length,
      });
      if (!checked.ok) {
        onError();
        return;
      }

      setLearningGuides(checked.value.learningGuides);
      const merged = mergeGeneratedStudentGuides(
        indexedQuestions.map(({ question }) => question),
        checked.value.guides,
      );
      const byOriginalIndex = new Map(indexedQuestions.map(({ originalIndex }, index) => [originalIndex, merged[index]]));
      setQuestions((previous) => previous.map((question, index) => byOriginalIndex.get(index) ?? question));
      setGeneratedSourceSignature(sourceSignature);
      onSuccess();
    } catch {
      onError();
    } finally {
      setLoadingStudentGuides(false);
    }
  };

  const clearStudentGuides = () => {
    setLearningGuides(undefined);
    setQuestions((previous) => previous.map(({ studentGuide: _studentGuide, ...question }) => question));
    setGeneratedSourceSignature(null);
  };

  return {
    learningGuides,
    setLearningGuides,
    loadingStudentGuides,
    handleGenerateStudentGuides,
    hasFreshStudentGuides,
    hasStaleStudentGuides,
    clearStudentGuides,
  };
}
