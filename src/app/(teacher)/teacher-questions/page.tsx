"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { buildTeacherQuestionPagePath } from "@/lib/teacher-question-page-query";

const TEACHER_QUESTION_PAGE_SIZE = 30;
const EMPTY_QUESTION_PAGE: TeacherQuestionPageResponse = {
  items: [],
  pageInfo: { page: 1, pageSize: TEACHER_QUESTION_PAGE_SIZE, total: 0, totalPages: 1 },
  summary: { total: 0, closure: { closed: 0, open: 0 },
    cognitive: { factual: 0, conceptual: 0, controversial: 0 }, flagged: 0 },
};

export default function QuestionsPage() {
  const tPages = useTranslations("pages");
  const tCls = useTranslations("classification");
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tSess = useTranslations("sessions");
  const tTarget = useTranslations("targetSelector");
  const ct = useContentTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [filterClosure, setFilterClosure] = useState<"all" | "closed" | "open">("all");
  const [filterCognitive, setFilterCognitive] = useState<"all" | "factual" | "conceptual" | "controversial">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [bulkPreviews, setBulkPreviews] = useState<BulkPreview[] | null>(null);
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});
  const [isSendingPreviews, setIsSendingPreviews] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showBulkSuccess, setShowBulkSuccess] = useState(false);

  const { data: sessions = [] } = useTeacherSessions<QuestionSession>();
  const [selectedSessionId, setSelectedSessionId] = useState("all");

  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  const [sortField, setSortField] = useState<SortField>("student");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [topTab, setTopTab] = useState<TeacherQuestionTopTab>("questions");

  // 알림에서 들어온 쿼리 처리(마운트 시 1회 읽어 Suspense 회피)
  //  - ?flagged=1: 부적절 의심 필터 켜기
  //  - ?tab=review: 이전 AI 추천 포인트 주소를 새 순위/포인트 화면으로 이동
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("flagged") === "1") setShowFlaggedOnly(true);
    if (params.get("tab") === "review") {
      params.set("tab", "points");
      router.replace(`/teacher-points?${params.toString()}`, { scroll: false });
    }
  }, [router]);

  const resetBulkState = () => {
    setSelectedIds(new Set());
    setBulkPreviews(null);
    setEditedAnswers({});
    setExcludedIds(new Set());
    setBulkMsg(null);
    setShowBulkSuccess(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

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

  // 배포 삭제·재배포 후 세션 목록(sharedQuestions)을 최신화한다(선택/조회 상태는 유지).
  // 공유 쿼리를 무효화하면 teacher-sessions에도 반영된다.
  const reloadSessions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherSessions }),
    [queryClient],
  );

  const confirm = useConfirm();

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    setPage(1);
    setExpandedCommentId(null);
    // 참여 현황·AI 분석은 각 섹션 컴포넌트가 key=세션id로 리마운트되며 초기화된다
    resetBulkState();
  };

  // 날짜·교과·주제 필터로 세션 목록을 좁힌다(질문 직접 조회가 아니라 세션을 고르는 보조 필터)
  const filterOptions = getSessionFilterOptions(sessions);
  // 질문 배포 세션(unitDesignId + 배포 질문 있음)만 질문 조회에서 제외한다(학생 '수업 탐구 질문'에서 다룸).
  // 탐구질문 수업 세션(unitDesignId + 배포 질문 없음)은 학생이 직접 질문을 작성하므로 질문 조회에 노출한다.
  const curriculumSessionIds = new Set(
    sessions.filter((s) => s.unitDesignId && !isInquiryDesignSession(s)).map((s) => s.id),
  );
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  }).filter((s) => !curriculumSessionIds.has(s.id));

  // 특정 세션이 보조 필터 결과에서 빠지면 첫 세션으로 보정한다.
  useEffect(() => {
    if (selectedSessionId === "all") return;
    if (filteredSessions.length === 0) return;
    if (!filteredSessions.some((s) => s.id === selectedSessionId)) {
      handleSessionChange(filteredSessions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterSubject, filterTopic]);

  useEffect(() => {
    if (page <= pageInfo.totalPages) return;
    setPage(pageInfo.totalPages);
  }, [page, pageInfo.totalPages]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = (list: Question[]) => {
    setSelectedIds(new Set(list.map((q) => q.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkPreviews(null);
    setEditedAnswers({});
    setBulkMsg(null);
    setShowBulkSuccess(false);
  };

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // 선택한 학생 질문 일괄 삭제 (단건 삭제 엔드포인트 재사용)
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isBulkDeleting) return;
    if (!(await confirm({ description: t("bulkDeleteConfirm", { count: ids.length }), confirmText: tc("delete"), destructive: true }))) return;
    setIsBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/questions/${id}`, { method: "DELETE" })),
      );
      const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok),
      ).length;
      clearSelection();
      if (failed > 0) {
        toast({ variant: "destructive", description: t("bulkDeletePartial", { count: failed }) });
      } else {
        toast({ variant: "success", description: t("bulkDeleteDone", { count: ids.length }) });
      }
      await reloadQuestions();
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // 1단계: AI 답변 미리보기 생성 (저장 없음)
  const handlePreviewBulkAi = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
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
    } catch (err) {
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : t("aiAnswerFailed") });
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  // 항목별 AI 답변 재생성(저장 없음) — 어색한 답변만 다시 생성
  const handleRegenerateAnswer = async (questionId: string) => {
    if (regeneratingId) return;
    setRegeneratingId(questionId);
    try {
      const res = await fetch(`/api/questions/${questionId}/ai-answer`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("aiAnswerFailed"));
      const answer = (data.answer as string) ?? "";
      setBulkPreviews((prev) => prev ? prev.map((p) => (p.questionId === questionId ? { ...p, answer } : p)) : prev);
      setEditedAnswers((prev) => ({ ...prev, [questionId]: answer }));
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : t("aiAnswerFailed") });
    } finally {
      setRegeneratingId(null);
    }
  };

  // 2단계: 교사 확인 후 댓글로 전송
  const handleConfirmBulkAi = async () => {
    if (!bulkPreviews || bulkPreviews.length === 0) return;
    // 체크 해제(제외)된 학생은 전송하지 않는다
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
      setBulkPreviews(null);
      setEditedAnswers({});
      setExcludedIds(new Set());
      setBulkMsg({ type: "success", text: targets.length - success === 0 ? t("bulkSentAll", { count: success }) : t("bulkSentPartial", { success, failed: targets.length - success }) });
      setShowBulkSuccess(true);
      window.setTimeout(() => {
        setSelectedIds(new Set());
        setBulkMsg(null);
        setShowBulkSuccess(false);
        void reloadQuestions();
      }, 2000);
    } catch (err) {
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : t("sendFailedMsg") });
    } finally {
      setIsSendingPreviews(false);
    }
  };

  const handleToggleQuestionPublic = async (question: Question) => {
    const nextPublic = !question.isPublic;
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: nextPublic }),
      });
      if (!res.ok) throw new Error(t("publicUpdateFailed"));
      await reloadQuestions();
    } catch {
      toast({ variant: "destructive", description: t("publicUpdateFailed") });
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
        onChange={setTopTab}
        labels={{
          questions: t("tabQuestions"),
          design: t("tabDesign"),
        }}
      />

      <>
      <TeacherQuestionSessionSelector
        sessions={sessions}
        filterOptions={filterOptions}
        filteredSessions={filteredSessions}
        selectedSessionId={selectedSessionId}
        filterDate={filterDate}
        filterSubject={filterSubject}
        filterTopic={filterTopic}
        onFilterDateChange={(value) => {
          setFilterDate(value);
          setPage(1);
          resetBulkState();
        }}
        onFilterSubjectChange={(value) => {
          setFilterSubject(value);
          setPage(1);
          resetBulkState();
        }}
        onFilterTopicChange={(value) => {
          setFilterTopic(value);
          setPage(1);
          resetBulkState();
        }}
        onSessionChange={handleSessionChange}
        labels={{
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
          setPage(1);
          resetBulkState();
        }}
        onToggleFlaggedOnly={() => {
          setShowFlaggedOnly((value) => !value);
          setPage(1);
          resetBulkState();
        }}
        onSortChange={(field, dir) => {
          setSortField(field);
          setSortDir(dir);
          setPage(1);
          resetBulkState();
        }}
        onFilterClosureChange={(value) => {
          setFilterClosure(value);
          setPage(1);
          resetBulkState();
        }}
        onFilterCognitiveChange={(value) => {
          setFilterCognitive(value);
          setPage(1);
          resetBulkState();
        }}
        onResetClassificationFilters={() => {
          setFilterClosure("all");
          setFilterCognitive("all");
          setPage(1);
          resetBulkState();
        }}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onToggleSelect={toggleSelect}
        onToggleComment={(id) => setExpandedCommentId((prev) => (prev === id ? null : id))}
        onCommentCountChange={(id, count) => setCommentCountOverride((prev) => ({ ...prev, [id]: count }))}
        onClearFlag={handleClearFlag}
        onToggleQuestionPublic={handleToggleQuestionPublic}
        onEditQuestion={setSelectedQuestion}
        onDeleteQuestion={handleDeleteQuestion}
        onPageChange={(nextPage) => {
          setPage(nextPage);
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

      <AiAnswerPreviewDialog
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
      />

      <TeacherQuestionBulkActionBar
        selectedCount={selectedIds.size}
        previewQuestions={previewQuestions}
        hiddenPreviewCount={hiddenPreviewCount}
        isGeneratingPreviews={isGeneratingPreviews}
        isSendingPreviews={isSendingPreviews}
        isBulkDeleting={isBulkDeleting}
        bulkMsg={bulkMsg}
        showBulkSuccess={showBulkSuccess}
        onClearSelection={clearSelection}
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
      </>
    </div>
  );
}
