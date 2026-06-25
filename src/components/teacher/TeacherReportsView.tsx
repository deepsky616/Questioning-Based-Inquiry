"use client";

import { useEffect, useState } from "react";
import { ReportView, type PerStudentRow, type ReportViewProps, type SessionMeta, type SessionAnalysisResult } from "@/components/reports/ReportView";
import { useTranslations } from "next-intl";

interface ClassItem { grade: string; className: string; studentCount: number }
interface ClassReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle" | "analyzeSession"> {
  klass: { grade: string; className: string; studentCount: number };
  perStudent: PerStudentRow[];
  sessions?: SessionMeta[];
}
interface StudentReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle" | "analyzeSession" | "perStudent"> {
  student: { name: string; grade?: string | null; className?: string | null; studentNumber?: string | null };
  sessions?: SessionMeta[];
}

// 학급 세션 분석: 기존 세션 분석(전체 학생) 엔드포인트 재사용
async function analyzeClassSession(sessionId: string, failMsg: string): Promise<SessionAnalysisResult | null> {
  const res = await fetch(`/api/sessions/${sessionId}/analysis`, { method: "POST" });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || failMsg);
  return {
    summary: d.summary, insights: d.insights, commentInsights: d.commentInsights,
    engagementInsights: d.engagementInsights, relevanceInsights: d.relevanceInsights,
    balanceInsights: d.balanceInsights, bestQuestion: d.bestQuestion, nextQuestions: d.nextQuestions,
  };
}
// 교사가 수정한 분석 결과 저장(학급/학생 공용)
async function saveSessionAnalysis(
  payload: { sessionId: string; scope: "class" | "student"; studentId?: string; result: SessionAnalysisResult },
  failMsg: string,
): Promise<void> {
  const res = await fetch("/api/reports/session-analysis", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || failMsg);
  }
}

// 전체 학생 일괄 분석: 현재 기간의 세션들 × 반 전체 학생을 cursor로 나눠 호출
function bulkAnalyzeClass(grade: string, className: string, failMsg: string) {
  return async (sessionIds: string[], cursor: number) => {
    const res = await fetch("/api/reports/bulk-student-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade, className, sessionIds, cursor }),
    });
    const d = await res.json();
    if (!res.ok && res.status !== 200) throw new Error(d.error || failMsg);
    return { total: d.total ?? 0, nextCursor: d.nextCursor ?? cursor, done: !!d.done, analyzedThisCall: d.analyzedThisCall ?? 0, error: d.error };
  };
}

