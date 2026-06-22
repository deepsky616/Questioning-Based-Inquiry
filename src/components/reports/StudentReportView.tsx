"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ReportView, type ReportViewProps, type SessionMeta, type SessionAnalysisResult } from "@/components/reports/ReportView";

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
  return { summary: d.summary, insights: d.insights, relevanceInsights: d.relevanceInsights, growthInsights: d.growthInsights, rewriteExample: d.rewriteExample };
}

/** 학생 본인 활동 리포트 본문 (대시보드 '상세 리포트' 탭에서 사용). */
export function StudentReportView() {
  const t = useTranslations("reports");
  const [data, setData] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/student")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || t("loadFailed"));
        return r.json();
      })
      .then((d: StudentReport) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : t("loadFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <div className="py-16 text-center text-muted-foreground">{t("loadingReport")}</div>;
  if (error || !data) return <div className="py-16 text-center text-red-600">{error ?? t("loadError")}</div>;

  const s = data.student;
  const sub = [s.grade && t("gradeLabel", { grade: s.grade }), s.className && t("classLabel", { className: s.className }), s.studentNumber && t("numberLabel", { n: s.studentNumber })]
    .filter(Boolean).join(" ");

  return (
    <ReportView
      scope="student"
      title={t("studentReportTitle", { name: s.name })}
      subtitle={sub || undefined}
      totals={data.totals}
      weekly={data.weekly}
      monthly={data.monthly}
      classification={data.classification}
      sessions={data.sessions}
      analyzeSession={(id) => analyzeStudentSession(id, t("analysisFailed"))}
    />
  );
}
