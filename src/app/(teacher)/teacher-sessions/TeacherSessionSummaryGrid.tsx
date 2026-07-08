"use client";

import { useTranslations } from "next-intl";

interface TeacherSessionSummaryGridProps {
  activeCount: number;
  pastCount: number;
  missingSessionCount: number;
  completedSessionCount: number;
  totalMissingStudents: number;
}

export function TeacherSessionSummaryGrid({
  activeCount,
  pastCount,
  missingSessionCount,
  completedSessionCount,
  totalMissingStudents,
}: TeacherSessionSummaryGridProps) {
  const t = useTranslations("sessions");
  const items = [
    [t("upcomingSessions"), activeCount],
    [t("pastSessions"), pastCount],
    [t("participationFilterMissing"), missingSessionCount],
    [t("participationFilterCompleted"), completedSessionCount],
    [t("participationMissing", { missing: totalMissingStudents }), totalMissingStudents],
  ] as const;

  return (
    <div className="teacher-sessions-summary-grid grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}
