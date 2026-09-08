"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/datetime";

export function ReportAnalysisMetadata({ analysis, showAnalysisModel }: { analysis: { analyzedAt?: string; analysisModel?: string }; showAnalysisModel: boolean }) {
  const t = useTranslations("report");
  const validDate = analysis.analyzedAt && Number.isFinite(Date.parse(analysis.analyzedAt));
  const model = showAnalysisModel ? analysis.analysisModel?.trim() : undefined;
  return <div className="no-print flex flex-wrap items-start gap-x-3 gap-y-2 px-3 pb-3 text-xs text-muted-foreground">
    <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">{t("aiAnalysisLabel")}</span>
    {validDate && <span className="py-1">{t("latestAnalysisTime", { time: formatDateTime(analysis.analyzedAt!) })}</span>}
    {model && <details className="min-w-0 py-1">
      <summary className="cursor-pointer rounded font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("analysisInfo")}</summary>
      <p className="mt-2 break-all">{t("analysisModel", { model })}</p>
    </details>}
  </div>;
}
