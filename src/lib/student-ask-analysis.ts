export interface AnalysisSnapshot<T> {
  content: string;
  result: T;
}

export function isAnalysisCurrent<T>(content: string, snapshot: AnalysisSnapshot<T> | null) {
  const normalized = content.trim();
  return Boolean(normalized && snapshot && snapshot.content === normalized);
}
