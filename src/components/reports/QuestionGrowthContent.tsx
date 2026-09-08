"use client";

import { useTranslations } from "next-intl";
import type { GrowthRecord } from "./question-growth-types";

export function QuestionGrowthContent({ record, questionOnly = false }: { record: Pick<GrowthRecord, "originalContent" | "revisedContent" | "changeNote" | "reflection">; questionOnly?: boolean }) {
  const t = useTranslations("growth");
  const changed = record.originalContent.trim() !== record.revisedContent.trim();
  return <dl className="grid gap-4 sm:grid-cols-2">
    <div className={changed ? "" : "sm:col-span-2"}>
      <dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t(changed ? "original" : "myQuestion")}</dt>
      <dd className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">{record.originalContent}</dd>
    </div>
    {changed && <div><dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t("revised")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">{record.revisedContent}</dd></div>}
    {!questionOnly && <>
      {record.changeNote && <div><dt className="text-sm font-semibold">{t("changeNote")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.changeNote}</dd></div>}
      <div><dt className="text-sm font-semibold">{t("reflection")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.reflection || <span className="text-muted-foreground">{t("reflectionPending")}</span>}</dd></div>
    </>}
  </dl>;
}
