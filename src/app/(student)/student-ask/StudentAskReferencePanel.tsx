"use client";

// 질문 작성 옆 참고 패널 — 쓰면서 참고하는 실제 흐름에 맞춰 입력창과 나란히 놓인다.
// 탐구수업 세션: 교사가 배포한 탐구질문 + 설계 참고자료
// 일반 세션: 좋은 질문 도우미(유형 전환 팁·예시·질문연습 링크)
import Link from "next/link";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { StudentInquiryQuestionReference } from "@/components/shared/StudentInquiryQuestionReference";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type { DesignContext, QuestionSession } from "./types";

interface StudentAskReferencePanelProps {
  selectedSession: QuestionSession | null;
  isInquirySession: boolean;
  designContext: DesignContext | null;
  showReference: boolean;
  onToggleReference: () => void;
}

export function StudentAskReferencePanel({
  selectedSession,
  isInquirySession,
  designContext,
  showReference,
  onToggleReference,
}: StudentAskReferencePanelProps) {
  const t = useTranslations("ask");
  const tCls = useTranslations("classification");
  const typeLabel = (type: string) =>
    type === "factual" ? tCls("factual.label")
      : type === "conceptual" ? tCls("conceptual.label")
      : type === "controversial" ? tCls("controversial.label")
      : type;

  const sharedQuestions = Array.isArray(selectedSession?.sharedQuestions)
    ? selectedSession.sharedQuestions.filter((question) => question.content?.trim())
    : [];
  const hasReference = (isInquirySession && designContext) || sharedQuestions.length > 0;

  // 참고할 것이 없는 일반 세션 — 좋은 질문 도우미가 이 자리를 채운다
  if (!hasReference) {
    return (
      <div className="student-ask-reference-panel flex flex-col gap-1.5 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-4 text-xs text-muted-foreground dark:border-indigo-500/30 dark:bg-indigo-950/20">
        <p className="text-sm font-semibold text-foreground">💡 {t("helperTitle")}</p>
        <p>{t("helperTipClosed")}</p>
        <p>{t("helperTipStage")}</p>
        <p>{t("helperTipFormula")}</p>
        <p className="italic">{t("helperExample")}</p>
        <Link href="/student-practice" className="mt-1 font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">
          {t("helperPracticeLink")} →
        </Link>
      </div>
    );
  }

  return (
    <div className="student-ask-reference-panel max-h-[34rem] space-y-3 overflow-y-auto pr-1">
      {sharedQuestions.length > 0 && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-2">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">{t("teacherInquiryQuestions")}</p>
          <p className="text-xs text-indigo-500 mb-2">{t("inquiryHint")}</p>
          <ul className="space-y-2">
            {sharedQuestions.map((question, index) => (
              <StudentInquiryQuestionReference
                key={index}
                question={question}
                typeLabel={typeLabel(question.type)}
              />
            ))}
          </ul>
        </div>
      )}

      {isInquirySession && designContext && (
        <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{t("referenceTitle")}</p>
              <p className="mt-1 text-sm font-semibold text-indigo-900 dark:text-indigo-100">{t("referenceGuideTitle")}</p>
              <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">{t("referenceGuideDesc")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-8 border-indigo-200 bg-white px-3 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100"
              onClick={onToggleReference}
            >
              {showReference ? t("hideReference") : t("showReference")}
              <CollapseChevron open={showReference} />
            </Button>
          </div>
          {showReference && (
            <DesignReferenceView
              data={designContext}
              sourceSessionId={selectedSession?.id}
              className="mt-3"
            />
          )}
        </div>
      )}
    </div>
  );
}
