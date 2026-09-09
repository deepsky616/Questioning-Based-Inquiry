"use client";

import { useTranslations } from "next-intl";
import type { GrowthRecord } from "./question-growth-types";

export function QuestionGrowthContent({ record, questionOnly = false, formLayout = false }: { record: Pick<GrowthRecord, "originalContent" | "revisedContent" | "changeNote" | "reflection">; questionOnly?: boolean; formLayout?: boolean }) {
  const t = useTranslations("growth");
  const changed = record.originalContent.trim() !== record.revisedContent.trim();
  const showRevision = changed || formLayout;
  const questionClass = formLayout ? "min-w-0 rounded-xl border bg-muted/40 p-4" : "";
  return <dl className="grid gap-4 sm:grid-cols-2">
    <div className={showRevision ? questionClass : "sm:col-span-2"}>
      <dt className={`${formLayout ? "text-base" : "text-sm"} font-semibold text-emerald-800 dark:text-emerald-200`}>{t(showRevision ? "original" : "myQuestion")}</dt>
      <dd className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">{record.originalContent}</dd>
    </div>
    {showRevision && <div className={questionClass}><dt className={`${formLayout ? "text-base" : "text-sm"} font-semibold text-emerald-800 dark:text-emerald-200`}>{t("revised")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">{changed ? record.revisedContent : <span className="text-sm text-muted-foreground">{t("notRevised")}</span>}</dd></div>}
    {!questionOnly && <>
      {record.changeNote && <div><dt className="text-sm font-semibold">{t("changeNote")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.changeNote}</dd></div>}
      <div><dt className="text-sm font-semibold">{t("reflection")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.reflection || <span className="text-muted-foreground">{t("reflectionPending")}</span>}</dd></div>
    </>}
  </dl>;
}
