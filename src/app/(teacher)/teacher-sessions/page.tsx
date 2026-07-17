"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CircleAlert, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isSessionAvailable, sortSessionsAsc, sortSessionsDesc, compareSessionsDesc, getSessionFilterOptions, filterSessions, groupSessionsByMonth } from "@/lib/sessions";
import { appQueryKeys, useTeacherSessions, useTeacherStudents } from "@/lib/app-queries";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations } from "next-intl";
import { TeacherSessionListControls, type SessionListSort, type SessionParticipationFilter } from "./TeacherSessionListControls";
import { TeacherSessionSummaryGrid } from "./TeacherSessionSummaryGrid";
import { TeacherQuestionClassActions } from "./TeacherQuestionClassActions";
import { QuestionClassViewHeader } from "./QuestionClassViewHeader";
import { QuestionClassWorkspaceNav } from "./QuestionClassWorkspaceNav";
import { TeacherSessionMonthList } from "./TeacherSessionMonthList";
import type { QuestionSession } from "./types";
import {
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";

export default function TeacherSessionsPage() {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-md bg-muted" />}>
      <TeacherSessionsPageContent />
    </Suspense>
  );
}

function TeacherSessionsPageContent() {
  const tPages = useTranslations("pages");
  const t = useTranslations("sessions");
  const tc = useTranslations("common");
  const tSeq = useTranslations("sequencePanel");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session")?.trim() || null;
  const activeView = searchParams.get("view") === "quick" ? "quick" : "list";
  const { data: sessions = [], isLoading, isError, refetch } =
    useTeacherSessions<QuestionSession>();
  // 기존 낙관적 업데이트 호출부를 그대로 유지하기 위해 캐시 기록 함수를 setSessions 이름으로 제공한다.
  const setSessions = (updater: (prev: QuestionSession[]) => QuestionSession[]) =>
    queryClient.setQueryData<QuestionSession[]>(appQueryKeys.teacherSessions, (prev) => updater(prev ?? []));
  const { data: targetData } = useTeacherStudents<SessionTargetStudent, SessionTargetClass>();
  const students = useMemo(() => targetData?.students ?? [], [targetData]);
  const teacherClasses = useMemo(() => targetData?.teacherClasses ?? [], [targetData]);
  const [createdHighlightSessionId, setCreatedHighlightSessionId] = useState<string | null>(null);
  const [dismissedRequestedSessionId, setDismissedRequestedSessionId] = useState<string | null>(null);
  const highlightSessionId =
    createdHighlightSessionId ??
    (requestedSessionId && requestedSessionId !== dismissedRequestedSessionId
      ? requestedSessionId
      : null);
  // 세션 목록 조회/정렬 상태
  const [listFilterDate, setListFilterDate] = useState("");
  const [listFilterSubject, setListFilterSubject] = useState("");
  const [listFilterTopic, setListFilterTopic] = useState("");
  const [listSearch, setListSearch] = useState("");
  // 지난 세션 월 그룹 펼침 상태 — null이면 기본값(가장 최근 달만 펼침)
  const [expandedPastMonths, setExpandedPastMonths] = useState<Set<string> | null>(null);
  const [listParticipationFilter, setListParticipationFilter] = useState<SessionParticipationFilter>("all");
  const [listSort, setListSort] = useState<SessionListSort>("desc");
  const pendingSessionIdsRef = useRef<Set<string>>(new Set());
  const [pendingSessionIds, setPendingSessionIds] = useState<Set<string>>(new Set());

  const beginSessionMutation = (id: string) => {
    if (pendingSessionIdsRef.current.has(id)) return false;
    const next = new Set(pendingSessionIdsRef.current);
    next.add(id);
    pendingSessionIdsRef.current = next;
    setPendingSessionIds(next);
    return true;
  };

  const finishSessionMutation = (id: string) => {
    const next = new Set(pendingSessionIdsRef.current);
    next.delete(id);
    pendingSessionIdsRef.current = next;
    setPendingSessionIds(next);
  };

  const handleHighlight = (sessionId: string) => {
    setListFilterDate("");
    setListFilterSubject("");
    setListFilterTopic("");
    setListSearch("");
    setListParticipationFilter("all");
    setDismissedRequestedSessionId(requestedSessionId);
    setCreatedHighlightSessionId(sessionId);
  };

  const toggleFailed = () => toast({ variant: "destructive", description: t("toggleFailed") });

  const patchSession = async (id: string, patch: Partial<QuestionSession>) => {
    try {
      const response = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const recoverFailedChange = async () => {
    toggleFailed();
    await Promise.resolve(refetch()).catch(() => undefined);
  };

  const cancelPendingSessionList = () =>
    queryClient.cancelQueries({ queryKey: appQueryKeys.teacherSessions, exact: true });

  const refreshSessionList = () => {
    void queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherSessions });
  };

  const confirm = useConfirm();

  const handleDelete = async (id: string) => {
    if (!beginSessionMutation(id)) return;
    try {
      if (!(await confirm({ description: t("deleteConfirm"), confirmText: tc("delete"), destructive: true }))) return;
      await cancelPendingSessionList();
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" }).catch(() => null);
      if (!res || !res.ok) {
        toast({ variant: "destructive", description: t("deleteFailed") });
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      refreshSessionList();
    } finally {
      finishSessionMutation(id);
    }
  };

  const handleToggleSetting = async (
    id: string,
    key: "isActive" | "defaultQuestionPublic" | "likesVisibleToPeers" | "commentsVisibleToPeers",
    currentValue: boolean,
  ) => {
    if (!beginSessionMutation(id)) return;
    try {
      await cancelPendingSessionList();
      const next = !currentValue;
      setSessions((prev) =>
        prev.map((session) => (session.id === id ? { ...session, [key]: next } : session)),
      );
      if (!(await patchSession(id, { [key]: next }))) {
        setSessions((prev) =>
          prev.map((session) => (
            session.id === id ? { ...session, [key]: currentValue } : session
          )),
        );
        await recoverFailedChange();
      } else {
        refreshSessionList();
      }
    } finally {
      finishSessionMutation(id);
    }
  };

  const handleToggleActive = (id: string, currentValue: boolean) =>
    handleToggleSetting(id, "isActive", currentValue);

  const handleTogglePublic = (id: string, currentValue: boolean) =>
    handleToggleSetting(id, "defaultQuestionPublic", currentValue);

  const handleToggleCommentsVisible = (id: string, currentValue: boolean) =>
    handleToggleSetting(id, "commentsVisibleToPeers", currentValue);

  // 날짜·교과·주제 수정 저장 (탐구질문 세션은 교과 제외)
  const handleEditSave = async (id: string, patch: { date: string; subject?: string; topic: string }): Promise<boolean> => {
    if (!beginSessionMutation(id)) return false;
    try {
      await cancelPendingSessionList();
      if (!(await patchSession(id, patch))) {
        await recoverFailedChange();
        return false;
      }
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      refreshSessionList();
      return true;
    } finally {
      finishSessionMutation(id);
    }
  };

  const handleToggleLikes = (id: string, currentValue: boolean) =>
    handleToggleSetting(id, "likesVisibleToPeers", currentValue);

  // 세션 목록 조회 필터(날짜·교과·주제·참여 상태) + 정렬
  const filterOptions = getSessionFilterOptions(sessions);
  const baseVisibleSessions = filterSessions(sessions, {
    date: listFilterDate || undefined,
    subject: listFilterSubject || undefined,
    topic: listFilterTopic || undefined,
  });
  const searchQuery = listSearch.trim().toLowerCase();
  const searchedSessions = searchQuery
    ? baseVisibleSessions.filter(
        (s) => s.topic.toLowerCase().includes(searchQuery) || s.subject.toLowerCase().includes(searchQuery),
      )
    : baseVisibleSessions;
  const visibleSessions = searchedSessions.filter((item) => {
    const missing = item.participation?.missing ?? 0;
    const total = item.participation?.total ?? 0;
    if (listParticipationFilter === "missing") return missing > 0;
    if (listParticipationFilter === "completed") return total > 0 && missing === 0;
    return true;
  });
  const sortedSessions =
    listSort === "asc"
      ? sortSessionsAsc(visibleSessions)
      : listSort === "missingDesc"
        ? [...visibleSessions].sort((a, b) => {
            const missingDiff = (b.participation?.missing ?? 0) - (a.participation?.missing ?? 0);
            if (missingDiff !== 0) return missingDiff;
            return compareSessionsDesc(a, b);
          })
        : sortSessionsDesc(visibleSessions);
  const activeSessions = sortedSessions.filter((s) => isSessionAvailable(s.date));
  const pastSessions = sortedSessions.filter((s) => !isSessionAvailable(s.date));
  const listMonthDirection = listSort === "asc" ? "asc" : "desc";
  const activeSessionMonthGroups = groupSessionsByMonth(activeSessions, listMonthDirection);
  const pastSessionMonthGroups = groupSessionsByMonth(pastSessions, listMonthDirection);
  const missingSessionCount = sortedSessions.filter((s) => (s.participation?.missing ?? 0) > 0).length;
  const completedSessionCount = sortedSessions.filter((s) => {
    const total = s.participation?.total ?? 0;
    return total > 0 && (s.participation?.missing ?? 0) === 0;
  }).length;
  const totalMissingStudents = sortedSessions.reduce((sum, s) => sum + (s.participation?.missing ?? 0), 0);
  const highlightedSessionIsVisible = Boolean(
    highlightSessionId && sortedSessions.some((session) => session.id === highlightSessionId),
  );
  const highlightedPastMonthKey = highlightSessionId
    ? pastSessionMonthGroups.find((group) =>
        group.sessions.some((session) => session.id === highlightSessionId),
      )?.key ?? null
    : null;

  useEffect(() => {
    if (!highlightedPastMonthKey) return;
    setExpandedPastMonths((current) => {
      if (current?.has(highlightedPastMonthKey)) return current;
      const next = new Set(current ?? []);
      next.add(highlightedPastMonthKey);
      return next;
    });
  }, [highlightedPastMonthKey]);

  useEffect(() => {
    if (!highlightSessionId || !highlightedSessionIsVisible) return;
    const timeout = window.setTimeout(() => {
      setCreatedHighlightSessionId((current) =>
        current === highlightSessionId ? null : current,
      );
      if (requestedSessionId === highlightSessionId) {
        setDismissedRequestedSessionId(requestedSessionId);
      }
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [highlightSessionId, highlightedSessionIsVisible, requestedSessionId]);

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherSessions.title")} description={tPages("teacherSessions.description")} />

      <QuestionClassWorkspaceNav activeView={activeView} />

      <QuestionClassViewHeader
        title={activeView === "quick" ? t("quickViewTitle") : t("listViewTitle")}
        description={activeView === "quick" ? t("quickViewDesc") : t("listViewDesc")}
      />

      {activeView === "quick" ? (
        <TeacherQuestionClassActions
          students={students}
          teacherClasses={teacherClasses}
          targetsReady={Boolean(targetData)}
          onHighlight={handleHighlight}
        />
      ) : isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("loading")}</div>
      ) : isError ? (
        <EmptyState
          icon={<CircleAlert className="h-8 w-8" />}
          title={t("loadFailedTitle")}
          description={t("loadFailedDesc")}
          action={(
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("retry")}
            </Button>
          )}
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="h-8 w-8" />}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
        />
      ) : (
        <Card className="teacher-sessions-desktop-management">
          <CardHeader className="pb-3 space-y-3">
            <TeacherSessionSummaryGrid
              activeCount={activeSessions.length}
              pastCount={pastSessions.length}
              missingSessionCount={missingSessionCount}
              completedSessionCount={completedSessionCount}
              totalMissingStudents={totalMissingStudents}
            />
            <TeacherSessionListControls
              filterOptions={filterOptions}
              sessions={sessions}
              filterDate={listFilterDate}
              filterSubject={listFilterSubject}
              filterTopic={listFilterTopic}
              search={listSearch}
              participationFilter={listParticipationFilter}
              sort={listSort}
              onFilterDate={setListFilterDate}
              onFilterSubject={setListFilterSubject}
              onFilterTopic={setListFilterTopic}
              onSearch={setListSearch}
              onParticipationFilter={setListParticipationFilter}
              onSort={setListSort}
              onReset={() => {
                setListFilterDate("");
                setListFilterSubject("");
                setListFilterTopic("");
                setListSearch("");
                setListParticipationFilter("all");
              }}
            />
          </CardHeader>
          <CardContent className="space-y-5">
            {activeSessions.length === 0 && pastSessions.length === 0 && (
              <EmptyState icon="🔍" title={t("noMatch")} description={t("noMatchDesc")} />
            )}

            {activeSessions.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    {t("upcomingSessions")}
                    <span className="text-xs font-normal text-muted-foreground">{t("countSuffix", { count: activeSessions.length })}</span>
                  </h3>
                  <div className="hidden lg:flex items-center gap-5 pr-4 text-xs font-normal text-foreground whitespace-nowrap">
                    <span className="w-20 text-center">{tSeq("activeLabel")}</span>
                    <span className="w-20 text-center">{tSeq("publicLabel")}</span>
                    <span className="w-20 text-center">{tSeq("likesLabel")}</span>
                    <span className="w-20 text-center">{tSeq("commentsLabel")}</span>
                    <span className="w-24 text-center">{t("colManage")}</span>
                  </div>
                </div>
                <TeacherSessionMonthList
                  groups={activeSessionMonthGroups}
                  highlightSessionId={highlightSessionId}
                  pendingSessionIds={pendingSessionIds}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onTogglePublic={handleTogglePublic}
                  onToggleLikes={handleToggleLikes}
                  onToggleCommentsVisible={handleToggleCommentsVisible}
                  onEditSave={handleEditSave}
                />
              </section>
            )}

            {pastSessions.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />
                    {t("pastSessions")}
                    <span className="text-xs font-normal text-muted-foreground">{t("countSuffix", { count: pastSessions.length })}</span>
                  </h3>
                  <div className="hidden lg:flex items-center gap-5 pr-4 text-xs font-normal text-foreground whitespace-nowrap">
                    <span className="w-20 text-center">{tSeq("activeLabel")}</span>
                    <span className="w-20 text-center">{tSeq("publicLabel")}</span>
                    <span className="w-20 text-center">{tSeq("likesLabel")}</span>
                    <span className="w-20 text-center">{tSeq("commentsLabel")}</span>
                    <span className="w-24 text-center">{t("colManage")}</span>
                  </div>
                </div>
                <TeacherSessionMonthList
                  groups={pastSessionMonthGroups}
                  highlightSessionId={highlightSessionId}
                  pendingSessionIds={pendingSessionIds}
                  collapsible
                  forceOpen={Boolean(searchQuery || listFilterDate || listFilterSubject || listFilterTopic)}
                  expandedKeys={expandedPastMonths}
                  onToggleGroup={(key, defaultExpanded) =>
                    setExpandedPastMonths((prev) => {
                      const next = new Set(prev ?? defaultExpanded);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onTogglePublic={handleTogglePublic}
                  onToggleLikes={handleToggleLikes}
                  onToggleCommentsVisible={handleToggleCommentsVisible}
                  onEditSave={handleEditSave}
                />
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
