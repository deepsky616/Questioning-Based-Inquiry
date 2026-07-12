"use client";

// AI 채점 대상 수업 세션 선택 + 분석 실행 카드.
// 상태는 usePointReview가 소유하고, 이 컴포넌트는 그 일부를 받아 그린다.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AiLoadingProcess } from "@/components/shared/AiLoadingProcess";
import { useTranslations } from "next-intl";
import { buildSessionLabel } from "@/lib/sessions";
import { MAX_ANALYZE_SESSIONS } from "./types";
import type { usePointReview } from "./usePointReview";

type Review = ReturnType<typeof usePointReview>;

export function AnalysisSessionPicker({ review }: { review: Review }) {
  const t = useTranslations("pointReview");
  const {
    sessionMonthGroups,
    selectedAnalysisSessionIds,
    toggleAnalysisSession,
    toggleMonthSessions,
    clearAnalysisSelection,
    runAnalyze,
    pendingCountBySession,
    busy,
    aiLoading,
    message,
    loadPending,
  } = review;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("selectTitle")}</CardTitle>
        <CardDescription>{t("selectDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          <button
            type="button"
            aria-pressed={selectedAnalysisSessionIds.size === 0}
            onClick={clearAnalysisSelection}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selectedAnalysisSessionIds.size === 0
                ? "border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100"
                : "border-border bg-card hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
            }`}
          >
            <span className="font-medium">{t("noAnalysisSelection")}</span>
            <span className="text-xs text-muted-foreground">{t("analysisLimit", { max: MAX_ANALYZE_SESSIONS })}</span>
          </button>

          <div className="max-h-[18rem] space-y-3 overflow-y-auto pr-1">
            {sessionMonthGroups.map((group) => (
              <section key={group.key} className="space-y-1.5">
                <div className="flex items-center justify-between border-b pb-1 text-xs font-semibold text-muted-foreground">
                  <span>{group.label}</span>
                  <div className="flex items-center gap-2">
                    <span>{group.sessions.length}</span>
                    <button
                      type="button"
                      onClick={() => toggleMonthSessions(group.sessions.map((session) => session.id))}
                      className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      {group.sessions.every((session) => selectedAnalysisSessionIds.has(session.id)) ? t("deselectMonth") : t("selectMonth")}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.sessions.map((session) => {
                    const count = pendingCountBySession[session.id] ?? 0;
                    const active = selectedAnalysisSessionIds.has(session.id);
                    return (
                      <button
                        key={session.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleAnalysisSession(session.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100"
                            : "border-border bg-card hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            active
                              ? "border-indigo-500 bg-indigo-500 text-white"
                              : "border-muted-foreground/40 bg-background"
                          }`}>
                            {active ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {buildSessionLabel(session.date, session.subject, session.topic)}
                          </span>
                        </span>
                        {count > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
                            {t("groupPendingCount", { count })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        {selectedAnalysisSessionIds.size > 0 && (
          <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-200">
            <span>{t("selectedForAnalysis", { count: selectedAnalysisSessionIds.size, max: MAX_ANALYZE_SESSIONS })}</span>
            <button type="button" onClick={clearAnalysisSelection} className="font-semibold underline-offset-2 hover:underline">
              {t("clearSelection")}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            onClick={runAnalyze}
            disabled={busy || selectedAnalysisSessionIds.size === 0 || selectedAnalysisSessionIds.size > MAX_ANALYZE_SESSIONS}
            className="flex-1">
            {aiLoading ? t("analyzing") : t("runAnalyze")}
          </Button>
          <Button variant="outline" onClick={loadPending}>{t("refresh")}</Button>
        </div>
        {aiLoading && <AiLoadingProcess kind="pointReview" />}
        {message && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-2 text-sm">
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
