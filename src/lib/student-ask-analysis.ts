export interface AnalysisSnapshot<T> {
  content: string;
  sessionId: string;
  result: T;
}

export function isAnalysisCurrent<T>(
  content: string,
  sessionId: string,
  snapshot: AnalysisSnapshot<T> | null,
) {
  const normalized = content.trim();
  return Boolean(
    normalized &&
    sessionId &&
    snapshot &&
    snapshot.content === normalized &&
    snapshot.sessionId === sessionId,
  );
}
