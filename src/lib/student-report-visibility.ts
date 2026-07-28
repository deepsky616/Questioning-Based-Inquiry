import type { SessionMeta } from "@/components/reports/ReportView";

export function hideStudentReportAnalysisModels(
  sessions: SessionMeta[] | undefined,
): SessionMeta[] | undefined {
  return sessions?.map((session) => {
    if (!session.analysis) return session;

    const analysis = { ...session.analysis };
    delete analysis.analysisModel;
    return { ...session, analysis };
  });
}
