"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CommentThread } from "@/components/shared/CommentThread";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { TranslateAllButton } from "@/components/shared/TranslateAllButton";
import { formatDateTime } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SessionReferencePanel } from "@/components/shared/SessionReferencePanel";
import { QuestionSequencePanel } from "./QuestionSequencePanel";
import { DeployedDesignList } from "./DeployedDesignList";
import { ParticipationSection } from "./ParticipationSection";
import { SessionAnalysisCard } from "./SessionAnalysisCard";
import { QuestionEditDialog } from "./QuestionEditDialog";
import { AiAnswerPreviewDialog } from "./AiAnswerPreviewDialog";
import { TeacherQuestionSessionSelector } from "./TeacherQuestionSessionSelector";
import { TeacherQuestionTopTabs, type TeacherQuestionTopTab } from "./TeacherQuestionTopTabs";
import type { QuestionSession, Question, BulkPreview } from "./types";
import { PointReviewView } from "@/components/teacher/PointReviewView";
import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import { QuestionSortControl, type SortField, type SortDir } from "@/components/shared/QuestionClassificationStats";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
  matchesCognitiveCategory,
} from "@/lib/question-labels";
import { buildSessionLabel, getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { appQueryKeys, useTeacherSessions } from "@/lib/app-queries";
import { APP_DATA_REFETCH_MS } from "@/lib/query-refresh";
import { SectionToggle } from "@/components/shared/SectionToggle";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
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
  const QuestionTable = ({ list }: { list: Question[] }) => {
    const allChecked = list.length > 0 && list.every((q) => selectedIds.has(q.id));
    return list.length === 0 ? (
      <EmptyState icon="🔍" title={t("noQuestions")} />
    ) : (
      <>
        <div className="space-y-3 lg:hidden">
          <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => allChecked ? clearSelection() : selectAll(list)}
              className="h-4 w-4 rounded border-input accent-indigo-600"
            />
            {tTarget("selectAll")}
          </label>
          {list.map((q) => {
            const commentCount = commentCountOverride[q.id] ?? q.comments?.length ?? 0;
            return (
              <div key={q.id} className={`rounded-lg border bg-card p-3 ${selectedIds.has(q.id) ? "border-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(q.id)}
                    onChange={() => toggleSelect(q.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-indigo-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">{q.author.name}</span>
                      {q.author.className && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {[
                            q.author.grade && t("gradeLabel", { grade: q.author.grade }),
                            q.author.className && t("classLabel", { className: q.author.className }),
                            q.author.studentNumber && t("numberLabel", { studentNumber: q.author.studentNumber }),
                          ].filter(Boolean).join(" ")}
                        </span>
                      )}
                    </div>

                    {q.flagged && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          ⚠️ {q.flagReason || t("flagSuspected")}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleClearFlag(q)}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                        >
                          {t("clearFlag")}
                        </button>
                      </div>
                    )}

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                      {ct.text({ type: "QUESTION", id: q.id }, q.content)}
                    </p>
                    {ct.canTranslate && <TranslateToggle item={{ type: "QUESTION", id: q.id }} ct={ct} className="mt-1" />}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-2 py-0.5 text-xs break-keep ${CLOSURE_STYLE[q.closure]}`}>{CLOSURE_LABEL[q.closure]}</span>
                      <span className={`rounded px-2 py-0.5 text-xs break-keep ${COGNITIVE_STYLE[q.cognitive]}`}>{COGNITIVE_LABEL[q.cognitive]}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {selectedSessionId === "all" && q.session && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                          <span>📚</span>
                          <span>{buildSessionLabel(q.session.date, q.session.subject, q.session.topic)}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1"><span>🕒</span><span>{formatDateTime(q.createdAt)}</span></span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                  <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                    <p className="text-[11px] text-muted-foreground">{t("colLikes")}</p>
                    <p className="text-sm font-semibold text-rose-500">❤️ {q.likeCount}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedCommentId((prev) => (prev === q.id ? null : q.id))}
                    className="rounded-md bg-muted/40 px-2 py-2 text-center text-indigo-600"
                    title={t("commentTooltip")}
                  >
                    <p className="text-[11px] text-muted-foreground">{t("colComments")}</p>
                    <p className="text-sm font-semibold">💬 {commentCount}</p>
                  </button>
                  <div className="flex flex-col items-center justify-center rounded-md bg-muted/40 px-2 py-2">
                    <p className="mb-1 text-[11px] text-muted-foreground">{t("colPublic")}</p>
                    <Switch checked={q.isPublic} onCheckedChange={() => handleToggleQuestionPublic(q)} />
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedQuestion(q)}
                    className="rounded-md border border-indigo-200 p-2 text-indigo-600 hover:bg-indigo-50"
                    title={tc("edit")}
                    aria-label={tc("edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(q)}
                    className="rounded-md border border-red-200 p-2 text-red-500 hover:bg-red-50"
                    title={tc("delete")}
                    aria-label={tc("delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {expandedCommentId === q.id && (
                  <div className="mt-3 rounded-lg bg-muted/30 p-3">
                    <CommentThread
                      questionId={q.id}
                      preloaded={q.comments ?? []}
                      canModerate
                      onCountChange={(n) => setCommentCountOverride((p) => ({ ...p, [q.id]: n }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto lg:block"><Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => allChecked ? clearSelection() : selectAll(list)}
                  className="h-4 w-4 rounded border-input accent-indigo-600"
                />
              </TableHead>
              <TableHead>{t("colStudent")}</TableHead>
              <TableHead>{t("colContent")}</TableHead>
              <TableHead className="w-20 text-center break-keep">{t("colLikes")}</TableHead>
              <TableHead className="w-16 text-center">{t("colComments")}</TableHead>
              <TableHead className="w-20 text-center">{t("colPublic")}</TableHead>
              <TableHead className="w-28 text-center">{t("colManage")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((q) => (
              <Fragment key={q.id}>
              <TableRow className={selectedIds.has(q.id) ? "bg-indigo-50 dark:bg-indigo-950/40/40" : ""}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(q.id)}
                    onChange={() => toggleSelect(q.id)}
                    className="h-4 w-4 rounded border-input accent-indigo-600"
                  />
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{q.author.name}</div>
                  {q.author.className && (
                    <div className="text-xs text-muted-foreground">
                      {[
                        q.author.grade && t("gradeLabel", { grade: q.author.grade }),
                        q.author.className && t("classLabel", { className: q.author.className }),
                        q.author.studentNumber && t("numberLabel", { studentNumber: q.author.studentNumber }),
                      ].filter(Boolean).join(" ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-md">
                  {q.flagged && (
                    <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        ⚠️ {q.flagReason || t("flagSuspected")}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleClearFlag(q)}
                        className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                      >
                        {t("clearFlag")}
                      </button>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{ct.text({ type: "QUESTION", id: q.id }, q.content)}</p>
                  {ct.canTranslate && <TranslateToggle item={{ type: "QUESTION", id: q.id }} ct={ct} className="mt-0.5" />}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded break-keep ${CLOSURE_STYLE[q.closure]}`}>{CLOSURE_LABEL[q.closure]}</span>
                    <span className={`text-xs px-2 py-0.5 rounded break-keep ${COGNITIVE_STYLE[q.cognitive]}`}>{COGNITIVE_LABEL[q.cognitive]}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {selectedSessionId === "all" && q.session && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <span>📚</span>
                        <span>{buildSessionLabel(q.session.date, q.session.subject, q.session.topic)}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1"><span>🕒</span><span>{formatDateTime(q.createdAt)}</span></span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="group relative inline-block">
                    <span className="flex items-center gap-1 text-sm font-medium text-rose-500">
                      ❤️ {q.likeCount}
                    </span>
                    {(q.likedBy?.length ?? 0) > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-1.5 px-2.5 w-36 shadow-lg">
                        <p className="font-semibold mb-1">{t("likedByStudents")}</p>
                        {q.likedBy!.map((u) => (
                          <p key={u.id} className="truncate">{u.name}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    onClick={() => setExpandedCommentId((prev) => (prev === q.id ? null : q.id))}
                    className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    title={t("commentTooltip")}
                  >
                    💬 {commentCountOverride[q.id] ?? q.comments?.length ?? 0}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <Switch
                      checked={q.isPublic}
                      onCheckedChange={() => handleToggleQuestionPublic(q)}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-center">
                    <button
                      type="button"
                      onClick={() => setSelectedQuestion(q)}
                      className="rounded-md border border-indigo-200 p-1.5 text-indigo-600 hover:bg-indigo-50"
                      title={tc("edit")}
                      aria-label={tc("edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q)}
                      className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                      title={tc("delete")}
                      aria-label={tc("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
              {expandedCommentId === q.id && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/30 px-6 py-4">
                    <CommentThread
                      questionId={q.id}
                      preloaded={q.comments ?? []}
                      canModerate
                      onCountChange={(n) => setCommentCountOverride((p) => ({ ...p, [q.id]: n }))}
                    />
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table></div>
      </>
    );
  };


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
          filterHint: t("filterHint"),
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("statsTitle")} <span className="text-xs font-normal text-muted-foreground">{t("statsCountSuffix", { count: filtered.length })}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const s = summarizeQuestionTypes(filtered);
              const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);
              const bar = (name: string, value: number, color: string, desc: string) => (
                <div key={name} className="mb-2 w-full px-1.5">
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="w-20 shrink-0 whitespace-nowrap text-center text-xs text-muted-foreground">{name}</span>
                    <div className="flex-1 h-3.5 rounded bg-muted overflow-hidden">
                      <div style={{ width: `${pct(value)}%`, background: color, height: "100%" }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">{value} ({pct(value)}%)</span>
                  </div>
                  <p className="pl-[5.5rem] text-[11px] leading-tight text-muted-foreground">{desc}</p>
                </div>
              );
              return (
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold mb-2">{tCls("category1")} — {tCls("closure")}</p>
                    <div className="flex items-center gap-3">
                      <ClassificationDonut
                        size={108}
                        slices={[
                          { name: tCls("closed.label"), value: s.closure.closed, fill: "#3b82f6" },
                          { name: tCls("open.label"), value: s.closure.open, fill: "#10b981" },
                        ]}
                      />
                      <div className="flex-1 min-w-0">
                        {bar(tCls("closed.label"), s.closure.closed, "#3b82f6", tCls("closed.desc"))}
                        {bar(tCls("open.label"), s.closure.open, "#10b981", tCls("open.desc"))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold mb-2">{tCls("category2")} — {tCls("cognitive")}</p>
                    <div className="flex items-center gap-3">
                      <ClassificationDonut
                        size={108}
                        slices={[
                          { name: tCls("factual.label"), value: s.cognitive.factual, fill: "#94a3b8" },
                          { name: tCls("conceptual.label"), value: s.cognitive.conceptual, fill: "#a855f7" },
                          { name: tCls("controversial.label"), value: s.cognitive.controversial, fill: "#f97316" },
                        ]}
                      />
                      <div className="flex-1 min-w-0">
                        {bar(tCls("factual.label"), s.cognitive.factual, "#94a3b8", tCls("factual.desc"))}
                        {bar(tCls("conceptual.label"), s.cognitive.conceptual, "#a855f7", tCls("conceptual.desc"))}
                        {bar(tCls("controversial.label"), s.cognitive.controversial, "#f97316", tCls("controversial.desc"))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* 전체 질문 목록 — 제목·검색·필터·정렬·표를 한 패널에(다른 섹션과 톤 통일) */}
      {!hasQuestionList ? (
        isLoading ? (
          <div className="text-center py-16 text-muted-foreground">{tc("loading")}</div>
        ) : (
          <div className="text-center py-16 text-muted-foreground text-sm">{t("selectSessionPrompt")}</div>
        )
      ) : (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-semibold leading-none tracking-tight text-foreground">{t("listTitle")} <span className="text-xs font-normal text-muted-foreground">{t("listCountSuffix", { count: filtered.length })}</span></h3>
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm w-56 bg-background"
              />
              <button
                type="button"
                onClick={() => setShowFlaggedOnly((v) => !v)}
                className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors ${
                  showFlaggedOnly ? "border-red-400 bg-red-500 text-white" : "bg-white text-red-600 border-red-200 hover:bg-red-50"
                }`}
                title={t("flaggedTooltip")}
              >
                {t("flaggedOnly")} {flaggedCount > 0 && `(${flaggedCount})`}
              </button>
              <TranslateAllButton items={filtered.map((q) => ({ type: "QUESTION" as const, id: q.id }))} ct={ct} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <QuestionSortControl
                field={sortField}
                dir={sortDir}
                onChange={(f, d) => {
                  setSortField(f);
                  setSortDir(d);
                  fetchQuestions(selectedSessionId, { sortField: f, sortDir: d });
                }}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground">{tc("loading")}</div>
          ) : (
            <>
              {/* 분류 필터 칩 (통계 막대 클릭과 연동) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-0.5">{tCls("category1")}</span>
                {(["all", "closed", "open"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setFilterClosure(v)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${filterClosure === v ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>{v === "all" ? t("all") : tCls(`${v}.label`)}</button>
                ))}
                <span className="text-xs text-muted-foreground mx-1">{tCls("category2")}</span>
                {(["all", "factual", "conceptual", "controversial"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setFilterCognitive(v)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${filterCognitive === v ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>{v === "all" ? t("all") : tCls(`${v}.label`)}</button>
                ))}
                {(filterClosure !== "all" || filterCognitive !== "all") && (
                  <button type="button" onClick={() => { setFilterClosure("all"); setFilterCognitive("all"); }}
                    className="ml-1 text-xs font-medium text-indigo-600">{tc("reset")}</button>
                )}
              </div>
              <QuestionTable list={displayed} />
            </>
          )}
        </div>
      )}

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

      {/* AI 일괄 답변 패널 — 하단 가운데 떠 있는 컴팩트 액션 바(양옆 여백은 클릭 통과) */}
      {selectedIds.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4">
          <div className="pointer-events-auto mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 shadow-xl ring-1 ring-black/5">
            <div className="space-y-2.5 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex shrink-0 flex-col items-center leading-none">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-indigo-700 shadow-sm">
                      {selectedIds.size}
                    </span>
                    <span className="mt-1 text-[10px] font-medium text-indigo-100">{t("bulkSelectedLabel")}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{t("bulkPanelTitle")}</p>
                    <p className="line-clamp-2 text-xs text-indigo-100">{t("bulkPanelDesc")}</p>
                  </div>
                </div>
                <button
                  onClick={clearSelection}
                  disabled={isGeneratingPreviews || isSendingPreviews || isBulkDeleting}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-100 underline-offset-4 hover:bg-white/10 hover:text-white hover:underline disabled:opacity-40"
                >
                  {t("deselect")}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {previewQuestions.map((q) => (
                  <span
                    key={q.id}
                    className="max-w-full truncate rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/20"
                    title={`${q.author.name}: ${q.content}`}
                  >
                    {q.author.name}: {q.content.length > 24 ? `${q.content.slice(0, 24)}...` : q.content}
                  </span>
                ))}
                {hiddenPreviewCount > 0 && (
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    {t("plusCount", { count: hiddenPreviewCount })}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handlePreviewBulkAi}
                  disabled={isGeneratingPreviews || isSendingPreviews || isBulkDeleting}
                  className="h-10 flex-1 bg-white font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:bg-white/60 disabled:text-indigo-300"
                >
                  {isGeneratingPreviews ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                      </svg>
                      {t("aiGeneratingBulk")}
                    </span>
                  ) : (
                    t("aiPreviewBtn")
                  )}
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  disabled={isGeneratingPreviews || isSendingPreviews || isBulkDeleting}
                  className="h-10 shrink-0 border border-white/30 bg-white/10 font-semibold text-white hover:bg-red-500 hover:border-red-500 disabled:opacity-40 sm:w-auto"
                >
                  {isBulkDeleting ? t("bulkDeleting") : t("bulkDeleteBtn")}
                </Button>
              </div>

              {bulkMsg && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    bulkMsg.type === "success"
                      ? "bg-white text-indigo-700"
                      : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                  }`}
                >
                  {bulkMsg.type === "success" && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      ✓
                    </span>
                  )}
                  <span className={showBulkSuccess ? "animate-pulse" : ""}>{bulkMsg.text}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
