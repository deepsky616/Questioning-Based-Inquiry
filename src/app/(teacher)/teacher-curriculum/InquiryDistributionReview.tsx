"use client";

import { ArrowLeft, Loader2, Search, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { StudentInquiryGuideEditor } from "@/components/shared/StudentInquiryGuideEditor";
import { StudentLearningGuideEditor } from "@/components/shared/StudentLearningGuideEditor";
import { Button } from "@/components/ui/button";
import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";
import type { InquiryQuestion } from "./types";

const TYPE_BADGE_COLOR: Record<InquiryQuestion["type"], string> = {
  factual: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200",
  conceptual: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-200",
  controversial: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-200",
};

interface InquiryDistributionReviewProps {
  unitTitle: string;
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: InquiryQuestion[];
  learningGuides?: StudentLearningGuides;
  hasCurrentStudentGuides: boolean;
  hasFreshStudentGuides: boolean;
  hasIncompleteStudentGuides: boolean;
  hasStaleStudentGuides: boolean;
  isGeneratingGuides: boolean;
  onGenerateGuides: () => void;
  onLearningGuidesChange: (value: StudentLearningGuides) => void;
  onInquiryGuideChange: (index: number, guide: StudentInquiryGuide) => void;
  onBackToEdit: () => void;
}

export function InquiryDistributionReview({
  unitTitle,
  coreIdea,
  coreSentences,
  essentialQuestions,
  inquiryQuestions,
  learningGuides,
  hasCurrentStudentGuides,
  hasFreshStudentGuides,
  hasIncompleteStudentGuides,
  hasStaleStudentGuides,
  isGeneratingGuides,
  onGenerateGuides,
  onLearningGuidesChange,
  onInquiryGuideChange,
  onBackToEdit,
}: InquiryDistributionReviewProps) {
  const t = useTranslations("curriculum");
  const tCls = useTranslations("classification");
  const emptyMessage = t(hasStaleStudentGuides ? "studentGuideStale" : "studentGuideEmpty");
  const hasAnyGuideState = hasCurrentStudentGuides || hasStaleStudentGuides;
  const inquiryCount = inquiryQuestions.filter((question) => question.content.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBackToEdit}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("backToInquiryEdit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onGenerateGuides}
          disabled={isGeneratingGuides || inquiryCount === 0}
        >
          {isGeneratingGuides
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
          {isGeneratingGuides
            ? t("studentGuideGenerating")
            : t(hasAnyGuideState ? "studentGuideRegenerate" : "studentGuideGenerate")}
        </Button>
      </div>

      {hasStaleStudentGuides && (
        <p role="status" className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100">
          {t("studentGuideStale")}
        </p>
      )}

      {hasIncompleteStudentGuides && (
        <p role="status" className="rounded-lg border border-rose-300/80 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900 dark:border-rose-700/70 dark:bg-rose-950/30 dark:text-rose-100">
          {t("studentGuideIncomplete")}
        </p>
      )}

      <section
        data-student-guide-section="unit-title"
        className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50"
      >
        <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{t("studentGuideUnitTitle")}</h3>
        <p className="mt-2 text-base font-semibold text-foreground">
          {unitTitle.trim() || t("unitTitlePending")}
        </p>
      </section>

      <StudentLearningGuideEditor
        coreIdea={coreIdea}
        coreSentences={coreSentences}
        essentialQuestions={essentialQuestions}
        guides={learningGuides}
        showEditors={hasCurrentStudentGuides}
        emptyMessage={emptyMessage}
        onChange={onLearningGuidesChange}
      />

      <section
        data-student-guide-section="inquiry-question"
        className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 dark:border-emerald-800/60 dark:bg-emerald-950/20 sm:p-4"
        aria-labelledby="student-guide-inquiry-question-title"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" aria-hidden="true">4</span>
          <div className="min-w-0">
            <h3 id="student-guide-inquiry-question-title" className="flex items-center gap-1.5 text-sm font-semibold text-emerald-950 dark:text-emerald-100">
              <Search className="h-4 w-4" aria-hidden="true" />
              {t("studentGuideInquiryQuestionSectionTitle")}
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-emerald-800/80 dark:text-emerald-200/75">
              {t("studentGuideInquiryQuestionSectionDesc")}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          {inquiryQuestions.map((question, index) => {
            if (!question.content.trim()) return null;
            return (
              <article key={index} className="rounded-lg border border-emerald-200/70 bg-background/85 px-3 py-3 dark:border-emerald-800/50">
                <div className="flex flex-wrap items-start gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE_COLOR[question.type]}`}>
                    {tCls(`${question.type}.label`)}
                  </span>
                  <p data-student-guide-source="inquiry-question" className="min-w-0 flex-1 text-sm font-medium leading-6 text-foreground">
                    {question.content}
                  </p>
                </div>
                {hasCurrentStudentGuides && question.studentGuide ? (
                  <div className="mt-3 border-t border-emerald-200/70 pt-3 dark:border-emerald-800/50">
                    <StudentInquiryGuideEditor
                      guide={question.studentGuide}
                      defaultOpen
                      onChange={(guide) => onInquiryGuideChange(index, guide)}
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-emerald-300/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground dark:border-emerald-700/60">
                    {emptyMessage}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
