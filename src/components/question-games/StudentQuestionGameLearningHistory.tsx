"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuestionGameLearningHistory } from "@/components/question-games/QuestionGameLearningHistory";
import type { QuestionGameLearningHistory as LearningHistory } from "@/lib/question-game-history";

export function StudentQuestionGameLearningHistory() {
  const t = useTranslations("gamePlay");
  const tc = useTranslations("common");
  const [history, setHistory] = useState<LearningHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadHistory = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/reports/question-games?summary=1");
      const data: LearningHistory | { error?: string } = await response.json();
      if (!response.ok || !("totals" in data)) {
        throw new Error("error" in data && data.error ? data.error : t("couldNotLoadHistory"));
      }
      if (requestId === requestIdRef.current) setHistory(data);
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : t("couldNotLoadHistory"));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadHistory(); }, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [loadHistory]);

  if (loading) {
    return (
      <div role="status" className="flex min-h-32 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        {t("loadingHistory")}
      </div>
    );
  }

  if (error || !history) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        <p>{error ?? t("couldNotLoadHistory")}</p>
        <button
          type="button"
          className="mt-3 min-h-9 rounded-md border border-current px-3 text-xs font-bold"
          onClick={() => { void loadHistory(); }}
        >
          {tc("retry")}
        </button>
      </div>
    );
  }

  return <QuestionGameLearningHistory audience="student" history={history} />;
}
