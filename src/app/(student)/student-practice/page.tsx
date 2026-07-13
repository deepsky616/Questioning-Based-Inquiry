"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionLearningSummary } from "@/components/shared/QuestionLearningSummary";
import { QuestionPracticeView } from "@/components/shared/QuestionPracticeView";
import { PracticeProgressSummary } from "@/components/student/PracticeProgressSummary";
import { getSessionUser } from "@/lib/auth-helpers";
import { parsePracticeSelection } from "@/lib/practice-selection";

// 질문 연습 — 본문은 교사 페이지와 공유하는 공용 뷰(QuestionPracticeView)가 담당한다.
export default function StudentPracticePage() {
  return (
    <Suspense fallback={null}>
      <StudentPracticeContent />
    </Suspense>
  );
}

function StudentPracticeContent() {
  const t = useTranslations("practice");
  const { data: authSession } = useSession();
  const searchParams = useSearchParams();
  const user = getSessionUser(authSession);
  const initialSelection = parsePracticeSelection(searchParams);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <PracticeProgressSummary />
      <QuestionLearningSummary detailsHref="/student-question-learning" />
      <QuestionPracticeView
        audience="student"
        studentId={user.id || undefined}
        initialSelection={initialSelection}
      />
    </div>
  );
}
