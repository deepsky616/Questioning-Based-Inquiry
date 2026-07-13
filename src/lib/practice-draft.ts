const DRAFT_VERSION = 1;
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_LENGTH = 200;
const KEY_PREFIX = "question-lab:practice-draft";

export interface PracticeDraftInput {
  content: string;
  mode: "transform" | "create";
  target: "open" | "conceptual" | "controversial";
}

interface StoredPracticeDraft extends PracticeDraftInput {
  version: typeof DRAFT_VERSION;
  studentId: string;
  createdAt: string;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const practiceDraftKey = (studentId: string) => `${KEY_PREFIX}:${studentId}`;

export function writePracticeDraft(
  storage: DraftStorage,
  studentId: string,
  input: PracticeDraftInput,
  now = new Date(),
) {
  const content = input.content.trim().slice(0, MAX_LENGTH);
  if (!studentId || !content) return false;

  const value: StoredPracticeDraft = {
    version: DRAFT_VERSION,
    studentId,
    createdAt: now.toISOString(),
    ...input,
    content,
  };
  try {
    storage.setItem(practiceDraftKey(studentId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function consumePracticeDraft(
  storage: DraftStorage,
  studentId: string,
  now = new Date(),
): PracticeDraftInput | null {
  if (!studentId) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(practiceDraftKey(studentId));
    if (raw === null) return null;
    storage.removeItem(practiceDraftKey(studentId));
  } catch {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const draft = value as Partial<StoredPracticeDraft>;
    const createdAt = typeof draft.createdAt === "string" ? Date.parse(draft.createdAt) : Number.NaN;
    const age = now.getTime() - createdAt;
    const validMode = draft.mode === "transform" || draft.mode === "create";
    const validTarget =
      draft.target === "open" || draft.target === "conceptual" || draft.target === "controversial";
    const validContent =
      typeof draft.content === "string" &&
      draft.content.trim().length > 0 &&
      draft.content.length <= MAX_LENGTH;

    if (
      draft.version !== DRAFT_VERSION ||
      draft.studentId !== studentId ||
      !validMode ||
      !validTarget ||
      !validContent ||
      !Number.isFinite(createdAt) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > MAX_AGE_MS
    ) {
      return null;
    }

    return {
      content: draft.content,
      mode: draft.mode,
      target: draft.target,
    } as PracticeDraftInput;
  } catch {
    return null;
  }
}
