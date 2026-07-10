"use client";

import { useEffect, useState, useCallback } from "react";
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
import type { QuestionSession, Question, BulkPreview } from "./types";
import { PointReviewView } from "@/components/teacher/PointReviewView";
import type { SortField, SortDir } from "@/components/shared/QuestionClassificationStats";
import { matchesCognitiveCategory } from "@/lib/question-labels";
import { QUESTION_LIST_MAX } from "@/lib/questions";
import { getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { appQueryKeys, useTeacherSessions } from "@/lib/app-queries";
import { APP_DATA_REFETCH_MS } from "@/lib/query-refresh";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";

export default function QuestionsPage() {
  const tPages = useTranslations("pages");
  const tCls = useTranslations("classification");
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tSess = useTranslations("sessions");
  const tTarget = useTranslations("targetSelector");
  const ct = useContentTranslation();
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<Question[]>([]);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
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
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  const [sortField, setSortField] = useState<SortField>("student");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [search, setSearch] = useState("");
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [topTab, setTopTab] = useState<TeacherQuestionTopTab>("questions");

  // 알림에서 들어온 쿼리 처리(마운트 시 1회 읽어 Suspense 회피)
  //  - ?flagged=1: 부적절 의심 필터 켜기
  //  - ?tab=review: AI 추천 포인트 탭으로 이동
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("flagged") === "1") setShowFlaggedOnly(true);
    if (params.get("tab") === "review") setTopTab("review");
  }, []);

  const resetBulkState = () => {
    setSelectedIds(new Set());
    setBulkPreviews(null);
    setEditedAnswers({});
    setExcludedIds(new Set());
    setBulkMsg(null);
    setShowBulkSuccess(false);
  };

  const fetchQuestions = useCallback((
    sessionId: string,
    opts?: { date?: string; subject?: string; topic?: string; sortField?: SortField; sortDir?: SortDir; silent?: boolean }
  ) => {
    if (!opts?.silent) setIsLoading(true);
    const params = new URLSearchParams();
    if (sessionId && sessionId !== "all") params.append("sessionId", sessionId);
    if (opts?.date) params.append("date", opts.date);
    if (opts?.subject) params.append("subject", opts.subject);
    if (opts?.topic) params.append("topic", opts.topic);
    const field = opts?.sortField ?? sortField;
    const dir = opts?.sortDir ?? sortDir;
    const sortParam = field === "student" ? "studentSort" : field === "comment" ? "commentSort" : "likeSort";
    params.append(sortParam, dir);
    fetch(`/api/questions?${params}`)
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [sortField, sortDir]);

  useEffect(() => {
    // 세션 목록은 useQuery가 담당. 여기선 기본 선택(전체)과 질문 목록만 초기화한다.
    setSelectedSessionId("all");
    fetchQuestions("all");
    // 최초 1회만 실행. (fetchQuestions가 정렬 상태로 재생성돼도 선택 세션이 초기화되지 않도록 deps 비움)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 질문 목록도 주기 폴링(12초)+창 포커스 재조회 — 학생의 질문 작성·수정·삭제가
  // 교사가 조작하지 않아도 자동 반영되도록(세션 목록 폴링과 동일 정책)
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState !== "visible") return;
      fetchQuestions(selectedSessionId || "all", {
        date: filterDate || undefined,
        subject: filterSubject || undefined,
        topic: filterTopic || undefined,
        silent: true, // 백그라운드 재조회 — 로딩 표시로 화면이 깜빡이지 않게
      });
    };
    const timer = window.setInterval(refetch, APP_DATA_REFETCH_MS);
    window.addEventListener("focus", refetch);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, filterDate, filterSubject, filterTopic, sortField, sortDir]);

  // 배포 삭제·재배포 후 세션 목록(sharedQuestions)을 최신화한다(선택/조회 상태는 유지).
  // 공유 쿼리를 무효화하면 teacher-sessions에도 반영된다.
  const reloadSessions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherSessions }),
    [queryClient],
  );

  const confirm = useConfirm();

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    // 참여 현황·AI 분석은 각 섹션 컴포넌트가 key=세션id로 리마운트되며 초기화된다
    resetBulkState();
    if (val === "all") {
      fetchQuestions("all", {
        date: filterDate || undefined,
        subject: filterSubject || undefined,
        topic: filterTopic || undefined,
      });
    } else {
      fetchQuestions(val);
    }
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

  // 필터 변경 반영: 전체 세션이면 좁혀진 범위로 다시 조회, 특정 세션이면 목록 밖일 때 첫 세션으로 보정
  useEffect(() => {
    // 마운트 직후 초기 상태("")에서는 보정하지 않는다. 다른 페이지에서 세션 캐시를 채워온 경우
    // "all" 초기화 effect가 반영되기 전에 이 effect가 첫 세션을 잘못 선택하는 문제 방지.
    if (!selectedSessionId) return;
    if (selectedSessionId === "all") {
      fetchQuestions("all", {
        date: filterDate || undefined,
        subject: filterSubject || undefined,
        topic: filterTopic || undefined,
      });
      return;
    }
    if (filteredSessions.length === 0) return;
    if (!filteredSessions.some((s) => s.id === selectedSessionId)) {
      handleSessionChange(filteredSessions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterSubject, filterTopic]);

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
      const removed = new Set(ids);
      setQuestions((prev) => prev.filter((q) => !removed.has(q.id)));
      clearSelection();
      if (failed > 0) {
        toast({ variant: "destructive", description: t("bulkDeletePartial", { count: failed }) });
      } else {
        toast({ variant: "success", description: t("bulkDeleteDone", { count: ids.length }) });
      }
      fetchQuestions(selectedSessionId);
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
        fetchQuestions(selectedSessionId);
      }, 2000);
    } catch (err) {
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : t("sendFailedMsg") });
    } finally {
      setIsSendingPreviews(false);
    }
  };

  const handleToggleQuestionPublic = async (question: Question) => {
    const nextPublic = !question.isPublic;
    setQuestions((prev) =>
      prev.map((q) => (q.id === question.id ? { ...q, isPublic: nextPublic } : q))
    );
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: nextPublic }),
      });
      if (!res.ok) throw new Error(t("publicUpdateFailed"));
    } catch {
      setQuestions((prev) =>
        prev.map((q) => (q.id === question.id ? { ...q, isPublic: question.isPublic } : q))
      );
    }
  };

  const handleDeleteQuestion = async (question: Question) => {
    if (!(await confirm({ description: t("deleteQuestionConfirm", { name: question.author.name }), confirmText: tc("delete"), destructive: true }))) return;
    try {
      const res = await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setQuestions((prev) => prev.filter((q) => q.id !== question.id));
      if (selectedQuestion?.id === question.id) setSelectedQuestion(null);
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
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, flagged: false } : q)));
      queryClient.invalidateQueries({ queryKey: ["flagged-count"] });
    } catch {
      toast({ variant: "destructive", description: t("processFailed") });
    }
  };

  const searchKeyword = search.trim().toLowerCase();
  // 탐구질문 생성 세션의 질문은 조회 대상에서 제외
  const visibleQuestions = questions.filter((q) => !curriculumSessionIds.has(q.session?.id ?? q.sessionId ?? ""));
  const filtered = searchKeyword
    ? visibleQuestions.filter(
        (q) =>
          q.content.toLowerCase().includes(searchKeyword) ||
          q.author.name.toLowerCase().includes(searchKeyword),
      )
    : visibleQuestions;

  // 분류1(닫힌/열린)·분류2(사실/개념/논쟁) 필터를 적용한 표시용 목록
  const displayed = filtered.filter((q) =>
    (filterClosure === "all" || q.closure === filterClosure) &&
    (filterCognitive === "all" || matchesCognitiveCategory(q.cognitive, filterCognitive)) &&
    (!showFlaggedOnly || q.flagged || (q.comments?.some((c) => c.flagged) ?? false))
  );
  const flaggedCount = filtered.filter((q) => q.flagged || (q.comments?.some((c) => c.flagged) ?? false)).length;

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
          review: t("tabReview"),
        }}
      />

      {topTab === "review" ? (
        <PointReviewView />
      ) : (
      <>
      <TeacherQuestionSessionSelector
        sessions={sessions}
        filterOptions={filterOptions}
        filteredSessions={filteredSessions}
        selectedSessionId={selectedSessionId}
        filterDate={filterDate}
        filterSubject={filterSubject}
        filterTopic={filterTopic}
        onFilterDateChange={setFilterDate}
        onFilterSubjectChange={setFilterSubject}
        onFilterTopicChange={setFilterTopic}
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
      {hasQuestionList && (
        <TeacherQuestionStatsCard
          questions={filtered}
          labels={{
            title: t("statsTitle"),
            countSuffix: t("statsCountSuffix", { count: filtered.length }),
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

      {questions.length >= QUESTION_LIST_MAX && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t("listTruncated", { max: QUESTION_LIST_MAX })}
        </p>
      )}

      <TeacherQuestionListPanel
        hasQuestionList={hasQuestionList}
        isLoading={isLoading}
        filtered={filtered}
        displayed={displayed}
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
        onSearchChange={setSearch}
        onToggleFlaggedOnly={() => setShowFlaggedOnly((value) => !value)}
        onSortChange={(field, dir) => {
          setSortField(field);
          setSortDir(dir);
          fetchQuestions(selectedSessionId, { sortField: field, sortDir: dir });
        }}
        onFilterClosureChange={setFilterClosure}
        onFilterCognitiveChange={setFilterCognitive}
        onResetClassificationFilters={() => {
          setFilterClosure("all");
          setFilterCognitive("all");
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
        onSaved={() => fetchQuestions(selectedSessionId)}
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
      )}
    </div>
  );
}
