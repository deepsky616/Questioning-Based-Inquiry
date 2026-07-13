"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  practiceSelectionForRecommendation,
  type PracticeDiagnostic,
} from "@/lib/practice-diagnostics";
import { practiceSelectionSearch } from "@/lib/practice-selection";

interface PracticeProgressResponse extends PracticeDiagnostic {
  capped: boolean;
}

export function PracticeProgressSummary() {
  const t = useTranslations("practice");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const query = useQuery<PracticeProgressResponse>({
    queryKey: ["practice-progress"],
    queryFn: async () => {
      const response = await fetch("/api/practice/progress");
      if (!response.ok) throw new Error("failed");
      return response.json();
    },
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <div role="status" className="border-y bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {t("progressLoading")}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
        <span>{t("progressLoadFailed")}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
          {tc("retry")}
        </Button>
      </div>
    );
  }

  if (!query.data || query.data.diagnosticAttempts === 0) {
    const search = practiceSelectionSearch({ tab: "quiz", quizMode: "cognitive", focus: null });
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 border-y bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">{t("progressEmpty")}</p>
        <Link className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300" href={`/student-practice?${search}`}>
          {t("startClassification")}
        </Link>
      </section>
    );
  }

  const data = query.data;
  const selection = practiceSelectionForRecommendation(data.recommendation);
  const search = practiceSelectionSearch(selection);
  const recommendation =
    data.recommendation.kind === "focus"
      ? t("progressRecommendationFocus", {
          type: tCls(`${data.recommendation.focus}.label`),
        })
      : data.recommendation.kind === "advance"
        ? t("progressRecommendationAdvance")
        : t("progressRecommendationCollect");

  return (
    <section className="border-y border-indigo-200 bg-indigo-50/60 px-4 py-4 dark:border-indigo-900 dark:bg-indigo-950/25">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t("progressTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("progressMetric", {
              accuracy: data.overall.accuracy ?? 0,
              attempts: data.diagnosticAttempts,
            })}
          </p>
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{recommendation}</p>
          {data.capped && <p className="text-xs text-muted-foreground">{t("progressCapped")}</p>}
        </div>
        <Link className="shrink-0 text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300" href={`/student-practice?${search}`}>
          {t("startRecommendation")}
        </Link>
      </div>
    </section>
  );
}
