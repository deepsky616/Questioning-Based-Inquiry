"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReportView, type ReportViewProps, type SessionMeta, type SessionAnalysisResult } from "@/components/reports/ReportView";
import { formatClock } from "@/lib/datetime";
import { visibleReportRefetchInterval } from "@/lib/query-refresh";
import { hideStudentReportAnalysisModels } from "@/lib/student-report-visibility";

interface StudentReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle" | "analyzeSession"> {
  student: { name: string; grade?: string | null; className?: string | null; studentNumber?: string | null };
  sessions?: SessionMeta[];
}

async function analyzeStudentSession(sessionId: string, failMsg: string): Promise<SessionAnalysisResult | null> {
  const res = await fetch("/api/reports/student-session-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || failMsg);
  return {
    summary: d.summary,
    insights: d.insights,
    relevanceInsights: d.relevanceInsights,
    growthInsights: d.growthInsights,
    rewriteExample: d.rewriteExample,
    totalQuestions: d.totals?.questions,
    totalComments: d.totals?.comments,
    totalLikes: d.totals?.likesGiven,
    analyzedAt: d.analyzedAt,
  };
}

/** 학생 본인 활동 리포트 본문 (대시보드 '상세 리포트' 탭에서 사용). */
export function StudentReportView() {
  const t = useTranslations("reports");
  // 내 리포트는 무거운 집계라 긴 폴링(60초)+포커스 재조회로 신선도만 유지한다.
  const { data, isLoading: loading, error, isFetching, dataUpdatedAt, refetch } = useQuery<StudentReport>({
    queryKey: ["student-report"],
    queryFn: async () => {
      const r = await fetch("/api/reports/student");
      if (!r.ok) throw new Error((await r.json()).error || t("loadFailed"));
      return r.json();
    },
    refetchInterval: visibleReportRefetchInterval,
    refetchOnWindowFocus: true,
  });

  if (loading) return <div className="py-16 text-center text-muted-foreground">{t("loadingReport")}</div>;
  if (error || !data) return <div className="py-16 text-center text-red-600">{error instanceof Error ? error.message : t("loadError")}</div>;

  const s = data.student;
  const sub = [s.grade && t("gradeLabel", { grade: s.grade }), s.className && t("classLabel", { className: s.className }), s.studentNumber && t("numberLabel", { n: s.studentNumber })]
    .filter(Boolean).join(" ");

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>{dataUpdatedAt ? t("lastUpdated", { time: formatClock(new Date(dataUpdatedAt)) }) : t("autoRefreshNote")}</span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? t("refreshingReport") : t("refreshReport")}
        </button>
      </div>
      <ReportView
        scope="student"
        title={t("studentReportTitle", { name: s.name })}
        subtitle={sub || undefined}
        totals={data.totals}
        weekly={data.weekly}
        monthly={data.monthly}
        classification={data.classification}
        sessions={hideStudentReportAnalysisModels(data.sessions)}
        analyzeSession={(id) => analyzeStudentSession(id, t("analysisFailed"))}
        analysisCacheKey="student-self"
        canAnalyze={false}
        showAnalysisModel={false}
        showPrintButton={false}
      />
    </div>
  );
}
