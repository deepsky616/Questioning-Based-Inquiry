import type { ReactNode } from "react";

export function ReportSectionGrid({ children }: { children: ReactNode }) {
  return (
    <div className="report-readable-grid grid gap-4 lg:grid-cols-2">
      {children}
    </div>
  );
}

export function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
