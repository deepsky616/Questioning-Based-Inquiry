export interface SessionActivitySummary {
  currentQuestions: number;
  currentLikes: number;
  currentComments: number;
}

interface ClassQuestionActivity {
  id: string;
  sessionId: string | null;
  likeCount: number;
}

interface ClassCommentActivity {
  questionId: string;
}

interface StudentActivity {
  sessionId: string | null;
}

function ensureSummary(map: Map<string, SessionActivitySummary>, sessionId: string): SessionActivitySummary {
  const existing = map.get(sessionId);
  if (existing) return existing;
  const next = { currentQuestions: 0, currentLikes: 0, currentComments: 0 };
  map.set(sessionId, next);
  return next;
}

export function summarizeClassSessionActivity({
  questions,
  comments,
}: {
  questions: readonly ClassQuestionActivity[];
  comments: readonly ClassCommentActivity[];
}): Map<string, SessionActivitySummary> {
  const summary = new Map<string, SessionActivitySummary>();
  const questionSession = new Map<string, string>();

  for (const question of questions) {
    if (!question.sessionId) continue;
    questionSession.set(question.id, question.sessionId);
    const row = ensureSummary(summary, question.sessionId);
    row.currentQuestions += 1;
    row.currentLikes += question.likeCount;
  }

  for (const comment of comments) {
    const sessionId = questionSession.get(comment.questionId);
    if (!sessionId) continue;
    ensureSummary(summary, sessionId).currentComments += 1;
  }

  return summary;
}

export function summarizeStudentSessionActivity({
  questions,
  comments,
  likes,
}: {
  questions: readonly StudentActivity[];
  comments: readonly StudentActivity[];
  likes: readonly StudentActivity[];
}): Map<string, SessionActivitySummary> {
  const summary = new Map<string, SessionActivitySummary>();

  for (const question of questions) {
    if (!question.sessionId) continue;
    ensureSummary(summary, question.sessionId).currentQuestions += 1;
  }
  for (const comment of comments) {
    if (!comment.sessionId) continue;
    ensureSummary(summary, comment.sessionId).currentComments += 1;
  }
  for (const like of likes) {
    if (!like.sessionId) continue;
    ensureSummary(summary, like.sessionId).currentLikes += 1;
  }

  return summary;
}
