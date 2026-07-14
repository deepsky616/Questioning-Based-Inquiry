"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { SessionReferencePanel } from "@/components/shared/SessionReferencePanel";
import { QuestionSequencePanel } from "./QuestionSequencePanel";
import { DeployedDesignList } from "./DeployedDesignList";
import { ParticipationSection } from "./ParticipationSection";
import { SessionAnalysisCard } from "./SessionAnalysisCard";
import { QuestionEditDialog } from "./QuestionEditDialog";
import { AiAnswerPreviewDialog } from "./AiAnswerPreviewDialog";
import { TeacherQuestionBulkActionBar } from "./TeacherQuestionBulkActionBar";
import { TeacherQuestionListPanel } from "./TeacherQuestionListPanel";
import { TeacherQuestionSessionSelector } from "./TeacherQuestionSessionSelector";
import { TeacherQuestionStatsCard } from "./TeacherQuestionStatsCard";
import { TeacherQuestionTopTabs, type TeacherQuestionTopTab } from "./TeacherQuestionTopTabs";
import { useTeacherQuestionBulkSelection } from "./useTeacherQuestionBulkSelection";
import { useTeacherQuestionQuickActions } from "./useTeacherQuestionQuickActions";
import { useTeacherQuestionViewState } from "./useTeacherQuestionViewState";
import type { QuestionSession, Question, BulkPreview, TeacherQuestionPageResponse } from "./types";
import type { SortField, SortDir } from "@/components/shared/QuestionClassificationStats";
import { getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { appQueryKeys, useTeacherSessions } from "@/lib/app-queries";
import { visibleReportRefetchInterval } from "@/lib/query-refresh";
import { teacherAlertQueryKeys } from "@/lib/teacher-alert-counts";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import {
  buildTeacherQuestionPagePath,
  resolveTeacherQuestionSessionSelection,
  runWhenTeacherQuestionScopeCurrent,
} from "@/lib/teacher-question-page-query";

const TEACHER_QUESTION_PAGE_SIZE = 30;
const EMPTY_QUESTION_PAGE: TeacherQuestionPageResponse = {
  items: [],
  pageInfo: { page: 1, pageSize: TEACHER_QUESTION_PAGE_SIZE, total: 0, totalPages: 1 },
  summary: { total: 0, closure: { closed: 0, open: 0 },
    cognitive: { factual: 0, conceptual: 0, controversial: 0 }, flagged: 0 },
};

export default function QuestionsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted" aria-hidden="true" />}>
      <QuestionsContent />
    </Suspense>
  );
}

