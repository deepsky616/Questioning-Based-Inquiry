"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionLearningSummary } from "@/components/shared/QuestionLearningSummary";
import { QuestionPracticeView } from "@/components/shared/QuestionPracticeView";
import { getSessionUser } from "@/lib/auth-helpers";

// 질문 연습 — 본문은 교사 페이지와 공유하는 공용 뷰(QuestionPracticeView)가 담당한다.
export default function StudentPracticePage() {
  const t = useTranslations("practice");
  const { data: authSession } = useSession();
  const user = getSessionUser(authSession);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <QuestionLearningSummary detailsHref="/student-question-learning" />
      <QuestionPracticeView audience="student" studentId={user.id || undefined} />
    </div>
  );
}