// 특정 학생 세션 분석(교사가 그 학생을 지정해서 봄)
function analyzeStudentSessionFor(studentId: string, failMsg: string) {
  return async (sessionId: string): Promise<SessionAnalysisResult | null> => {
    const res = await fetch("/api/reports/student-session-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, studentId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || failMsg);
    return { summary: d.summary, insights: d.insights, relevanceInsights: d.relevanceInsights, growthInsights: d.growthInsights, rewriteExample: d.rewriteExample };
  };
}

/** 학급/학생 활동 리포트 본문 (대시보드 '상세 리포트' 탭에서 사용). 페이지 헤더는 호출부에서 제공. */
export function TeacherReportsView() {
  const t = useTranslations("reports");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selected, setSelected] = useState<string>(""); // "grade|className"
  const [view, setView] = useState<"class" | "student">("class");
  const [studentId, setStudentId] = useState<string>("");

  const [report, setReport] = useState<ClassReport | null>(null);
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/class")
      .then((r) => r.json())
      .then((d) => {
        const list: ClassItem[] = Array.isArray(d.classes) ? d.classes : [];
        setClasses(list);
        if (list.length > 0) setSelected(`${list[0].grade}|${list[0].className}`);
      })
      .catch(() => setClasses([]));
  }, []);

  // 학급 리포트(학급별 보기 + 학생 선택 목록 제공)
  useEffect(() => {
    if (!selected) return;
    const [grade, className] = selected.split("|");
    setLoading(true); setError(null); setReport(null); setStudentId(""); setStudentReport(null);
    fetch(`/api/reports/class?grade=${encodeURIComponent(grade)}&className=${encodeURIComponent(className)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || t("loadFailed")); return r.json(); })
      .then((d: ClassReport) => setReport(d))
      .catch((e) => setError(e instanceof Error ? e.message : t("loadFailed")))
      .finally(() => setLoading(false));
  }, [selected, t]);

  // 학생별 보기: 선택된 학생 리포트
  useEffect(() => {
    if (view !== "student" || !studentId) return;
    setLoading(true); setError(null); setStudentReport(null);
    fetch(`/api/reports/student?studentId=${encodeURIComponent(studentId)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || t("loadFailed")); return r.json(); })
      .then((d: StudentReport) => setStudentReport(d))
      .catch((e) => setError(e instanceof Error ? e.message : t("loadFailed")))
      .finally(() => setLoading(false));
  }, [view, studentId, t]);

  const students = report?.perStudent ?? [];
  const currentStudent = students.find((s) => s.id === studentId);

  return (
    <div className="space-y-5">
      <div className="no-print">
        {classes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => {
              const key = `${c.grade}|${c.className}`;
              return (
                <button
                  key={key}
                  onClick={() => { setSelected(key); setView("class"); }}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    selected === key ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t("gradeClass", { grade: c.grade, className: c.className })} <span className="text-xs opacity-80">{t("studentCount", { count: c.studentCount })}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noClasses")}</p>
        )}

        {/* 학급별 / 학생별 보기 전환 */}
        {report && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setView("class")}
                className={`px-3 py-1.5 text-xs font-medium ${view === "class" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >{t("classAll")}</button>
              <button
                onClick={() => { setView("student"); if (!studentId && students[0]) setStudentId(students[0].id); }}
                className={`px-3 py-1.5 text-xs font-medium border-l ${view === "student" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >{t("byStudent")}</button>
            </div>
            {view === "student" && (
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.studentNumber ? `${s.studentNumber}. ` : ""}{s.name}</option>
                ))}
              </select>
            )}

            {/* 출력(인쇄) — 학생 개별 / 전체 학생 */}
            <div className="ml-auto flex items-center gap-2">
              {view === "student" && studentId && (
                <button
                  onClick={() => window.open(`/teacher-reports/print?studentId=${encodeURIComponent(studentId)}`, "_blank")}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >{t("printIndividual")}</button>
              )}
              <button
                onClick={() => window.open(`/teacher-reports/print?grade=${encodeURIComponent(report.klass.grade)}&className=${encodeURIComponent(report.klass.className)}`, "_blank")}
                className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >{t("printAll")}</button>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="py-16 text-center text-muted-foreground">{t("loadingReport")}</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}

      {/* 학급별 보기 */}
      {!loading && view === "class" && report && (
        <ReportView
          scope="class"
          title={t("classReportTitle", { grade: report.klass.grade, className: report.klass.className })}
          subtitle={t("classReportSubtitle", { count: report.klass.studentCount })}
          totals={report.totals}
          weekly={report.weekly}
          monthly={report.monthly}
          classification={report.classification}
          perStudent={report.perStudent}
          sessions={report.sessions}
          analyzeSession={(id) => analyzeClassSession(id, t("analysisFailed"))}
          analysisCacheKey={`class:${selected}`}
          bulkAnalyze={bulkAnalyzeClass(report.klass.grade, report.klass.className, t("analysisFailed"))}
          onSaveAnalysis={(id, result) => saveSessionAnalysis({ sessionId: id, scope: "class", result }, t("analysisFailed"))}
          showPrintButton={false}
          participationLabel={t("participationClass")}
          receptionLabel={t("receptionClass")}
        />
      )}

      {/* 학생별 보기 */}
      {!loading && view === "student" && studentReport && (
        <ReportView
          scope="student"
          title={t("studentReportTitle", { name: studentReport.student.name })}
          subtitle={currentStudent?.studentNumber ? t("studentReportSubtitle", { number: currentStudent.studentNumber }) : undefined}
          totals={studentReport.totals}
          weekly={studentReport.weekly}
          monthly={studentReport.monthly}
          classification={studentReport.classification}
          sessions={studentReport.sessions}
          analyzeSession={analyzeStudentSessionFor(studentId, t("analysisFailed"))}
          analysisCacheKey={`teacher-student:${studentId}`}
          onSaveAnalysis={(id, result) => saveSessionAnalysis({ sessionId: id, scope: "student", studentId, result }, t("analysisFailed"))}
          showPrintButton={false}
          participationLabel={t("participationStudent")}
          receptionLabel={t("receptionStudent")}
        />
      )}
    </div>
  );
}
