"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionDetectiveSlides } from "@/components/shared/QuestionDetectiveSlides";

export function QuestionLearningExperience() {
  const t = useTranslations("questionLearning");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <QuestionDetectiveSlides />
    </div>
  );
}
