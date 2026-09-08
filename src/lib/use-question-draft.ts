"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearSubmittedQuestionDraft, questionDraftKey, readQuestionDraft, writeQuestionDraft } from "./question-draft";

type DraftStatus = "empty" | "saved" | "restored" | "error" | "submitted";
interface DraftState { key: string; content: string; status: DraftStatus; firstAnalyzedContent?: string }

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
      const restored: DraftState = { key, content: draft?.content ?? "", firstAnalyzedContent: draft?.firstAnalyzedContent, status: draft ? "restored" : "empty" };
      memory.current.set(key, restored);
      setState(restored);
    } catch {
      setState({ key, content: "", status: "error" });
    }
  }, [key, studentId, sessionId]);

  const setContent = useCallback((value: string) => {
    const content = value.slice(0, 200);
    const previous = memory.current.get(key);
    const firstAnalyzedContent = content.trim() ? previous?.firstAnalyzedContent : undefined;
    let status: DraftStatus = content.trim() ? "saved" : "empty";
    try {
      if (!studentId || !sessionId) throw new Error("수업 선택 전에는 초안을 저장할 수 없습니다");
      writeQuestionDraft(window.sessionStorage, { studentId, sessionId, content, firstAnalyzedContent, updatedAt: Date.now() });
    } catch {
      status = "error";
    }
    const next = { key, content, status, firstAnalyzedContent };
    memory.current.set(key, next);
    setState(next);
  }, [key, studentId, sessionId]);

  const markAnalyzed = useCallback((analyzedContent: string) => {
    const previous = memory.current.get(key);
    if (!previous || previous.firstAnalyzedContent || previous.content.trim() !== analyzedContent.trim()) return;
    const next = { ...previous, firstAnalyzedContent: analyzedContent.trim().slice(0, 200) };
    try {
      writeQuestionDraft(window.sessionStorage, { studentId, sessionId, content: next.content, firstAnalyzedContent: next.firstAnalyzedContent, updatedAt: Date.now() });
    } catch { next.status = "error"; }
    memory.current.set(key, next);
    setState(current => current.key === key ? next : current);
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
    markAnalyzed,
    firstAnalyzedContent: state.key === key ? state.firstAnalyzedContent : undefined,
  };
}
