"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ReportPrintDoc, type PrintReportItem } from "@/components/reports/ReportPrintDoc";

interface StudentReportResp {
  student: { name: string; grade?: string | null; className?: string | null; studentNumber?: string | null; school?: string | null };
  totals: PrintReportItem["totals"];
  classification: PrintReportItem["classification"];
  sessions: PrintReportItem["sessions"];
}

function toItem(r: StudentReportResp): PrintReportItem {
  return {
    name: r.student.name, grade: r.student.grade, className: r.student.className,
    studentNumber: r.student.studentNumber, school: r.student.school,
    totals: r.totals, classification: r.classification, sessions: r.sessions ?? [],
  };
}

function PrintInner() {
  const t = useTranslations("report");
  const sp = useSearchParams();
  const studentId = sp.get("studentId");
  const grade = sp.get("grade");
  const className = sp.get("className");

  const [items, setItems] = useState<PrintReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (studentId) {
          const r = await fetch(`/api/reports/student?studentId=${encodeURIComponent(studentId)}`);
          if (!r.ok) throw new Error((await r.json()).error || t("loadFailed"));
          const d: StudentReportResp = await r.json();
          if (active) setItems([toItem(d)]);
        } else if (grade && className) {
          const rc = await fetch(`/api/reports/class?grade=${encodeURIComponent(grade)}&className=${encodeURIComponent(className)}`);
          if (!rc.ok) throw new Error((await rc.json()).error || t("loadFailed"));
          const dc: { perStudent?: { id: string }[] } = await rc.json();
          const ids = (dc.perStudent ?? []).map((s) => s.id);
          const results = await Promise.all(
            ids.map((id) =>
              fetch(`/api/reports/student?studentId=${encodeURIComponent(id)}`)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
            ),
          );
          if (active) setItems(results.filter(Boolean).map((d) => toItem(d as StudentReportResp)));
        } else {
          throw new Error(t("loadFailed"));
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : t("loadFailed"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [studentId, grade, className, t]);

  // 데이터 준비되면 자동으로 인쇄 대화상자 열기(한 번만)
  useEffect(() => {
    if (!loading && !error && items.length > 0 && !printed.current) {
      printed.current = true;
      const id = setTimeout(() => window.print(), 400);
      return () => clearTimeout(id);
    }
  }, [loading, error, items]);

  if (loading) return <div className="py-16 text-center text-muted-foreground">{t("loadingReport")}</div>;
  if (error) return <div className="py-16 text-center text-red-600">{error}</div>;
  if (items.length === 0) return <div className="py-16 text-center text-muted-foreground">{t("docNoStudents")}</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("docReadyHint", { count: items.length })}</p>
        <Button size="sm" onClick={() => window.print()} className="font-semibold">{t("print")}</Button>
      </div>
      <ReportPrintDoc items={items} />
    </div>
  );
}

export default function TeacherReportsPrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintInner />
    </Suspense>
  );
}