function QuestionsContent() {
  const tPages = useTranslations("pages");
  const tCls = useTranslations("classification");
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tSess = useTranslations("sessions");
  const tTarget = useTranslations("targetSelector");
  const ct = useContentTranslation();
  const { search, setSearch, updateViewState, viewState } = useTeacherQuestionViewState();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const filterClosure = viewState.closure;
  const filterCognitive = viewState.cognitive;
  const { clearSelectedIds, selectedIds, selectionRevisionRef, selectAll, toggleSelect } =
    useTeacherQuestionBulkSelection();
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkPreviews, setBulkPreviews] = useState<BulkPreview[] | null>(null);
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});
  const [isSendingPreviews, setIsSendingPreviews] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showBulkSuccess, setShowBulkSuccess] = useState(false);
  const bulkOperationRevisionRef = useRef(0);
  const selectionScope = JSON.stringify(viewState);
  const selectionScopeRef = useRef(selectionScope);
  const runForBulkOperation = (scope: string, revision: number, run: () => void) =>
    runWhenTeacherQuestionScopeCurrent(scope, () => selectionScopeRef.current, run, {
      requestRevision: revision,
      getCurrentRevision: () => bulkOperationRevisionRef.current,
    });
  const runForBulkSelection = (scope: string, operation: number, selection: number, run: () => void) =>
    runWhenTeacherQuestionScopeCurrent(scope, () => selectionScopeRef.current, run, {
      requestRevision: `${operation}:${selection}`,
      getCurrentRevision: () => `${bulkOperationRevisionRef.current}:${selectionRevisionRef.current}`,
    });
  const beginBulkOperation = () => ++bulkOperationRevisionRef.current;
  const sessionsQuery = useTeacherSessions<QuestionSession>();
  const { data: sessions = [] } = sessionsQuery;
  const selectedSessionId = viewState.session;
  const filterDate = viewState.date;
  const filterSubject = viewState.subject;
  const filterTopic = viewState.topic;
  const sortField: SortField = viewState.sort;
  const sortDir: SortDir = viewState.dir;
  const debouncedSearch = viewState.search;
  const page = viewState.page;
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});
  const showFlaggedOnly = viewState.flagged;
  const topTab: TeacherQuestionTopTab = viewState.tab;
  const resetBulkState = useCallback(() => {
    bulkOperationRevisionRef.current += 1;
    clearSelectedIds();
    setBulkPreviews(null);
    setEditedAnswers({});
    setExcludedIds(new Set());
    setBulkMsg(null);
    setShowBulkSuccess(false);
    setIsGeneratingPreviews(false);
    setIsSendingPreviews(false);
    setIsBulkDeleting(false);
    setRegeneratingId(null);
  }, [clearSelectedIds]);
  useEffect(() => {
    selectionScopeRef.current = selectionScope;
    resetBulkState();
    setExpandedCommentId(null);
  }, [resetBulkState, selectionScope]);
  const questionsQuery = useQuery<TeacherQuestionPageResponse>({
    queryKey: [
      "teacher-question-page",
      selectedSessionId,
      filterDate,
      filterSubject,
      filterTopic,
      filterClosure,
      filterCognitive,
      showFlaggedOnly,
      sortField,
      sortDir,
      debouncedSearch,
      page,
    ],
    queryFn: async () => {
      const response = await fetch(buildTeacherQuestionPagePath({
        selectedSessionId,
        filterDate,
        filterSubject,
        filterTopic,
        filterClosure,
        filterCognitive,
        showFlaggedOnly,
        search: debouncedSearch,
        sortField,
        sortDir,
        page,
        pageSize: TEACHER_QUESTION_PAGE_SIZE,
      }));
      if (!response.ok) throw new Error("질문을 불러오지 못했습니다");
      return response.json();
    },
    enabled: topTab === "questions",
    placeholderData: (previous) => previous,
    refetchInterval: visibleReportRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const questionPage = questionsQuery.data ?? EMPTY_QUESTION_PAGE;
  const questions = questionPage.items;
  const { pageInfo, summary } = questionPage;
  const isLoading = questionsQuery.isPending || questionsQuery.isPlaceholderData;
  const reloadQuestions = () => questionsQuery.refetch();
  const { handleToggleLike, handleToggleQuestionPublic } =
    useTeacherQuestionQuickActions(reloadQuestions);
  const reloadSessions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherSessions }),
    [queryClient],
  );
  const confirm = useConfirm();
  const handleSessionChange = (val: string) => {
    updateViewState({ session: val, page: 1 });
    setExpandedCommentId(null);
    resetBulkState();
  };
  const filterOptions = getSessionFilterOptions(sessions);
  // 배포 질문이 있는 설계 수업은 학생의 수업 탐구 질문에서 다룬다.
  const curriculumSessionIds = new Set(
    sessions.filter((s) => s.unitDesignId && !isInquiryDesignSession(s)).map((s) => s.id),
  );
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  }).filter((s) => !curriculumSessionIds.has(s.id));
  useEffect(() => {
    if (!sessionsQuery.isSuccess) return;
    const correctedSessionId = resolveTeacherQuestionSessionSelection({
      selectedSessionId,
      sessionIds: sessions.map((session) => session.id),
      filteredSessionIds: filteredSessions.map((session) => session.id),
    });
    if (!correctedSessionId) return;
    updateViewState({ session: correctedSessionId, page: 1 }, { history: "replace" });
  }, [filteredSessions, selectedSessionId, sessions, sessionsQuery.isSuccess, updateViewState]);

  useEffect(() => {
    if (!questionsQuery.data || questionsQuery.isPlaceholderData || page <= pageInfo.totalPages) return;
    updateViewState({ page: pageInfo.totalPages }, { history: "replace" });
  }, [page, pageInfo.totalPages, questionsQuery.data, questionsQuery.isPlaceholderData, updateViewState]);
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isBulkDeleting) return;
    const requestScope = selectionScopeRef.current;
    const requestSelectionRevision = selectionRevisionRef.current;
    const requestOperationRevision = beginBulkOperation();
    if (!(await confirm({ description: t("bulkDeleteConfirm", { count: ids.length }), confirmText: tc("delete"), destructive: true }))) return;
    if (
      requestScope !== selectionScopeRef.current ||
      requestSelectionRevision !== selectionRevisionRef.current ||
      requestOperationRevision !== bulkOperationRevisionRef.current
    ) return;
    setIsBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/questions/${id}`, { method: "DELETE" })),
      );
      const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok),
      ).length;
      if (
        requestScope !== selectionScopeRef.current ||
        requestOperationRevision !== bulkOperationRevisionRef.current
      ) return;
      if (selectionRevisionRef.current === requestSelectionRevision) resetBulkState();
      if (failed > 0) {
        toast({ variant: "destructive", description: t("bulkDeletePartial", { count: failed }) });
      } else {
        toast({ variant: "success", description: t("bulkDeleteDone", { count: ids.length }) });
      }
      await reloadQuestions();
    } finally {
      runForBulkOperation(requestScope, requestOperationRevision, () => setIsBulkDeleting(false));
    }
  };
  const handlePreviewBulkAi = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const requestScope = selectionScopeRef.current;
    const requestSelectionRevision = selectionRevisionRef.current;
    const requestOperationRevision = beginBulkOperation();
    setIsGeneratingPreviews(true);
    setBulkMsg(null);
    setBulkPreviews(null);
    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`/api/questions/${id}/ai-answer`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const q = questions.find((q) => q.id === id);
          const authorInfo = [
            q?.author.grade && t("gradeLabel", { grade: q.author.grade }),
            q?.author.className && t("classLabel", { className: q.author.className }),
            q?.author.studentNumber && t("numberLabel", { studentNumber: q.author.studentNumber }),
          ].filter(Boolean).join(" ");
          return {
            questionId: id,
            questionContent: q?.content ?? "",
            authorName: q?.author.name ?? "",
            authorInfo,
            answer: (data.answer as string) ?? "",
          };
        })
      );
      const previews = results
        .filter((r): r is PromiseFulfilledResult<BulkPreview> => r.status === "fulfilled")
        .map((r) => r.value);
      runForBulkSelection(
        requestScope, requestOperationRevision, requestSelectionRevision,
        () => {
          if (previews.length === 0) {
            setBulkMsg({ type: "error", text: t("aiAnswerFailedKey") });
          } else {
            const initial: Record<string, string> = {};
            previews.forEach((p) => { initial[p.questionId] = p.answer; });
            setEditedAnswers(initial);
            setExcludedIds(new Set());
            setBulkPreviews(previews);
            if (previews.length < ids.length) {
              setBulkMsg({
                type: "error",
                text: t("aiAnswerPartialFail", { count: ids.length - previews.length }),
              });
            }
          }
        },
      );
    } catch (err) {
      runForBulkSelection(
        requestScope, requestOperationRevision, requestSelectionRevision,
        () => setBulkMsg({ type: "error", text: err instanceof Error ? err.message : t("aiAnswerFailed") }),
      );
    } finally {
      runForBulkOperation(requestScope, requestOperationRevision, () => setIsGeneratingPreviews(false));
    }
  };
  const handleRegenerateAnswer = async (questionId: string) => {
    if (regeneratingId) return;
    const requestScope = selectionScopeRef.current;
    const requestOperationRevision = beginBulkOperation();
    setRegeneratingId(questionId);
    try {
      const res = await fetch(`/api/questions/${questionId}/ai-answer`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("aiAnswerFailed"));
      if (requestScope !== selectionScopeRef.current || requestOperationRevision !== bulkOperationRevisionRef.current) return;
      const answer = (data.answer as string) ?? "";
      setBulkPreviews((prev) => prev ? prev.map((p) => (p.questionId === questionId ? { ...p, answer } : p)) : prev);
      setEditedAnswers((prev) => ({ ...prev, [questionId]: answer }));
    } catch (err) {
      if (requestScope === selectionScopeRef.current && requestOperationRevision === bulkOperationRevisionRef.current) {
        toast({ variant: "destructive", description: err instanceof Error ? err.message : t("aiAnswerFailed") });
      }
    } finally {
      runForBulkOperation(requestScope, requestOperationRevision, () => setRegeneratingId(null));
    }
  };
  const handleConfirmBulkAi = async () => {
    if (!bulkPreviews || bulkPreviews.length === 0) return;
    const targets = bulkPreviews.filter((p) => !excludedIds.has(p.questionId));
    const answerTexts = targets.map((p) => editedAnswers[p.questionId] ?? p.answer);
    if (answerTexts.length === 0) {
      setBulkMsg({ type: "error", text: t("noAnswers") });
      return;
    }
    if (answerTexts.some((a) => !a.trim())) {
      setBulkMsg({ type: "error", text: t("emptyAnswers") });
      return;
    }
    const requestScope = selectionScopeRef.current;
    const requestSelectionRevision = selectionRevisionRef.current;
    const requestOperationRevision = beginBulkOperation();
    setIsSendingPreviews(true);
    setBulkMsg(null);
    try {
      const results = await Promise.allSettled(
        targets.map(async (p) => {
          const answer = (editedAnswers[p.questionId] ?? p.answer).trim();
          const res = await fetch(`/api/questions/${p.questionId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: answer }),
          });
          if (!res.ok) throw new Error(t("sendFailed"));
        })
      );
      const success = results.filter((r) => r.status === "fulfilled").length;
      runForBulkOperation(requestScope, requestOperationRevision, () => {
        setBulkPreviews(null);
        setEditedAnswers({});
        setExcludedIds(new Set());
        setBulkMsg({ type: "success", text: targets.length - success === 0 ? t("bulkSentAll", { count: success }) : t("bulkSentPartial", { success, failed: targets.length - success }) });
        setShowBulkSuccess(true);
        window.setTimeout(() => {
          runForBulkOperation(requestScope, requestOperationRevision, () => {
            if (selectionRevisionRef.current === requestSelectionRevision) {
              clearSelectedIds();
            }
            setBulkMsg(null);
            setShowBulkSuccess(false);
            void reloadQuestions();
          });
        }, 2000);
      });
    } catch (err) {
      runForBulkOperation(requestScope, requestOperationRevision, () => {
        setBulkMsg({ type: "error", text: err instanceof Error ? err.message : t("sendFailedMsg") });
      });
    } finally {
      runForBulkOperation(requestScope, requestOperationRevision, () => setIsSendingPreviews(false));
    }
  };
  const handleDeleteQuestion = async (question: Question) => {
    if (!(await confirm({ description: t("deleteQuestionConfirm", { name: question.author.name }), confirmText: tc("delete"), destructive: true }))) return;
    try {
      const res = await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (selectedQuestion?.id === question.id) setSelectedQuestion(null);
      await reloadQuestions();
    } catch {
      toast({ variant: "destructive", description: t("deleteFailed") });
    }
  };
  const handleClearFlag = async (question: Question) => {
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: false }),
      });
      if (!res.ok) throw new Error();
      await reloadQuestions();
      queryClient.invalidateQueries({ queryKey: teacherAlertQueryKeys.flagged });
    } catch {
      toast({ variant: "destructive", description: t("processFailed") });
    }
  };
  const filtered = questions;
  const displayed = questions;
  const flaggedCount = summary.flagged;
  const currentSession = sessions.find((s) => s.id === selectedSessionId);
  const isAll = selectedSessionId === "all";
  const hasQuestionList = Boolean(currentSession) || isAll;
  const selectedQuestions = questions.filter((q) => selectedIds.has(q.id));
  const previewQuestions = selectedQuestions.slice(0, 3);
  const hiddenPreviewCount = Math.max(selectedQuestions.length - previewQuestions.length, 0);
  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherQuestions.title")} description={tPages("teacherQuestions.description")} />

      <TeacherQuestionTopTabs
        value={topTab}
        onChange={(tab) => updateViewState({ tab })}
        labels={{
          questions: t("tabQuestions"),
          design: t("tabDesign"),
        }}
      />

      <>
      <TeacherQuestionSessionSelector
        sessions={sessions}
        status={sessionsQuery.isError ? "error" : sessionsQuery.isPending ? "loading" : "ready"}
        filterOptions={filterOptions}
        filteredSessions={filteredSessions}
        selectedSessionId={selectedSessionId}
        filterDate={filterDate}
        filterSubject={filterSubject}
        filterTopic={filterTopic}
        onFilterDateChange={(value) => {
          updateViewState({ date: value, page: 1 });
          resetBulkState();
        }}
        onFilterSubjectChange={(value) => {
          updateViewState({ subject: value, page: 1 });
          resetBulkState();
        }}
        onFilterTopicChange={(value) => {
          updateViewState({ topic: value, page: 1 });
          resetBulkState();
        }}
        onSessionChange={handleSessionChange}
        onRetry={() => void sessionsQuery.refetch()}
        labels={{
          loadingSessions: t("loadingSessions"),
          sessionLoadError: t("sessionLoadError"),
          sessionRetry: t("sessionRetry"),
          noSessions: t("noSessions"),
          date: t("date"),
          allDates: t("allDates"),
          subject: t("subject"),
          all: t("all"),
          allSubjects: t("allSubjects"),
          topicFilterLabel: t("topicFilterLabel"),
          allTopics: t("allTopics"),
          classSession: t("classSession"),
          noMatchingSession: t("noMatchingSession"),
          selectSession: t("selectSession"),
          allSessions: t("allSessions"),
          filterHint: topTab === "design" ? t("designFilterHint") : t("filterHint"),
          sessionHint: topTab === "design" ? t("designSessionHint") : undefined,
        }}
      />

      {topTab === "questions" && (
        <div className="space-y-6">
      {/* 학생 참여 현황 — 세션 변경 시 key로 상태 초기화 */}
      {currentSession && (
        <ParticipationSection key={`participation-${currentSession.id}`} sessionId={currentSession.id} sessionDate={currentSession.date} />
      )}

      {/* AI 세션 분석 — 세션 변경 시 key로 상태 초기화, 저장된 분석은 마운트 시 로드 */}
      {currentSession && <SessionAnalysisCard key={`analysis-${currentSession.id}`} sessionId={currentSession.id} />}

      {/* 탐구질문 수업 세션이면 학생 배포 참고자료 표시(접기) — 질문 분류 통계 위 */}
      {currentSession && <SessionReferencePanel sessionId={currentSession.id} />}

      {/* 질문 분류 통계 현황 (비율 막대, 표시 전용) */}
      {hasQuestionList && !questionsQuery.isError && (
        <TeacherQuestionStatsCard
          stats={summary}
          labels={{
            title: t("statsTitle"),
            countSuffix: t("statsCountSuffix", { count: summary.total }),
            category1: tCls("category1"),
            category2: tCls("category2"),
            closure: tCls("closure"),
            cognitive: tCls("cognitive"),
            closedLabel: tCls("closed.label"),
            closedDesc: tCls("closed.desc"),
            openLabel: tCls("open.label"),
            openDesc: tCls("open.desc"),
            factualLabel: tCls("factual.label"),
            factualDesc: tCls("factual.desc"),
            conceptualLabel: tCls("conceptual.label"),
            conceptualDesc: tCls("conceptual.desc"),
            controversialLabel: tCls("controversial.label"),
            controversialDesc: tCls("controversial.desc"),
          }}
        />
      )}

      <TeacherQuestionListPanel
        hasQuestionList={hasQuestionList}
        isLoading={isLoading}
        isError={questionsQuery.isError}
        filtered={filtered}
        displayed={displayed}
        totalCount={pageInfo.total}
        pageInfo={pageInfo}
        search={search}
        showFlaggedOnly={showFlaggedOnly}
        flaggedCount={flaggedCount}
        sortField={sortField}
        sortDir={sortDir}
        filterClosure={filterClosure}
        filterCognitive={filterCognitive}
        selectedSessionId={selectedSessionId}
        selectedIds={selectedIds}
        expandedCommentId={expandedCommentId}
        commentCountOverride={commentCountOverride}
        contentTranslation={ct}
        onSearchChange={(value) => {
          setSearch(value);
          resetBulkState();
        }}
        onToggleFlaggedOnly={() => {
          updateViewState((current) => ({ flagged: !current.flagged, page: 1 }));
          resetBulkState();
        }}
        onSortChange={(field, dir) => {
          updateViewState({ sort: field, dir, page: 1 });
          resetBulkState();
        }}
        onFilterClosureChange={(value) => {
          updateViewState({ closure: value, page: 1 });
          resetBulkState();
        }}
        onFilterCognitiveChange={(value) => {
          updateViewState({ cognitive: value, page: 1 });
          resetBulkState();
        }}
        onResetClassificationFilters={() => {
          updateViewState({ closure: "all", cognitive: "all", page: 1 });
          resetBulkState();
        }}
        onSelectAll={selectAll}
        onClearSelection={resetBulkState}
        onToggleSelect={toggleSelect}
        onToggleComment={(id) => setExpandedCommentId((prev) => (prev === id ? null : id))}
        onCommentCountChange={(id, count) => setCommentCountOverride((prev) => ({ ...prev, [id]: count }))}
        onClearFlag={handleClearFlag}
        onToggleLike={handleToggleLike}
        onToggleQuestionPublic={handleToggleQuestionPublic}
        onEditQuestion={setSelectedQuestion}
        onDeleteQuestion={handleDeleteQuestion}
        onPageChange={(nextPage) => {
          updateViewState({ page: nextPage });
          setExpandedCommentId(null);
          resetBulkState();
        }}
        onQuestionsRetry={() => void questionsQuery.refetch()}
      />

        </div>
      )}

      {topTab === "design" && (
        <div className="space-y-6">

      {/* 질문 중심 탐구설계 (항상 열림) */}
      {currentSession && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-1.5 text-base font-semibold leading-none tracking-tight text-foreground">
            <span>🧩</span>
            {t("sequenceTitle")}
          </div>
          <div className="mt-3">
            <QuestionSequencePanel
              sessionId={currentSession.id}
              subject={currentSession.subject}
              topic={currentSession.topic}
              onDeployed={reloadSessions}
            />
          </div>
        </div>
      )}

      {/* 배포한 탐구설계 목록 (수업세션별) — 조회·정렬·접기·수정·삭제 포함 */}
      <DeployedDesignList sessions={sessions} onChanged={reloadSessions} />

        </div>
      )}

      <QuestionEditDialog
        question={selectedQuestion}
        onClose={() => setSelectedQuestion(null)}
        onSaved={() => void reloadQuestions()}
      />

      {topTab === "questions" && <AiAnswerPreviewDialog
        previews={bulkPreviews}
        editedAnswers={editedAnswers}
        onEditAnswer={(questionId, text) =>
          setEditedAnswers((prev) => ({ ...prev, [questionId]: text }))
        }
        excludedIds={excludedIds}
        onToggleExclude={(questionId) =>
          setExcludedIds((prev) => {
            const next = new Set(prev);
            if (next.has(questionId)) next.delete(questionId);
            else next.add(questionId);
            return next;
          })
        }
        regeneratingId={regeneratingId}
        onRegenerate={handleRegenerateAnswer}
        isSending={isSendingPreviews}
        errorText={bulkMsg?.type === "error" ? bulkMsg.text : null}
        onConfirm={handleConfirmBulkAi}
        onDismiss={() => { setBulkPreviews(null); setEditedAnswers({}); }}
        onCancel={() => { setBulkPreviews(null); setEditedAnswers({}); setExcludedIds(new Set()); setBulkMsg(null); }}
      />}

      {topTab === "questions" && (
        <TeacherQuestionBulkActionBar
        selectedCount={selectedIds.size}
        previewQuestions={previewQuestions}
        hiddenPreviewCount={hiddenPreviewCount}
        isGeneratingPreviews={isGeneratingPreviews}
        isSendingPreviews={isSendingPreviews}
        isBulkDeleting={isBulkDeleting}
        bulkMsg={bulkMsg}
        showBulkSuccess={showBulkSuccess}
        onClearSelection={resetBulkState}
        onPreviewBulkAi={handlePreviewBulkAi}
        onBulkDelete={handleBulkDelete}
        labels={{
          selectedLabel: t("bulkSelectedLabel"),
          title: t("bulkPanelTitle"),
          description: t("bulkPanelDesc"),
          deselect: t("deselect"),
          plusCount: (count) => t("plusCount", { count }),
          aiGenerating: t("aiGeneratingBulk"),
          aiPreview: t("aiPreviewBtn"),
          bulkDeleting: t("bulkDeleting"),
          bulkDelete: t("bulkDeleteBtn"),
        }}
        />
      )}
      </>
    </div>
  );
}
