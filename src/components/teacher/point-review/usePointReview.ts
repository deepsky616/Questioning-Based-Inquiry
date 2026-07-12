"use client";

// AI 추천 포인트 검토의 전체 상태·로직 — 화면과 분리된 훅.
// 조회(loadPending)·분석 실행(runAnalyze)·승인/거부(decide)·구제 승인
// (decideWithOverride)·선택/필터 파생값까지 여기서 관리하고,
// PointReviewView는 이 훅의 반환값을 조립만 한다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildSessionLabel,
  filterSessions,
  getSessionFilterOptions,
  groupSessionDatesByMonth,
  groupSessionsByMonth,
} from "@/lib/sessions";
import { useTeacherSessions } from "@/lib/app-queries";
import { MAX_ANALYZE_SESSIONS, type AnalyzeResponse, type PendingLog, type SessionItem } from "./types";

export function usePointReview() {
  const t = useTranslations("pointReview");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: sessions = [] } = useTeacherSessions<SessionItem>();
  const [selectedAnalysisSessionIds, setSelectedAnalysisSessionIds] = useState<Set<string>>(new Set());
  const [lastAnalyzedSessionIds, setLastAnalyzedSessionIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [overrideEdit, setOverrideEdit] = useState<Record<string, number>>({});
  const [reviewFilterDate, setReviewFilterDate] = useState("");
  const [reviewFilterSubject, setReviewFilterSubject] = useState("");
  const [reviewFilterTopic, setReviewFilterTopic] = useState("");
  const [reviewSelectedSessionId, setReviewSelectedSessionId] = useState("all");
  const focusStudentId = searchParams.get("studentId");

  // 항상 전체를 받아 클라이언트에서 필터한다 — 세션을 바꿔도 다른 세션의 대기
  // 항목이 "사라진" 것처럼 보이지 않고, 세션 선택지에 대기 건수도 보여줄 수 있다.
  const loadPending = useCallback(() => {
    fetch("/api/teacher/points/pending").then((r) => r.json()).then((d) => {
      setPending(d.pending ?? []);
      setSelected(new Set());
    }).catch(() => {});
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { setSelected(new Set()); }, [focusStudentId]);

  async function runAnalyze() {
    const sessionIds = Array.from(selectedAnalysisSessionIds);
    if (sessionIds.length === 0) {
      setMessage(t("selectSessionFirst"));
      return;
    }
    if (sessionIds.length > MAX_ANALYZE_SESSIONS) {
      setMessage(t("selectTooMany", { max: MAX_ANALYZE_SESSIONS }));
      return;
    }
    setBusy(true); setAiLoading(true); setMessage(null);
    try {
      const results: AnalyzeResponse[] = [];
      for (const sessionId of sessionIds) {
        const res = await fetch("/api/teacher/points/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json() as AnalyzeResponse;
        if (!res.ok) {
          setMessage(data.error || t("analyzeFailed"));
          return;
        }
        results.push(data);
      }
      const failed = results.filter((data) => data.aiStatus === "failed");
      const created = results.reduce((sum, data) => sum + (data.createdPending ?? 0), 0);
      const questions = results.reduce((sum, data) => sum + (data.questionCount ?? 0), 0);
      const comments = results.reduce((sum, data) => sum + (data.commentCount ?? 0), 0);
      if (failed.length === results.length && failed[0]) {
        const fallback = results.some((data) => data.fallbackUsed) ? ` ${t("fallbackUsed")}` : "";
        const key = failed[0].aiErrorType === "missing_key"
          ? "aiErrorMissingKey"
          : failed[0].aiErrorType === "quota"
          ? "aiErrorQuota"
          : failed[0].aiErrorType === "busy"
          ? "aiErrorBusy"
          : failed[0].aiErrorType === "invalid_response"
          ? "aiErrorInvalidResponse"
          : "aiErrorUnknown";
        setMessage(`${t(key)}${fallback}`);
      } else if (failed.length > 0) {
        setMessage(t("analyzePartialDone", { sessions: sessionIds.length, failed: failed.length, created, questions, comments }));
      } else {
        setMessage(t("analyzeDoneMulti", { sessions: sessionIds.length, created, questions, comments }));
      }
      // 분석 후 전체 보기로 전환 — 기존 세션들의 대기 항목과 새 결과가 함께 보인다
      setLastAnalyzedSessionIds(new Set(sessionIds));
      setSelectedAnalysisSessionIds(new Set());
      loadPending();
    } catch { setMessage(t("networkError")); }
    finally { setBusy(false); setAiLoading(false); }
  }

  async function decide(decision: "APPROVE" | "REJECT", ids?: string[]) {
    const targetIds = ids ?? Array.from(selected);
    if (targetIds.length === 0) return;
    setBusy(true);
    try {
      await fetch("/api/teacher/points/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, decision }),
      });
      setMessage(decision === "APPROVE" ? t("resultApproved", { count: targetIds.length }) : t("resultRejected", { count: targetIds.length }));
      loadPending();
      queryClient.invalidateQueries({ queryKey: ["pending-review-count"] });
      queryClient.invalidateQueries({ queryKey: ["flagged-count"] });
    } catch {} finally { setBusy(false); }
  }

  async function decideWithOverride(logId: string, points: number) {
    setBusy(true);
    try {
      await fetch("/api/teacher/points/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [logId], decision: "APPROVE", overridePoints: points }),
      });
      setMessage(t("overrideApproved", { points }));
      loadPending();
      queryClient.invalidateQueries({ queryKey: ["pending-review-count"] });
    } catch {} finally { setBusy(false); }
  }

  const pendingCountBySession = pending.reduce<Record<string, number>>((acc, p) => {
    const key = p.sessionId ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const pendingSessionIds = useMemo(
    () => new Set(pending.map((p) => p.sessionId).filter((id): id is string => Boolean(id))),
    [pending],
  );
  const pendingSessions = useMemo(
    () => sessions.filter((session) => pendingSessionIds.has(session.id)),
    [pendingSessionIds, sessions],
  );
  const reviewDateOptions = getSessionFilterOptions(pendingSessions).dates;
  const reviewDateMonthGroups = groupSessionDatesByMonth(reviewDateOptions);
  const reviewSubjectBase = filterSessions(pendingSessions, { date: reviewFilterDate || undefined });
  const reviewSubjectOptions = getSessionFilterOptions(reviewSubjectBase).subjects;
  const reviewTopicBase = filterSessions(reviewSubjectBase, { subject: reviewFilterSubject || undefined });
  const reviewTopicOptions = getSessionFilterOptions(reviewTopicBase).topics;
  const reviewFilteredSessions = filterSessions(reviewTopicBase, { topic: reviewFilterTopic || undefined });
  const reviewSessionMonthGroups = groupSessionsByMonth(reviewFilteredSessions);
  const hasReviewFilter = Boolean(reviewFilterDate || reviewFilterSubject || reviewFilterTopic || reviewSelectedSessionId !== "all");
  const visiblePending = pending.filter((p) => {
    if (reviewSelectedSessionId !== "all") return p.sessionId === reviewSelectedSessionId;
    if (!reviewFilterDate && !reviewFilterSubject && !reviewFilterTopic) return true;
    if (!p.sessionId) return false;
    const session = sessionById.get(p.sessionId);
    if (!session) return false;
    return (
      (!reviewFilterDate || session.date === reviewFilterDate) &&
      (!reviewFilterSubject || session.subject === reviewFilterSubject) &&
      (!reviewFilterTopic || session.topic === reviewFilterTopic)
    );
  });
  const sessionMonthGroups = groupSessionsByMonth(sessions);

  // 세션별 그룹 — 방금 분석한 세션 먼저, 나머지는 세션 날짜 내림차순
  const sessionLabelOf = (sessionId: string | null) => {
    if (!sessionId) return t("noSessionGroup");
    const s = sessions.find((x) => x.id === sessionId);
    return s ? buildSessionLabel(s.date, s.subject, s.topic) : t("noSessionGroup");
  };
  const groupBySession = (rows: PendingLog[]) => {
    const map = new Map<string, PendingLog[]>();
    rows.forEach((p) => {
      const key = p.sessionId ?? "none";
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    const dateOf = (key: string) => sessions.find((x) => x.id === key)?.date ?? "";
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (lastAnalyzedSessionIds.has(a) && !lastAnalyzedSessionIds.has(b)) return -1;
        if (lastAnalyzedSessionIds.has(b) && !lastAnalyzedSessionIds.has(a)) return 1;
        return dateOf(b).localeCompare(dateOf(a));
      })
      .map(([key, groupRows]) => ({
        key,
        label: sessionLabelOf(key === "none" ? null : key),
        justAnalyzed: lastAnalyzedSessionIds.has(key),
        rows: groupRows,
      }));
  };

  const duplicateRows = visiblePending.filter((p) => p.bonusType.includes("FLAGGED"));
  const normalRows = visiblePending.filter((p) => !p.bonusType.includes("FLAGGED"));
  const focusedPending = focusStudentId ? visiblePending.filter((p) => p.studentId === focusStudentId) : visiblePending;
  const displayedDuplicateRows = focusStudentId ? duplicateRows.filter((p) => p.studentId === focusStudentId) : duplicateRows;
  const displayedNormalRows = focusStudentId ? normalRows.filter((p) => p.studentId === focusStudentId) : normalRows;
  const displayedDuplicateIds = displayedDuplicateRows.map((p) => p.id);
  const displayedNormalIds = displayedNormalRows.map((p) => p.id);
  const selectedDuplicateIds = displayedDuplicateIds.filter((id) => selected.has(id));
  const selectedNormalIds = displayedNormalIds.filter((id) => selected.has(id));
  const allDisplayedDuplicateSelected = displayedDuplicateIds.length > 0 && displayedDuplicateIds.every((id) => selected.has(id));
  const allDisplayedNormalSelected = displayedNormalIds.length > 0 && displayedNormalIds.every((id) => selected.has(id));
  const focusStudentName = focusedPending[0]?.studentName;

  function toggleIds(ids: string[], allSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleAllDuplicates() {
    toggleIds(displayedDuplicateIds, allDisplayedDuplicateSelected);
  }

  function toggleAllNormal() {
    toggleIds(displayedNormalIds, allDisplayedNormalSelected);
  }

  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function setOverrideRow(id: string, value: number) {
    setOverrideEdit((s) => ({ ...s, [id]: value }));
  }

  function clearAnalysisSelection() {
    setSelectedAnalysisSessionIds(new Set());
  }

  function toggleAnalysisSession(sessionId: string) {
    setMessage(null);
    setSelectedAnalysisSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        return next;
      }
      if (next.size >= MAX_ANALYZE_SESSIONS) {
        setMessage(t("selectTooMany", { max: MAX_ANALYZE_SESSIONS }));
        return next;
      }
      next.add(sessionId);
      return next;
    });
  }

  function toggleMonthSessions(sessionIds: string[]) {
    setMessage(null);
    setSelectedAnalysisSessionIds((prev) => {
      const next = new Set(prev);
      const allSelected = sessionIds.every((id) => next.has(id));
      if (allSelected) {
        sessionIds.forEach((id) => next.delete(id));
        return next;
      }
      for (const id of sessionIds) {
        if (next.size >= MAX_ANALYZE_SESSIONS) {
          setMessage(t("selectTooMany", { max: MAX_ANALYZE_SESSIONS }));
          break;
        }
        next.add(id);
      }
      return next;
    });
  }

  function resetReviewFilter() {
    setReviewFilterDate("");
    setReviewFilterSubject("");
    setReviewFilterTopic("");
    setReviewSelectedSessionId("all");
  }

  useEffect(() => {
    if (reviewFilterSubject && !reviewSubjectOptions.includes(reviewFilterSubject)) {
      setReviewFilterSubject("");
      setReviewFilterTopic("");
      setReviewSelectedSessionId("all");
      return;
    }
    if (reviewFilterTopic && !reviewTopicOptions.includes(reviewFilterTopic)) {
      setReviewFilterTopic("");
      setReviewSelectedSessionId("all");
      return;
    }
    if (
      reviewSelectedSessionId !== "all" &&
      !reviewFilteredSessions.some((session) => session.id === reviewSelectedSessionId)
    ) {
      setReviewSelectedSessionId("all");
    }
  }, [
    reviewFilterSubject,
    reviewFilterTopic,
    reviewFilteredSessions,
    reviewSelectedSessionId,
    reviewSubjectOptions,
    reviewTopicOptions,
  ]);

  return {
    // 분석 실행
    sessionMonthGroups,
    selectedAnalysisSessionIds,
    toggleAnalysisSession,
    toggleMonthSessions,
    clearAnalysisSelection,
    runAnalyze,
    pendingCountBySession,
    busy,
    aiLoading,
    message,
    loadPending,
    // 결과 필터
    pendingSessions,
    visiblePending,
    reviewFilterDate, setReviewFilterDate,
    reviewFilterSubject, setReviewFilterSubject,
    reviewFilterTopic, setReviewFilterTopic,
    reviewSelectedSessionId, setReviewSelectedSessionId,
    reviewDateMonthGroups,
    reviewSubjectOptions,
    reviewTopicOptions,
    reviewFilteredSessions,
    reviewSessionMonthGroups,
    hasReviewFilter,
    resetReviewFilter,
    // 목록·선택·결정
    groupBySession,
    displayedDuplicateRows,
    displayedNormalRows,
    selectedDuplicateIds,
    selectedNormalIds,
    allDisplayedDuplicateSelected,
    allDisplayedNormalSelected,
    toggleAllDuplicates,
    toggleAllNormal,
    toggleOne,
    selected,
    decide,
    decideWithOverride,
    overrideEdit,
    setOverrideRow,
    // 학생 포커스
    focusStudentId,
    focusStudentName,
    focusedPending,
  };
}
