"use client";

import { useEffect, useState } from "react";
import { ReportView, type PerStudentRow, type ReportViewProps, type SessionMeta, type SessionAnalysisResult } from "@/components/reports/ReportView";

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
async function analyzeClassSession(sessionId: string): Promise<SessionAnalysisResult | null> {
  const res = await fetch(`/api/sessions/${sessionId}/analysis`, { method: "POST" });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "분석 실패");
  return { summary: d.summary, insights: d.insights, commentInsights: d.commentInsights, engagementInsights: d.engagementInsights, relevanceInsights: d.relevanceInsights };
}
// 특정 학생 세션 분석(교사가 그 학생을 지정해서 봄)
function analyzeStudentSessionFor(studentId: string) {
  return async (sessionId: string): Promise<SessionAnalysisResult | null> => {
    const res = await fetch("/api/reports/student-session-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, studentId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "분석 실패");
    return { summary: d.summary, insights: d.insights, relevanceInsights: d.relevanceInsights };
  };
}

export default function TeacherReportsPage() {
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
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || "불러오기 실패"); return r.json(); })
      .then((d: ClassReport) => setReport(d))
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, [selected]);

  // 학생별 보기: 선택된 학생 리포트
  useEffect(() => {
    if (view !== "student" || !studentId) return;
    setLoading(true); setError(null); setStudentReport(null);
    fetch(`/api/reports/student?studentId=${encodeURIComponent(studentId)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || "불러오기 실패"); return r.json(); })
      .then((d: StudentReport) => setStudentReport(d))
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, [view, studentId]);

  const students = report?.perStudent ?? [];
  const currentStudent = students.find((s) => s.id === studentId);

  return (
    <div className="space-y-5">
      <div className="no-print">
        <h2 className="text-2xl font-bold text-foreground">학급 활동 리포트</h2>
        <p className="text-sm text-muted-foreground">학급별 또는 학생별로 질문·좋아요·댓글 추세와 AI 분석을 볼 수 있어요</p>

        {classes.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
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
                  {c.grade}학년 {c.className}반 <span className="text-xs opacity-80">({c.studentCount}명)</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">담당 학급이 없습니다. 설정에서 담당 학급을 추가해 주세요.</p>
        )}

        {/* 학급별 / 학생별 보기 전환 */}
        {report && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setView("class")}
                className={`px-3 py-1.5 text-xs font-medium ${view === "class" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >학급 전체</button>
              <button
                onClick={() => { setView("student"); if (!studentId && students[0]) setStudentId(students[0].id); }}
                className={`px-3 py-1.5 text-xs font-medium border-l ${view === "student" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >학생별</button>
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
          </div>
        )}
      </div>

      {loading && <div className="py-16 text-center text-muted-foreground">리포트를 불러오는 중...</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}

      {/* 학급별 보기 */}
      {!loading && view === "class" && report && (
        <ReportView
          scope="class"
          title={`${report.klass.grade}학년 ${report.klass.className}반 활동 리포트`}
          subtitle={`학생 ${report.klass.studentCount}명`}
          totals={report.totals}
          weekly={report.weekly}
          monthly={report.monthly}
          classification={report.classification}
          perStudent={report.perStudent}
          sessions={report.sessions}
          analyzeSession={analyzeClassSession}
          participationLabel="학급이 만든 활동"
          receptionLabel="학급 질문이 받은 반응"
        />
      )}

      {/* 학생별 보기 */}
      {!loading && view === "student" && studentReport && (
        <ReportView
          scope="student"
          title={`${studentReport.student.name} 학생 활동 리포트`}
          subtitle={currentStudent?.studentNumber ? `${currentStudent.studentNumber}번` : undefined}
          totals={studentReport.totals}
          weekly={studentReport.weekly}
          monthly={studentReport.monthly}
          classification={studentReport.classification}
          sessions={studentReport.sessions}
          analyzeSession={analyzeStudentSessionFor(studentId)}
          participationLabel="이 학생이 만든 활동"
          receptionLabel="이 학생 질문이 받은 반응"
        />
      )}
    </div>
  );
}
