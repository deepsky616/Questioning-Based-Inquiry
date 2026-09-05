"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearSubmittedQuestionDraft, questionDraftKey, readQuestionDraft, writeQuestionDraft } from "./question-draft";

type DraftStatus = "empty" | "saved" | "restored" | "error" | "submitted";
interface DraftState { key: string; content: string; status: DraftStatus }

export function useQuestionDraft(studentId: string, sessionId: string) {
  const key = questionDraftKey(studentId, sessionId);
  const memory = useRef(new Map<string, DraftState>());
  const [state, setState] = useState<DraftState>({ key: "", content: "", status: "empty" });

  useEffect(() => {
    if (!studentId || !sessionId) return;
    const cached = memory.current.get(key);
    if (cached) {
      setState(cached);
      return;
    }
    try {
      const draft = readQuestionDraft(window.sessionStorage, studentId, sessionId);
      setState({ key, content: draft?.content ?? "", status: draft ? "restored" : "empty" });
    } catch {
      setState({ key, content: "", status: "error" });
    }
  }, [key, studentId, sessionId]);

  const setContent = useCallback((value: string) => {
    const content = value.slice(0, 200);
    let status: DraftStatus = content.trim() ? "saved" : "empty";
    try {
      if (!studentId || !sessionId) throw new Error("수업 선택 전에는 초안을 저장할 수 없습니다");
      writeQuestionDraft(window.sessionStorage, { studentId, sessionId, content, updatedAt: Date.now() });
    } catch {
      status = "error";
    }
    const next = { key, content, status };
    memory.current.set(key, next);
    setState(next);
  }, [key, studentId, sessionId]);

  const markSubmitted = useCallback((content: string) => {
    try {
      clearSubmittedQuestionDraft(window.sessionStorage, studentId, sessionId, content);
    } catch {
      // 제출은 이미 성공했으므로 저장소 오류가 완료 화면을 막지 않게 한다.
    }
    const cached = memory.current.get(key);
    if (cached?.content.trim() === content.trim()) memory.current.delete(key);
    setState((previous) => previous.key === key && previous.content.trim() === content.trim()
      ? { ...previous, status: "submitted" }
      : previous);
  }, [key, studentId, sessionId]);

  return {
    content: state.key === key ? state.content : "",
    draftStatus: state.key === key ? state.status : "empty" as DraftStatus,
    setContent,
    markSubmitted,
  };
}
