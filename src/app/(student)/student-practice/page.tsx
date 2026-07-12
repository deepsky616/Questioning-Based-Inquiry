"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionLearningSummary } from "@/components/shared/QuestionLearningSummary";
import { QuestionPracticeView } from "@/components/shared/QuestionPracticeView";

// 질문 연습 — 본문은 교사 페이지와 공유하는 공용 뷰(QuestionPracticeView)가 담당한다.
export default function StudentPracticePage() {
  const t = useTranslations("practice");

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <QuestionLearningSummary detailsHref="/student-question-learning" />
      <QuestionPracticeView />
    </div>
  );
}
