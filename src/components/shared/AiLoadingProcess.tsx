"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export type AiLoadingKind =
  | "questionGrouping"
  | "questionSorting"
  | "pointReview"
  | "sessionAnalysis"
  | "bulkSessionAnalysis";

const STAGE_KEYS: Record<AiLoadingKind, string[]> = {
  questionGrouping: ["prepare", "connect", "analyze", "organize", "finish"],
  questionSorting: ["prepare", "connect", "analyze", "organize", "finish"],
  pointReview: ["prepare", "connect", "analyze", "organize", "finish"],
  sessionAnalysis: ["prepare", "connect", "analyze", "organize", "finish"],
  bulkSessionAnalysis: ["prepare", "connect", "analyze", "organize", "finish"],
};

interface AiLoadingProcessProps {
  kind: AiLoadingKind;
  detail?: string;
  compact?: boolean;
  className?: string;
}

export function AiLoadingProcess({ kind, detail, compact = false, className = "" }: AiLoadingProcessProps) {
  const t = useTranslations("aiProgress");
  const [elapsed, setElapsed] = useState(0);
  const stages = STAGE_KEYS[kind];

  useEffect(() => {
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, [kind]);

  const currentIndex = useMemo(() => {
    const index = Math.floor(elapsed / 4);
    return Math.min(index, stages.length - 1);
  }, [elapsed, stages.length]);
  const progress = Math.min(95, Math.max(12, Math.round(((currentIndex + 1) / stages.length) * 100)));

  return (
    <div className={`rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-sm dark:border-indigo-500/30 dark:bg-indigo-950/30 ${className}`}>
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-indigo-900 dark:text-indigo-100">{t(`kinds.${kind}.title`)}</p>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200">
              {t("elapsed", { seconds: elapsed })}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-indigo-700 dark:text-indigo-200">
            {detail ?? t(`kinds.${kind}.description`)}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-500 dark:bg-indigo-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {!compact && (
            <ol className="mt-3 grid gap-1.5 sm:grid-cols-5">
              {stages.map((stage, index) => {
                const done = index < currentIndex;
                const current = index === currentIndex;
                return (
                  <li
                    key={stage}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                      current
                        ? "bg-white font-semibold text-indigo-800 shadow-sm dark:bg-indigo-900/70 dark:text-indigo-100"
                        : done
                        ? "text-indigo-700 dark:text-indigo-200"
                        : "text-indigo-500/70 dark:text-indigo-300/60"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : current ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{t(`kinds.${kind}.stages.${stage}`)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-2 text-xs text-indigo-600/80 dark:text-indigo-200/80">{t("note")}</p>
        </div>
      </div>
    </div>
  );
}
