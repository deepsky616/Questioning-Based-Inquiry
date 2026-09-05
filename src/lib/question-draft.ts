import type { DraftStorage } from "./practice-draft";

const PREFIX = "question-lab:question-draft:";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

export interface QuestionDraft {
  studentId: string;
  sessionId: string;
  content: string;
  updatedAt: number;
}

export const questionDraftKey = (studentId: string, sessionId: string) =>
  `${PREFIX}${encodeURIComponent(studentId)}:${encodeURIComponent(sessionId)}`;

export function readQuestionDraft(
  storage: DraftStorage,
  studentId: string,
  sessionId: string,
  now = Date.now(),
): QuestionDraft | null {
  if (!studentId || !sessionId) return null;
  const key = questionDraftKey(studentId, sessionId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as QuestionDraft & { version: number };
    if (
      draft?.version === 1 && draft.studentId === studentId && draft.sessionId === sessionId &&
      typeof draft.content === "string" && draft.content.trim() && draft.content.length <= 200 &&
      Number.isFinite(draft.updatedAt) && now >= draft.updatedAt && now - draft.updatedAt <= MAX_AGE_MS
    ) return draft;
  } catch {
    // 손상된 초안은 복원하지 않는다.
  }
  storage.removeItem(key);
  return null;
}

export function writeQuestionDraft(storage: DraftStorage, draft: QuestionDraft): void {
  if (!draft.studentId || !draft.sessionId) return;
  const key = questionDraftKey(draft.studentId, draft.sessionId);
  if (!draft.content.trim()) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify({ ...draft, content: draft.content.slice(0, 200), version: 1 }));
}

/** 늦게 끝난 제출이 그 사이에 새로 쓴 초안을 지우지 않게 한다. */
export function clearSubmittedQuestionDraft(
  storage: DraftStorage, studentId: string, sessionId: string, submittedContent: string,
): void {
  const draft = readQuestionDraft(storage, studentId, sessionId);
  if (draft?.content.trim() === submittedContent.trim()) {
    storage.removeItem(questionDraftKey(studentId, sessionId));
  }
}

export function clearQuestionDrafts(storage: Storage): void {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) storage.removeItem(key);
  }
}
