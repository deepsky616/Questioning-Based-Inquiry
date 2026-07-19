"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReportView, type PerStudentRow, type ReportViewProps, type SessionMeta, type SessionAnalysisResult } from "@/components/reports/ReportView";
import { ReportPrintDoc, type PrintReportItem } from "@/components/reports/ReportPrintDoc";
import { ReportPrintControls } from "@/components/teacher/ReportPrintControls";
import { useTranslations } from "next-intl";
import { visibleReportRefetchInterval } from "@/lib/query-refresh";

interface ClassItem { grade: string; className: string; studentCount: number }
interface ClassReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle" | "analyzeSession"> {
  klass: { grade: string; className: string; studentCount: number };
  perStudent: PerStudentRow[];
  sessions?: SessionMeta[];
}
interface StudentReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle" | "analyzeSession" | "perStudent"> {
  student: { id?: string; name: string; grade?: string | null; className?: string | null; studentNumber?: string | null; school?: string | null };
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
    totalQuestions: d.totalQuestions,
    totalComments: d.totalComments,
    totalLikes: d.totalLikes,
    analyzedAt: d.analyzedAt,
    analysisModel: d.analysisModel,
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
      analysisModel: d.analysisModel,
    };
  };
}

/** 학급/학생 활동 리포트 본문 (대시보드 '상세 리포트' 탭에서 사용). 페이지 헤더는 호출부에서 제공. */
export function TeacherReportsView() {
  const t = useTranslations("reports");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>(""); // "grade|className"
  const [view, setView] = useState<"class" | "student">("class");
  const [studentId, setStudentId] = useState<string>("");
  const [printItems, setPrintItems] = useState<PrintReportItem[]>([]);
  const [previewItems, setPreviewItems] = useState<PrintReportItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  // 학급 목록(가벼움): 포커스 재조회만
  const { data: classes = [] } = useQuery<ClassItem[]>({
    queryKey: ["report-classes"],
    queryFn: async () => {
      const r = await fetch("/api/reports/class");
      if (!r.ok) throw new Error("학급 목록을 불러오지 못했습니다");
      const d = await r.json();
      return Array.isArray(d.classes) ? d.classes : [];
    },
    refetchOnWindowFocus: true,
  });
  // 첫 학급 자동 선택
  useEffect(() => {
    if (!selected && classes.length > 0) setSelected(`${classes[0].grade}|${classes[0].className}`);
  }, [classes, selected]);
  // 학급 변경 시 학생 선택 초기화
  useEffect(() => { setStudentId(""); }, [selected]);
  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  // 학급 리포트(무거운 집계): 긴 폴링(60초)+포커스 재조회
  const classReportQuery = useQuery<ClassReport>({
    queryKey: ["class-report", selected],
    queryFn: async () => {
      const [grade, className] = selected.split("|");
      const r = await fetch(`/api/reports/class?grade=${encodeURIComponent(grade)}&className=${encodeURIComponent(className)}`);
      if (!r.ok) throw new Error((await r.json()).error || t("loadFailed"));
      return r.json();
    },
    enabled: Boolean(selected),
    refetchInterval: visibleReportRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const report = classReportQuery.data ?? null;

  // 학생별 리포트: 학생 선택 시 긴 폴링(60초)+포커스 재조회
  const studentReportQuery = useQuery<StudentReport>({
    queryKey: ["teacher-student-report", studentId],
    queryFn: async () => {
      const r = await fetch(`/api/reports/student?studentId=${encodeURIComponent(studentId)}`);
      if (!r.ok) throw new Error((await r.json()).error || t("loadFailed"));
      return r.json();
    },
    enabled: view === "student" && Boolean(studentId),
    refetchInterval: visibleReportRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const studentReport = studentReportQuery.data ?? null;

  const loading = classReportQuery.isLoading || (view === "student" && studentReportQuery.isLoading);
  const reportError = classReportQuery.error || studentReportQuery.error;
  const error = reportError instanceof Error ? reportError.message : null;

  // 인쇄(현재 페이지에서 print-root만 출력) — 새 탭 없이
  const stripPrintMetadata = (items: PrintReportItem[]): PrintReportItem[] =>
    items.map((item) => ({
      ...item,
      sessions: (item.sessions ?? []).map((session) => ({
        ...session,
        analysis: session.analysis
          ? { ...session.analysis, analysisModel: undefined }
          : session.analysis,
      })),
    }));

  const toItem = (r: StudentReport): PrintReportItem => ({
    name: r.student.name, grade: r.student.grade, className: r.student.className,
    studentNumber: r.student.studentNumber, school: r.student.school ?? undefined,
    totals: r.totals, classification: r.classification,
    weekly: r.weekly, monthly: r.monthly,
    sessions: (r.sessions as PrintReportItem["sessions"]) ?? [],
  });
  const showPrintPreview = (items: PrintReportItem[]) => {
    const next = stripPrintMetadata(items);
    setPreviewItems(next);
    setPrintItems(next);
    setPreviewOpen(true);
  };
  const doPrint = (items: PrintReportItem[]) => {
    if (items.length === 0) return;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove("print-doc-mode");
      window.removeEventListener("afterprint", cleanup);
      window.removeEventListener("focus", cleanup);
    };
    try {
      flushSync(() => setPrintItems(stripPrintMetadata(items)));
      document.body.classList.add("print-doc-mode");
      window.addEventListener("afterprint", cleanup, { once: true });
      window.addEventListener("focus", cleanup, { once: true });
      window.setTimeout(() => {
        if (document.hasFocus()) cleanup();
      }, 1000);
      window.print();
    } catch (printError) {
      cleanup();
      console.error("report print failed", printError);
    }
  };

  // 포인트·순위: class-ranks(반 전원 포인트+우리반/교내/전체 석차) + class-leaderboard(교내·전체 반 순위)
  interface RankRow { id: string; totalPoints: number; classRank: number; schoolRank: number; allRank: number }
  const fetchRanking = async (grade: string, className: string) => {
    const q = `grade=${encodeURIComponent(grade)}&className=${encodeURIComponent(className)}`;
    const [rk, lbSchool, lbAll] = await Promise.all([
      fetch(`/api/points/class-ranks?${q}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/points/class-leaderboard?scope=school&${q}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/points/class-leaderboard?scope=all&${q}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const students: RankRow[] = rk?.students ?? [];
    return {
      byId: new Map(students.map((s) => [s.id, s])),
      total: rk?.total ?? students.length,
      schoolTotal: rk?.schoolTotal as number | undefined,
      allTotal: rk?.allTotal as number | undefined,
      sumPoints: students.reduce((a, s) => a + (s.totalPoints || 0), 0),
      avgPoints: lbSchool?.myClass?.avgPoints as number | undefined,
      classOrderSchool: lbSchool?.myClass?.rank as number | undefined,
      classOrderSchoolTotal: lbSchool?.total as number | undefined,
      classOrderAll: lbAll?.myClass?.rank as number | undefined,
      classOrderAllTotal: lbAll?.total as number | undefined,
    };
  };
  const classRankingQuery = useQuery({
    queryKey: ["report-class-ranking", selected],
    queryFn: async () => {
      const [grade, className] = selected.split("|");
      return fetchRanking(grade, className);
    },
    enabled: Boolean(selected && report),
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });
  const visibleUpdatedAt = view === "student" ? studentReportQuery.dataUpdatedAt : classReportQuery.dataUpdatedAt;
  const visibleRefreshing = view === "student"
    ? studentReportQuery.isFetching || classReportQuery.isFetching
    : classReportQuery.isFetching || classRankingQuery.isFetching;
  const refreshVisibleReport = async () => {
    if (view === "student") {
      await Promise.all([
        studentReportQuery.refetch(),
        classReportQuery.refetch(),
        classRankingQuery.refetch(),
      ]);
      return;
    }
    await Promise.all([
      classReportQuery.refetch(),
      classRankingQuery.refetch(),
    ]);
  };
  const studentRanking = (rk: Awaited<ReturnType<typeof fetchRanking>>, id: string): PrintReportItem["ranking"] => {
    const s = rk.byId.get(id);
    return s ? {
      points: s.totalPoints,
      classRank: s.classRank, classTotal: rk.total,
      schoolRank: s.schoolRank, schoolTotal: rk.schoolTotal,
      allRank: s.allRank, allTotal: rk.allTotal,
    } : undefined;
  };

  // 학급 전체 출력: 학급 집계(전체 학생 종합) 리포트 1부 — 세션 전체(scope=class) 분석 + 반 포인트·순위
  const printClassReport = () => {
    if (!report || printBusy) return;
    const klass = report.klass as { grade: string; className: string; school?: string | null };
    const rk = classRankingQuery.data ?? null;
    showPrintPreview([{
      kind: "class",
      name: t("gradeClass", { grade: klass.grade, className: klass.className }),
      grade: klass.grade,
      className: klass.className,
      school: klass.school ?? undefined,
      totals: report.totals,
      classification: report.classification,
      weekly: report.weekly,
      monthly: report.monthly,
      sessions: (report.sessions as PrintReportItem["sessions"]) ?? [],
      roster: (report.perStudent ?? []).map((student) => {
        const rank = rk?.byId.get(student.id);
        return {
          id: student.id,
          name: student.name,
          studentNumber: student.studentNumber,
          questions: student.questions,
          likesGiven: student.likesGiven,
          comments: student.comments,
          points: rank?.totalPoints,
          classRank: rank?.classRank,
        };
      }),
      ranking: rk
        ? {
            avgPoints: rk.avgPoints,
            sumPoints: rk.sumPoints,
            classOrderSchool: rk.classOrderSchool,
            classOrderSchoolTotal: rk.classOrderSchoolTotal,
            classOrderAll: rk.classOrderAll,
            classOrderAllTotal: rk.classOrderAllTotal,
          }
        : undefined,
    }]);
  };

  // 학생 개별 출력: 현재 선택 학생 + 포인트·순위
  const printOneStudent = async () => {
    if (!studentReport || !studentId || printBusy) return;
    setPrintBusy(true);
    try {
      const grade = studentReport.student.grade ?? "";
      const className = studentReport.student.className ?? "";
      const rk = grade && className ? await fetchRanking(grade, className) : null;
      const item = toItem(studentReport);
      if (rk) item.ranking = studentRanking(rk, studentId);
      showPrintPreview([item]);
    } finally {
      setPrintBusy(false);
    }
  };

  // 전체 학생 출력: 학급 전원 리포트를 모아서 인쇄(+ 포인트·순위)
  const printAllStudents = async () => {
    if (!report || printBusy) return;
    setPrintBusy(true);
    try {
      const klass = report.klass as { grade: string; className: string };
      const [data, rk] = await Promise.all([
        fetch("/api/reports/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade: klass.grade, className: klass.className }),
        }).then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || t("loadFailed"));
          return d as { reports?: StudentReport[] };
        }),
        fetchRanking(klass.grade, klass.className),
      ]);
      const items: PrintReportItem[] = [];
      (data.reports ?? []).forEach((d) => {
        if (!d) return;
        const item = toItem(d as StudentReport);
        if (d.student.id) item.ranking = studentRanking(rk, d.student.id);
        items.push(item);
      });
      showPrintPreview(items);
    } finally {
      setPrintBusy(false);
    }
  };

  // 일괄 분석 완료 후 현재 학생 리포트를 다시 불러와 새 분석 결과를 화면에 반영
  const refreshStudentReport = () => {
    if (view !== "student" || !studentId) return;
    queryClient.invalidateQueries({ queryKey: ["teacher-student-report", studentId] });
  };

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

            <ReportPrintControls
              view={view}
              studentId={studentId}
              hasStudentReport={Boolean(studentReport)}
              printBusy={printBusy}
              visibleUpdatedAt={visibleUpdatedAt}
              visibleRefreshing={visibleRefreshing}
              onRefresh={refreshVisibleReport}
              onPrintClass={printClassReport}
              onPrintOneStudent={printOneStudent}
              onPrintAllStudents={printAllStudents}
              labels={{
                lastUpdated: (time) => t("lastUpdated", { time }),
                autoRefreshNote: t("autoRefreshNote"),
                refreshingReport: t("refreshingReport"),
                refreshReport: t("refreshReport"),
                printClass: t("printClass"),
                loadingReport: t("loadingReport"),
                printIndividual: t("printIndividual"),
                printAll: t("printAll"),
              }}
            />
          </div>
        )}
      </div>

      {loading && <div className="py-16 text-center text-muted-foreground">{t("loadingReport")}</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}

      {/* 학급별 보기 */}
      {!loading && view === "class" && report && (
        <div className="space-y-5">
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
            onSaveAnalysis={(id, result) => saveSessionAnalysis({ sessionId: id, scope: "class", result }, t("analysisFailed"))}
            showPrintButton={false}
            participationLabel={t("participationClass")}
            receptionLabel={t("receptionClass")}
          />
        </div>
      )}

      {/* 학생별 보기 */}
      {!loading && view === "student" && studentReport && (
        <div className="space-y-5">
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
            bulkAnalyze={report ? bulkAnalyzeClass(report.klass.grade, report.klass.className, t("analysisFailed")) : undefined}
            bulkSessions={report?.sessions}
            onBulkComplete={refreshStudentReport}
            showPrintButton={false}
            participationLabel={t("participationStudent")}
            receptionLabel={t("receptionStudent")}
          />
        </div>
      )}

      {/* 인쇄 전용 문서(화면엔 숨김, print-doc-mode 인쇄 시에만 출력) */}
      <div className="print-root" aria-hidden>
        {printItems.length > 0 && <ReportPrintDoc items={printItems} />}
      </div>

      {previewOpen && previewItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-print-preview-title"
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 id="report-print-preview-title" className="text-base font-bold text-foreground">{t("previewTitle")}</h2>
                <p className="text-xs text-muted-foreground">{t("previewDesc", { count: previewItems.length })}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => doPrint(previewItems)}
                  className="rounded-md border border-indigo-500 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  {t("previewPrint")}
                </button>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  {t("previewClose")}
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-muted/40 p-3 sm:p-5">
              <div className="report-preview-paper mx-auto w-fit min-w-[760px] p-6 shadow-sm">
                <ReportPrintDoc items={previewItems} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
