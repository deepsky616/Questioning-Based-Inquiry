"use client";

import { useEffect, useState } from "react";
import { ReportView, type ReportViewProps, type SessionMeta, type SessionAnalysisResult } from "@/components/reports/ReportView";

interface StudentReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle" | "analyzeSession"> {
  student: { name: string; grade?: string | null; className?: string | null; studentNumber?: string | null };
  sessions?: SessionMeta[];
}

async function analyzeStudentSession(sessionId: string): Promise<SessionAnalysisResult | null> {
  const res = await fetch("/api/reports/student-session-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "분석 실패");
  return { summary: d.summary, insights: d.insights, relevanceInsights: d.relevanceInsights };
}

export default function StudentReportPage() {
  const [data, setData] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/student")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "불러오기 실패");
        return r.json();
      })
      .then((d: StudentReport) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center text-muted-foreground">리포트를 불러오는 중...</div>;
  if (error || !data) return <div className="py-16 text-center text-red-600">{error ?? "리포트를 불러올 수 없습니다"}</div>;

  const s = data.student;
  const sub = [s.grade && `${s.grade}학년`, s.className && `${s.className}반`, s.studentNumber && `${s.studentNumber}번`]
    .filter(Boolean).join(" ");

  return (
    <ReportView
      scope="student"
      title={`${s.name} 학생 활동 리포트`}
      subtitle={sub || undefined}
      totals={data.totals}
      weekly={data.weekly}
      monthly={data.monthly}
      classification={data.classification}
      sessions={data.sessions}
      analyzeSession={analyzeStudentSession}
    />
  );
}
