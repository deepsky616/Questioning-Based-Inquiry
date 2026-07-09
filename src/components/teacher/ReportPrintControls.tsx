"use client";

import { RefreshCw } from "lucide-react";

import { formatClock } from "@/lib/datetime";

interface ReportPrintControlsProps {
  view: "class" | "student";
  studentId: string;
  hasStudentReport: boolean;
  printBusy: boolean;
  visibleUpdatedAt: number;
  visibleRefreshing: boolean;
  onRefresh: () => void;
  onPrintClass: () => void;
  onPrintOneStudent: () => void;
  onPrintAllStudents: () => void;
  labels: {
    lastUpdated: (time: string) => string;
    autoRefreshNote: string;
    refreshingReport: string;
    refreshReport: string;
    printClass: string;
    loadingReport: string;
    printIndividual: string;
    printAll: string;
  };
}

export function ReportPrintControls({
  view,
  studentId,
  hasStudentReport,
  printBusy,
  visibleUpdatedAt,
  visibleRefreshing,
  onRefresh,
  onPrintClass,
  onPrintOneStudent,
  onPrintAllStudents,
  labels,
}: ReportPrintControlsProps) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
        <span>
          {visibleUpdatedAt ? labels.lastUpdated(formatClock(new Date(visibleUpdatedAt))) : labels.autoRefreshNote}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={visibleRefreshing}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${visibleRefreshing ? "animate-spin" : ""}`} />
          {visibleRefreshing ? labels.refreshingReport : labels.refreshReport}
        </button>
      </div>
      {view === "class" && (
        <button
          onClick={onPrintClass}
          disabled={printBusy}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          {labels.printClass}
        </button>
      )}
      {view === "student" && studentId && hasStudentReport && (
        <button
          onClick={onPrintOneStudent}
          disabled={printBusy}
          className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {printBusy ? labels.loadingReport : labels.printIndividual}
        </button>
      )}
      {view === "student" && (
        <button
          onClick={onPrintAllStudents}
          disabled={printBusy}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          {printBusy ? labels.loadingReport : labels.printAll}
        </button>
      )}
    </div>
  );
}
