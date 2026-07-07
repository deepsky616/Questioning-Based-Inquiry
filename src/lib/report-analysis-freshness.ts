export interface SessionActivityCounts {
  currentQuestions?: number;
  currentComments?: number;
  currentLikes?: number;
}

export interface AnalysisActivityCounts {
  totalQuestions?: number;
  totalComments?: number;
  totalLikes?: number;
}

export function getAnalysisFreshness(
  session: SessionActivityCounts,
  analysis?: AnalysisActivityCounts | null,
) {
  if (!analysis) {
    return { hasCurrentCounts: false, hasNewActivity: false, newQuestions: 0, newComments: 0, newLikes: 0 };
  }
  const hasCurrentCounts =
    typeof session.currentQuestions === "number" ||
    typeof session.currentComments === "number" ||
    typeof session.currentLikes === "number";
  const newQuestions =
    typeof session.currentQuestions === "number" && typeof analysis.totalQuestions === "number"
      ? Math.max(0, session.currentQuestions - analysis.totalQuestions)
      : 0;
  const newComments =
    typeof session.currentComments === "number" && typeof analysis.totalComments === "number"
      ? Math.max(0, session.currentComments - analysis.totalComments)
      : 0;
  const newLikes =
    typeof session.currentLikes === "number" && typeof analysis.totalLikes === "number"
      ? Math.max(0, session.currentLikes - analysis.totalLikes)
      : 0;
  return {
    hasCurrentCounts,
    hasNewActivity: newQuestions + newComments + newLikes > 0,
    newQuestions,
    newComments,
    newLikes,
  };
}
