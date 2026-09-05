import { describe, expect, it } from "vitest";
import { clearSubmittedQuestionDraft, questionDraftKey, readQuestionDraft, writeQuestionDraft } from "@/lib/question-draft";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("수업별 질문 초안", () => {
  it("학생과 수업을 구분해 원문의 공백까지 복원한다", () => {
    const store = storage();
    const now = Date.now();
    writeQuestionDraft(store, { studentId: "학생1", sessionId: "수업1", content: " 왜 비가 올까? ", updatedAt: now });
    expect(readQuestionDraft(store, "학생1", "수업1", now)?.content).toBe(" 왜 비가 올까? ");
    expect(readQuestionDraft(store, "학생2", "수업1", now)).toBeNull();
    expect(readQuestionDraft(store, "학생1", "수업2", now)).toBeNull();
  });

  it("손상되거나 만료된 초안과 다른 학생의 자료를 복원하지 않는다", () => {
    const store = storage();
    const now = Date.now();
    const key = questionDraftKey("학생1", "수업1");
    store.setItem(key, "손상된 내용");
    expect(readQuestionDraft(store, "학생1", "수업1", now)).toBeNull();
    writeQuestionDraft(store, { studentId: "학생1", sessionId: "수업1", content: "질문", updatedAt: now - 8 * 60 * 60 * 1000 - 1 });
    expect(readQuestionDraft(store, "학생1", "수업1", now)).toBeNull();
    expect(store.getItem(key)).toBeNull();
    store.setItem(key, JSON.stringify({ version: 1, studentId: "학생2", sessionId: "수업1", content: "질문", updatedAt: now }));
    expect(readQuestionDraft(store, "학생1", "수업1", now)).toBeNull();
  });

  it("늦게 끝난 제출이 새 초안을 삭제하지 않는다", () => {
    const store = storage();
    writeQuestionDraft(store, { studentId: "학생1", sessionId: "수업1", content: "수정한 질문", updatedAt: Date.now() });
    clearSubmittedQuestionDraft(store, "학생1", "수업1", "처음 질문");
    expect(readQuestionDraft(store, "학생1", "수업1")?.content).toBe("수정한 질문");
    clearSubmittedQuestionDraft(store, "학생1", "수업1", "수정한 질문");
    expect(readQuestionDraft(store, "학생1", "수업1")).toBeNull();
  });

  it("내용을 모두 지우면 기존 초안도 삭제한다", () => {
    const store = storage();
    const draft = { studentId: "학생1", sessionId: "수업1", content: "처음 질문", updatedAt: Date.now() };
    writeQuestionDraft(store, draft);
    writeQuestionDraft(store, { ...draft, content: "  " });
    expect(readQuestionDraft(store, "학생1", "수업1")).toBeNull();
  });
});
