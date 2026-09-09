import type { DraftStorage } from "./practice-draft";

const PREFIX = "question-lab:growth-draft:";
const MAX_AGE = 8 * 60 * 60 * 1000;
export type GrowthEditableField = "changeNote" | "reflection";
export interface GrowthDraft {
  revision: number;
  changes: Partial<Record<GrowthEditableField, string>>;
}
export const growthDraftKey = (userId: string, questionId: string) =>
  `${PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(questionId)}`;

export function readGrowthDraft(storage: DraftStorage, userId: string, questionId: string, now = Date.now()): GrowthDraft | null {
  if (!userId || !questionId) return null;
  const key = growthDraftKey(userId, questionId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const changes = value?.changes;
    if (value.version === 1 && value.userId === userId && value.questionId === questionId &&
      Number.isInteger(value.revision) && value.revision >= 0 &&
      Number.isFinite(value.updatedAt) && now >= value.updatedAt && now - value.updatedAt <= MAX_AGE &&
      changes && typeof changes === "object" && !Array.isArray(changes) && Object.keys(changes).length > 0 &&
      Object.entries(changes).every(([key, text]) => typeof text === "string" &&
        ((key === "changeNote" && text.length <= 300) || (key === "reflection" && text.length <= 600)))) {
      return { revision: value.revision, changes };
    }
  } catch { /* 잘못된 초안은 입력란에 복원하지 않는다. */ }
  storage.removeItem(key);
  return null;
}

export function writeGrowthDraft(storage: DraftStorage, userId: string, questionId: string, draft: GrowthDraft) {
  if (!userId || !questionId) return;
  storage.setItem(growthDraftKey(userId, questionId), JSON.stringify({ ...draft, version: 1, userId, questionId, updatedAt: Date.now() }));
}

/** 늦게 도착한 저장 응답이 다른 화면에서 새로 작성한 초안을 지우지 않는다. */
export function clearMatchingGrowthDraft(storage: DraftStorage, userId: string, questionId: string, submitted: GrowthDraft) {
  const current = readGrowthDraft(storage, userId, questionId);
  if (current?.revision === submitted.revision &&
    ["changeNote", "reflection"].every(field => current.changes[field as GrowthEditableField] === submitted.changes[field as GrowthEditableField])) {
    storage.removeItem(growthDraftKey(userId, questionId));
  }
}

export function clearGrowthDrafts(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) storage.removeItem(key);
  }
}
