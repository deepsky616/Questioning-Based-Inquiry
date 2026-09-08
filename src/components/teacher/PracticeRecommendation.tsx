"use client";

import { useTranslations } from "next-intl";
import type { PracticeDiagnostic } from "@/lib/practice-diagnostics";

export function PracticeRecommendation({ diagnostic }: { diagnostic: PracticeDiagnostic }) {
  const t = useTranslations("practice");
  const tCls = useTranslations("classification");
  const recommendation = diagnostic.recommendation;
  const focus = recommendation.kind === "focus" ? recommendation.focus : null;
  const metric = focus ? diagnostic.types[focus] : null;
  const type = focus ? tCls(`${focus}.label`) : "";
  const collecting = recommendation.kind === "collect" || Boolean(metric && metric.attempts < 3);
  const advancing = recommendation.kind === "advance";
  const title = collecting ? t("statsRecommendationCollect")
    : advancing ? t("statsRecommendationAdvance") : t("statsRecommendationWeakest", { type });
  const reason = collecting
    ? metric ? t("statsRecommendationSample", { type, attempts: metric.attempts, count: 3 - metric.attempts }) : t("statsCollectReason")
    : advancing ? t("statsAdvanceReason") : t("statsFocusReason", { accuracy: metric?.accuracy ?? 0 });
  const color = collecting ? "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
    : advancing ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";

  return <span className="inline-flex min-w-0 flex-col items-start gap-1.5 break-keep text-left leading-relaxed">
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${color}`}>{title}</span>
    <span className="text-xs font-normal text-muted-foreground">{reason}</span>
  </span>;
}
