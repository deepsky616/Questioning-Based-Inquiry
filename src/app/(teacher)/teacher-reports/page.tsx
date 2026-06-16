"use client";

import { useEffect, useState } from "react";
import { ReportView, type PerStudentRow, type ReportViewProps } from "@/components/reports/ReportView";

interface ClassItem { grade: string; className: string; studentCount: number }
interface ClassReport extends Omit<ReportViewProps, "scope" | "title" | "subtitle"> {
  klass: { grade: string; className: string; studentCount: number };
  perStudent: PerStudentRow[];
}

export default function TeacherReportsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selected, setSelected] = useState<string>(""); // "grade|className"
  const [report, setReport] = useState<ClassReport | null>(null);
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

  useEffect(() => {
    if (!selected) return;
    const [grade, className] = selected.split("|");
    setLoading(true);
    setError(null);
    setReport(null);
    fetch(`/api/reports/class?grade=${encodeURIComponent(grade)}&className=${encodeURIComponent(className)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "불러오기 실패");
        return r.json();
      })
      .then((d: ClassReport) => setReport(d))
      .catch((e) => setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="space-y-5">
      <div className="no-print">
        <h2 className="text-2xl font-bold text-foreground">학급 활동 리포트</h2>
        <p className="text-sm text-muted-foreground">학급을 선택하면 전체 학생의 질문·좋아요·댓글 추세를 볼 수 있어요</p>
        {classes.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {classes.map((c) => {
              const key = `${c.grade}|${c.className}`;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
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
      </div>

      {loading && <div className="py-16 text-center text-muted-foreground">리포트를 불러오는 중...</div>}
      {error && <div className="py-16 text-center text-red-600">{error}</div>}
      {report && (
        <ReportView
          scope="class"
          title={`${report.klass.grade}학년 ${report.klass.className}반 활동 리포트`}
          subtitle={`학생 ${report.klass.studentCount}명`}
          totals={report.totals}
          weekly={report.weekly}
          monthly={report.monthly}
          classification={report.classification}
          perStudent={report.perStudent}
        />
      )}
    </div>
  );
}
