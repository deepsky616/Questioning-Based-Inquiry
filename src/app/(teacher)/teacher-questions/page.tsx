"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CommentThread } from "@/components/shared/CommentThread";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { formatDateTime, formatClock, formatShortDateTime, isSameDay } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { InquiryFlowGraph } from "@/components/shared/InquiryFlowGraph";
import { QuestionSequencePanel } from "./QuestionSequencePanel";
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
  normalizeCognitiveType,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsAsc, sortSessionsDesc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import { SectionToggle } from "@/components/shared/SectionToggle";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations } from "next-intl";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
  unitDesignId?: string | null;
  defaultQuestionPublic?: boolean;
  likesVisibleToPeers?: boolean;
  commentsVisibleToPeers?: boolean;
  isActive?: boolean;
  sharedQuestions?: Array<{ type: string; content: string; contentGroup?: string; source?: "student" | "teacher"; priority?: number }>;
}

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  sessionId: string | null;
  session: { id: string; date: string; subject: string; topic: string } | null;
  author: { id: string; name: string; className?: string; grade?: string; studentNumber?: string };
  isPublic: boolean;
  flagged?: boolean;
  flagReason?: string;
  createdAt: string;
  comments?: Array<{ id: string; content: string; author: { id?: string; name: string }; createdAt: string; flagged?: boolean; flagReason?: string }>;
  likeCount: number;
  likedBy?: Array<{ id: string; name: string }>;
}

interface SessionAnalysis {
  summary: string;
  themes: string[];
  insights: string;
  commentInsights?: string;
  engagementInsights?: string;
  relevanceInsights?: string;
  balanceInsights?: string;
  bestQuestion?: string;
  nextQuestions?: string;
  totalQuestions: number;
  totalComments?: number;
  totalLikes?: number;
}

interface ParticipantStudent {
  id: string;
  name: string;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
  hasQuestion: boolean;
  questionContent: string | null;
  questionCount: number;
  commentCount: number;
  likeCount: number;
  questionTimes: string[];
  commentTimes: string[];
  likeTimes: string[];
}

interface ParticipationData {
  sessionId: string;
  totalStudents: number;
  submittedCount: number;
  students: ParticipantStudent[];
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-lg ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs mt-0.5">{label}</span>
    </div>
  );
}

/** 참여 현황 셀: 활동 개수 + 그 아래 가장 최근 시각, 호버 시 전체 시각 목록 툴팁. */
function ActivityCell({ count, times, color, refDate }: { count: number; times: string[]; color: string; refDate?: string }) {
  if (count === 0) {
    return <td className="px-3 py-2 text-center align-top text-sm font-semibold text-muted-foreground">-</td>;
  }
  const latest = times[times.length - 1];
  const latestLabel = latest ? (isSameDay(latest, refDate) ? formatClock(latest) : formatShortDateTime(latest)) : "";
  const tooltip = times.map((tm) => formatDateTime(tm)).join("\n");
  return (
    <td className="px-3 py-2 text-center align-top whitespace-nowrap" title={tooltip || undefined}>
      <div className={`text-sm font-semibold ${color}`}>{count}</div>
      {latestLabel && (
        <div className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] leading-tight text-muted-foreground">
          <span aria-hidden>🕒</span>
          <span>{latestLabel}</span>
        </div>
      )}
    </td>
  );
}

export default function QuestionsPage() {
  const tPages = useTranslations("pages");
  const tCls = useTranslations("classification");
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tSess = useTranslations("sessions");
  const ct = useContentTranslation();
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<Question[]>([]);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [correctionClosure, setCorrectionClosure] = useState("");
  const [correctionCognitive, setCorrectionCognitive] = useState("");
  const [comment, setComment] = useState("");
  const [correctionMsg, setCorrectionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isAnalyzingSession, setIsAnalyzingSession] = useState(false);
  const [showSessionAnalysis, setShowSessionAnalysis] = useState(false);
  const [sessionAnalysis, setSessionAnalysis] = useState<SessionAnalysis | null>(null);
  const [sessionAnalysisError, setSessionAnalysisError] = useState<string | null>(null);

  // 참여 현황
  const [participation, setParticipation] = useState<ParticipationData | null>(null);
  const [isLoadingParticipation, setIsLoadingParticipation] = useState(false);
  const [participationFilter, setParticipationFilter] = useState<"all" | "submitted" | "not-submitted">("all");
  const [showParticipation, setShowParticipation] = useState(false);

  // 배포한 탐구설계 목록에서 "수정"을 누른 세션(인라인 패널 열림)
  const [editDeploySessionId, setEditDeploySessionId] = useState<string | null>(null);
  const [deletingDeployId, setDeletingDeployId] = useState<string | null>(null);
  // 배포한 탐구설계 목록 조회(필터)·정렬 — 수업세션 목록과 동일한 방식
  const [deployFilterDate, setDeployFilterDate] = useState("");
  const [deployFilterSubject, setDeployFilterSubject] = useState("");
  const [deployFilterTopic, setDeployFilterTopic] = useState("");
  const [deploySort, setDeploySort] = useState<"desc" | "asc">("desc");
  const [filterClosure, setFilterClosure] = useState<"all" | "closed" | "open">("all");
  const [filterCognitive, setFilterCognitive] = useState<"all" | "factual" | "conceptual" | "controversial">("all");

  // 일괄 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 미리보기 2단계 플로우
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [bulkPreviews, setBulkPreviews] = useState<Array<{
    questionId: string;
    questionContent: string;
    authorName: string;
    authorInfo: string;
    answer: string;
  }> | null>(null);
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});
  const [isSendingPreviews, setIsSendingPreviews] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showBulkSuccess, setShowBulkSuccess] = useState(false);

  // 세션 관련 상태 — 수업세션 목록은 react-query로 주기 폴링(12초)+창 포커스 재조회.
  // teacher-sessions와 같은 쿼리 키를 공유해 토글·삭제·재배포가 양쪽에 자동 반영된다.
  const { data: sessions = [] } = useQuery<QuestionSession[]>({
    queryKey: ["teacher-sessions"],
    queryFn: async () => {
      const r = await fetch("/api/sessions");
      if (!r.ok) throw new Error("failed to load sessions");
      const data = await r.json();
      return sortSessionsAsc(Array.isArray(data) ? data : []);
    },
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });
  const [selectedSessionId, setSelectedSessionId] = useState("");


  // 날짜·교과·주제 필터 (세부 조회 모드용)
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  // 전체 질문 목록 정렬 (기본: 학생순 오름차순)
  const [sortField, setSortField] = useState<SortField>("student");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // 질문/이름 검색
  const [search, setSearch] = useState("");
  // 댓글 인라인 펼침 대상 + 작성 후 댓글수 갱신
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});
  // 부적절 의심만 보기 필터
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  // 상단 탭: 질문 조회 / 탐구 설계 / AI 추천 포인트
  const [topTab, setTopTab] = useState<"questions" | "design" | "review">("questions");

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
    setBulkMsg(null);
    setShowBulkSuccess(false);
  };

  const fetchQuestions = useCallback((
    sessionId: string,
    opts?: { date?: string; subject?: string; topic?: string; sortField?: SortField; sortDir?: SortDir }
  ) => {
    setIsLoading(true);
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

  // 배포 삭제·재배포 후 세션 목록(sharedQuestions)을 최신화한다(선택/조회 상태는 유지).
  // 공유 쿼리를 무효화하면 teacher-sessions에도 반영된다.
  const reloadSessions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["teacher-sessions"] }),
    [queryClient],
  );

  // 배포한 탐구설계 전체 삭제
  const confirm = useConfirm();

  const handleDeleteDeploy = async (sessionId: string) => {
    if (!(await confirm({ description: t("deleteDeployConfirm"), confirmText: tc("delete"), destructive: true }))) return;
    setDeletingDeployId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error();
      if (editDeploySessionId === sessionId) setEditDeploySessionId(null);
      await reloadSessions();
    } catch {
      toast({ variant: "destructive", description: t("deleteFailed") });
    } finally {
      setDeletingDeployId(null);
    }
  };

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    setSessionAnalysis(null);
    setSessionAnalysisError(null);
    setParticipation(null);
    setShowParticipation(false);
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
  // 탐구질문에서 생성한 수업세션(unitDesignId)은 질문 조회에서 제외한다(학생 '수업 탐구 질문'에서만 다룸)
  const curriculumSessionIds = new Set(sessions.filter((s) => s.unitDesignId).map((s) => s.id));
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  }).filter((s) => !curriculumSessionIds.has(s.id));

  // 필터 변경 반영: 전체 세션이면 좁혀진 범위로 다시 조회, 특정 세션이면 목록 밖일 때 첫 세션으로 보정
  useEffect(() => {
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

  // 세션 선택 시 저장된 학급 AI 분석을 불러온다(대시보드와 공유). 전체 조회/미선택이면 비움.
  useEffect(() => {
    if (selectedSessionId === "all" || !selectedSessionId) {
      setSessionAnalysis(null);
      setSessionAnalysisError(null);
      return;
    }
    let active = true;
    fetch(`/api/sessions/${selectedSessionId}/analysis`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        setSessionAnalysis(d?.analysis ? (d.analysis as SessionAnalysis) : null);
        setSessionAnalysisError(null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedSessionId]);

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
        .filter(
          (r): r is PromiseFulfilledResult<{
            questionId: string;
            questionContent: string;
            authorName: string;
            authorInfo: string;
            answer: string;
          }> => r.status === "fulfilled"
        )
        .map((r) => r.value);

      if (previews.length === 0) {
        setBulkMsg({ type: "error", text: t("aiAnswerFailedKey") });
      } else {
        const initial: Record<string, string> = {};
        previews.forEach((p) => { initial[p.questionId] = p.answer; });
        setEditedAnswers(initial);
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

  // 2단계: 교사 확인 후 댓글로 전송
  const handleConfirmBulkAi = async () => {
    if (!bulkPreviews || bulkPreviews.length === 0) return;
    const answerTexts = bulkPreviews.map((p) => editedAnswers[p.questionId] ?? p.answer);
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
        bulkPreviews.map(async (p) => {
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
      setBulkMsg({ type: "success", text: bulkPreviews.length - success === 0 ? t("bulkSentAll", { count: success }) : t("bulkSentPartial", { success, failed: bulkPreviews.length - success }) });
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

  const handleSaveCorrection = async () => {
    if (!selectedQuestion) return;
    setIsSavingCorrection(true);
    setCorrectionMsg(null);
    try {
      const patchRes = await fetch(`/api/questions/${selectedQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closure: correctionClosure, cognitive: correctionCognitive }),
      });
      if (!patchRes.ok) throw new Error(t("classifyUpdateFailed"));

      if (comment.trim()) {
        const commentRes = await fetch(`/api/questions/${selectedQuestion.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: comment.trim() }),
        });
        if (!commentRes.ok) throw new Error(t("commentSaveFailed"));
      }

      setSelectedQuestion(null);
      setComment("");
      fetchQuestions(selectedSessionId);
    } catch (err) {
      setCorrectionMsg({ type: "error", text: err instanceof Error ? err.message : t("saveFailedMsg") });
    } finally {
      setIsSavingCorrection(false);
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

  const handleAnalyzeSession = async () => {
    if (!currentSession) return;

    setIsAnalyzingSession(true);
    setSessionAnalysisError(null);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("sessionAnalysisFailed"));
      setSessionAnalysis(data as SessionAnalysis);
    } catch (err) {
      setSessionAnalysis(null);
      setSessionAnalysisError(err instanceof Error ? err.message : t("sessionAnalysisFailed"));
    } finally {
      setIsAnalyzingSession(false);
    }
  };

  // 세션 분석 교사 수정(대시보드 상세 리포트와 동일하게)
  const [editingSession, setEditingSession] = useState(false);
  const [sessionEditDraft, setSessionEditDraft] = useState<Record<string, string>>({});
  const [savingSessionEdit, setSavingSessionEdit] = useState(false);
  const startEditSession = () => {
    if (!sessionAnalysis) return;
    setSessionEditDraft({
      summary: sessionAnalysis.summary ?? "",
      balanceInsights: sessionAnalysis.balanceInsights ?? "",
      bestQuestion: sessionAnalysis.bestQuestion ?? "",
      engagementInsights: sessionAnalysis.engagementInsights ?? "",
      commentInsights: sessionAnalysis.commentInsights ?? "",
      relevanceInsights: sessionAnalysis.relevanceInsights ?? "",
      nextQuestions: sessionAnalysis.nextQuestions ?? "",
      insights: sessionAnalysis.insights ?? "",
    });
    setShowSessionAnalysis(true);
    setEditingSession(true);
  };
  const cancelEditSession = () => { setEditingSession(false); setSessionEditDraft({}); };
  const saveSessionEdit = async () => {
    if (!currentSession) return;
    setSavingSessionEdit(true);
    try {
      const res = await fetch("/api/reports/session-analysis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId, scope: "class", result: { ...(sessionAnalysis ?? {}), ...sessionEditDraft } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t("sessionAnalysisFailed"));
      setSessionAnalysis((prev) => (prev ? { ...prev, ...sessionEditDraft } : prev));
      setEditingSession(false);
      setSessionEditDraft({});
    } catch (err) {
      setSessionAnalysisError(err instanceof Error ? err.message : t("sessionAnalysisFailed"));
    } finally {
      setSavingSessionEdit(false);
    }
  };
  const sessionEditFields: [string, string][] = [
    ["summary", t("summaryTitle")],
    ["balanceInsights", t("balanceTitle")],
    ["bestQuestion", t("bestTitle")],
    ["engagementInsights", t("engagementTitle")],
    ["commentInsights", t("commentInsightsTitle")],
    ["relevanceInsights", t("relevanceTitle")],
    ["nextQuestions", t("nextTitle")],
    ["insights", t("insightsTitle")],
  ];

  const handleLoadParticipation = async () => {
    if (!selectedSessionId) return;
    setIsLoadingParticipation(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/participation`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("participationFailed"));
      setParticipation(data as ParticipationData);
      setShowParticipation(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingParticipation(false);
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
  const bulkPreviewTotal = bulkPreviews?.length ?? 0;
  const bulkPreviewReady = bulkPreviews?.filter((preview) =>
    (editedAnswers[preview.questionId] ?? preview.answer).trim().length > 0
  ).length ?? 0;
  const bulkPreviewOverLimit = bulkPreviews?.filter((preview) =>
    (editedAnswers[preview.questionId] ?? preview.answer).length > 150
  ).length ?? 0;

  const QuestionTable = ({ list }: { list: Question[] }) => {
    const allChecked = list.length > 0 && list.every((q) => selectedIds.has(q.id));
    return list.length === 0 ? (
      <EmptyState icon="🔍" title={t("noQuestions")} />
    ) : (
      <div className="overflow-x-auto"><Table>
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
                {/* 분류 배지(답의 개방성·생각의 깊이)를 내용 아래에 */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded break-keep ${CLOSURE_STYLE[q.closure]}`}>{CLOSURE_LABEL[q.closure]}</span>
                  <span className={`text-xs px-2 py-0.5 rounded break-keep ${COGNITIVE_STYLE[q.cognitive]}`}>{COGNITIVE_LABEL[q.cognitive]}</span>
                </div>
                {/* 수업세션(📚) · 작성일시(🕒) — 수업세션은 전체 조회일 때만(특정 세션 선택 시엔 중복) */}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedQuestion(q);
                      setCorrectionClosure(q.closure);
                      setCorrectionCognitive(normalizeCognitiveType(q.cognitive));
                    }}
                  >
                    {tc("edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => handleDeleteQuestion(q)}
                  >
                    {tc("delete")}
                  </Button>
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
    );
  };


  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherQuestions.title")} description={tPages("teacherQuestions.description")} />

      <div className="flex rounded-md border overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setTopTab("questions")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${topTab === "questions" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {t("tabQuestions")}
        </button>
        <button
          type="button"
          onClick={() => setTopTab("design")}
          className={`px-4 py-2 text-sm font-medium border-l transition-colors ${topTab === "design" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {t("tabDesign")}
        </button>
        <button
          type="button"
          onClick={() => setTopTab("review")}
          className={`px-4 py-2 text-sm font-medium border-l transition-colors ${topTab === "review" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {t("tabReview")}
        </button>
      </div>

      {topTab === "review" ? (
        <PointReviewView />
      ) : (
      <>
      {/* 수업 세션 선택: 날짜·교과·주제로 좁혀서 단일 세션 선택 */}
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("noSessions")}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-36">
              <label className="text-xs font-medium text-muted-foreground">{t("date")}</label>
              <Select value={filterDate || "__all__"} onValueChange={(v) => setFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-card"><SelectValue placeholder={t("allDates")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allDates")}</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label className="text-xs font-medium text-muted-foreground">{t("subject")}</label>
              <Select value={filterSubject || "__all__"} onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-card"><SelectValue placeholder={t("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allSubjects")}</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-medium text-muted-foreground">{t("topic")}</label>
              <Select value={filterTopic || "__all__"} onValueChange={(v) => setFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-card"><SelectValue placeholder={t("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allTopics")}</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs font-medium text-muted-foreground">{t("classSession")}</label>
              {filteredSessions.length === 0 ? (
                <div className="h-8 flex items-center text-sm text-muted-foreground">{t("noMatchingSession")}</div>
              ) : (
                <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                  <SelectTrigger className="bg-card font-medium"><SelectValue placeholder={t("selectSession")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allSessions")}</SelectItem>
                    {filteredSessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{buildSessionLabel(s.date, s.subject, s.topic)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t("filterHint")}</p>
        </div>
      )}

      {topTab === "questions" && (
        <div className="space-y-6">

      {/* 학생 참여 현황 */}
      {currentSession && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <SectionToggle
                title={t("participationTitle")}
                open={showParticipation}
                onToggle={showParticipation ? () => setShowParticipation(false) : handleLoadParticipation}
                suffix={isLoadingParticipation ? <span className="text-xs font-normal text-muted-foreground">{t("loadingShort")}</span> : undefined}
              />
            </div>
          </CardHeader>
          {showParticipation && participation && (
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-green-700 dark:text-green-400">{participation.submittedCount}</span>
                  {t("submittedSuffix", { total: participation.totalStudents })}
                </span>
                <div className="flex rounded-md border border-border overflow-hidden ml-auto">
                  {(["all", "submitted", "not-submitted"] as const).map((f, i) => (
                    <button
                      key={f}
                      onClick={() => setParticipationFilter(f)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        i > 0 ? "border-l border-border" : ""
                      } ${
                        participationFilter === f
                          ? "bg-indigo-600 text-white"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {f === "all" ? t("all") : f === "submitted" ? t("submitted") : t("notSubmitted")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24 whitespace-nowrap">{t("colGradeClassNo")}</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32 whitespace-nowrap">{t("colStudent")}</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colWroteQuestion")}</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colWroteComment")}</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colLikes")}</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colSubmit")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {participation.students
                      .filter((s) =>
                        participationFilter === "all"
                          ? true
                          : participationFilter === "submitted"
                          ? s.hasQuestion
                          : !s.hasQuestion
                      )
                      .map((s) => (
                        <tr key={s.id} className={s.hasQuestion ? "bg-background" : "bg-muted/40"}>
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground whitespace-nowrap">
                            {[
                              s.grade && t("gradeLabel", { grade: s.grade }),
                              s.className && t("classLabel", { className: s.className }),
                              s.studentNumber && t("numberLabel", { studentNumber: s.studentNumber }),
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </td>
                          <td className="px-3 py-2 align-top font-medium text-foreground whitespace-nowrap">{s.name}</td>
                          <ActivityCell count={s.questionCount} times={s.questionTimes} color="text-foreground" refDate={currentSession?.date} />
                          <ActivityCell count={s.commentCount} times={s.commentTimes} color="text-indigo-600 dark:text-indigo-400" refDate={currentSession?.date} />
                          <ActivityCell count={s.likeCount} times={s.likeTimes} color="text-rose-500 dark:text-rose-400" refDate={currentSession?.date} />
                          <td className="px-3 py-2 text-center align-top">
                            {s.hasQuestion ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold dark:bg-green-950/50 dark:text-green-400">
                                ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">
                                -
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {participation.students.filter((s) =>
                  participationFilter === "all"
                    ? true
                    : participationFilter === "submitted"
                    ? s.hasQuestion
                    : !s.hasQuestion
                ).length === 0 && (
                  <EmptyState icon="🧑‍🎓" title={participationFilter === "submitted" ? t("emptySubmitted") : t("emptyNotSubmitted")} />
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* AI 세션 분석 */}
      {currentSession && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <SectionToggle
                title={t("sessionAnalysisTitle")}
                open={showSessionAnalysis}
                onToggle={() => setShowSessionAnalysis((v) => !v)}
              />
              {editingSession ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={savingSessionEdit} onClick={saveSessionEdit} className="text-xs">{tc("save")}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={savingSessionEdit} onClick={cancelEditSession} className="text-xs">{tc("cancel")}</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {sessionAnalysis && !isAnalyzingSession && (
                    <Button type="button" size="sm" variant="outline" onClick={startEditSession} className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50">{t("editAnalysisBtn")}</Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isAnalyzingSession}
                    onClick={handleAnalyzeSession}
                    className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  >
                    {isAnalyzingSession ? t("analyzing") : sessionAnalysis ? t("reanalyzeBtn") : t("analyze")}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          {showSessionAnalysis && (sessionAnalysis || sessionAnalysisError || editingSession) && (
            <CardContent className="space-y-4">
              {editingSession ? (
                <div className="space-y-3">
                  {sessionEditFields.map(([key, label]) => (
                    <div key={key}>
                      <label className="text-xs font-semibold text-foreground">{label}</label>
                      <textarea
                        value={sessionEditDraft[key] ?? ""}
                        onChange={(e) => setSessionEditDraft((d) => ({ ...d, [key]: e.target.value }))}
                        rows={2}
                        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm leading-6 text-foreground"
                      />
                    </div>
                  ))}
                </div>
              ) : sessionAnalysisError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{sessionAnalysisError}</p>
              ) : sessionAnalysis ? (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statQuestions", { count: sessionAnalysis.totalQuestions ?? 0 })}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statLikes", { count: sessionAnalysis.totalLikes ?? 0 })}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statComments", { count: sessionAnalysis.totalComments ?? 0 })}</span>
                  </div>
                  <div className="rounded-lg bg-muted p-4 text-sm leading-6 text-foreground">{sessionAnalysis.summary}</div>
                  <div className="flex flex-wrap gap-2">
                    {(sessionAnalysis.themes ?? []).map((theme) => (
                      <span key={theme} className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{theme}</span>
                    ))}
                  </div>
                  {sessionAnalysis.balanceInsights && (
                    <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30">
                      <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">{t("balanceTitle")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950 dark:text-violet-100">{sessionAnalysis.balanceInsights}</p>
                    </div>
                  )}
                  {sessionAnalysis.bestQuestion && (
                    <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-950/30">
                      <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">{t("bestTitle")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-950 dark:text-yellow-100">{sessionAnalysis.bestQuestion}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("insightsTitle")}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950 dark:text-amber-100">{sessionAnalysis.insights}</p>
                  </div>
                  {sessionAnalysis.nextQuestions && (
                    <div className="rounded-lg bg-indigo-50 p-4 dark:bg-indigo-950/30">
                      <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">{t("nextTitle")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-indigo-950 dark:text-indigo-100">{sessionAnalysis.nextQuestions}</p>
                    </div>
                  )}
                  {sessionAnalysis.engagementInsights && (
                    <div className="rounded-lg bg-rose-50 p-4 dark:bg-rose-950/30">
                      <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">{t("engagementTitle")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rose-950 dark:text-rose-100">{sessionAnalysis.engagementInsights}</p>
                    </div>
                  )}
                  {sessionAnalysis.commentInsights && (
                    <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/30">
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t("commentInsightsTitle")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950 dark:text-emerald-100">{sessionAnalysis.commentInsights}</p>
                    </div>
                  )}
                  {sessionAnalysis.relevanceInsights && (
                    <div className="rounded-lg bg-sky-50 p-4 dark:bg-sky-950/30">
                      <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">{t("relevanceTitle")}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-950 dark:text-sky-100">{sessionAnalysis.relevanceInsights}</p>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          )}
        </Card>
      )}

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
              initialSettings={{
                isActive: currentSession.isActive,
                defaultQuestionPublic: currentSession.defaultQuestionPublic,
                likesVisibleToPeers: currentSession.likesVisibleToPeers,
                commentsVisibleToPeers: currentSession.commentsVisibleToPeers,
              }}
              onDeployed={reloadSessions}
            />
          </div>
        </div>
      )}

      {/* 배포한 탐구설계 목록 (수업세션별) */}
      {(() => {
        const deployedAll = sessions.filter((s) => (s.sharedQuestions?.length ?? 0) > 0);
        if (deployedAll.length === 0) return null;
        const deployOptions = getSessionFilterOptions(deployedAll);
        const deployFiltered = filterSessions(deployedAll, {
          date: deployFilterDate || undefined,
          subject: deployFilterSubject || undefined,
          topic: deployFilterTopic || undefined,
        });
        const deployed = deploySort === "asc" ? sortSessionsAsc(deployFiltered) : sortSessionsDesc(deployFiltered);
        const hasDeployFilter = Boolean(deployFilterDate || deployFilterSubject || deployFilterTopic);
        return (
          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5 text-base font-semibold leading-none tracking-tight text-foreground">
                <span>📋</span>
                {t("deployedTitle")}
                <span className="text-xs font-normal text-muted-foreground">{t("listCountSuffix", { count: deployedAll.length })}</span>
              </div>
              {/* 조회(필터, 왼쪽) · 정렬(오른쪽) — 수업세션 목록과 동일 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{tSess("filterLabel")}</span>
                  <Select value={deployFilterDate || "__all__"} onValueChange={(v) => setDeployFilterDate(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm bg-background w-32"><SelectValue placeholder={tSess("allDates")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{tSess("allDates")}</SelectItem>
                      {deployOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={deployFilterSubject || "__all__"} onValueChange={(v) => setDeployFilterSubject(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm bg-background w-28"><SelectValue placeholder={tSess("allSubjects")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{tSess("allSubjects")}</SelectItem>
                      {deployOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={deployFilterTopic || "__all__"} onValueChange={(v) => setDeployFilterTopic(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm bg-background w-36"><SelectValue placeholder={tSess("allTopics")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{tSess("allTopics")}</SelectItem>
                      {deployOptions.topics.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {hasDeployFilter && (
                    <button
                      type="button"
                      onClick={() => { setDeployFilterDate(""); setDeployFilterSubject(""); setDeployFilterTopic(""); }}
                      className="h-9 px-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {tc("reset")}
                    </button>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{tSess("sortLabel")}</span>
                  <div className="flex rounded-md border overflow-hidden h-9">
                    {(["desc", "asc"] as const).map((v, i) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setDeploySort(v)}
                        className={`px-3 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
                          deploySort === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {v === "desc" ? tSess("sortDesc") : tSess("sortAsc")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("deployedDesc")}
            </p>
            <div className="mt-3 space-y-2">
              {deployed.map((s) => {
                const isEditing = editDeploySessionId === s.id;
                return (
                  <div key={s.id} className="rounded-lg border bg-background">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {buildSessionLabel(s.date, s.subject, s.topic)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("statQuestions", { count: s.sharedQuestions?.length ?? 0 })}
                          {" · "}
                          {s.isActive ? t("activeOn") : t("activeOff")}
                          {t("likesByline", { v: s.likesVisibleToPeers ? t("publicWord") : t("privateWord") })}
                          {t("commentsByline", { v: s.commentsVisibleToPeers ? t("publicWord") : t("privateWord") })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant={isEditing ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setEditDeploySessionId(isEditing ? null : s.id)}
                        >
                          {isEditing ? tc("close") : tc("edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          disabled={deletingDeployId === s.id}
                          onClick={() => handleDeleteDeploy(s.id)}
                        >
                          {deletingDeployId === s.id ? t("deleting") : tc("delete")}
                        </Button>
                      </div>
                    </div>
                    {/* 배포된 질문 미리보기 */}
                    {!isEditing && (
                      <ol className="list-decimal space-y-1 border-t px-7 py-2 text-sm text-muted-foreground">
                        {(s.sharedQuestions ?? []).slice(0, 5).map((q, i) => (
                          <li key={i} className="line-clamp-1">{q.content}</li>
                        ))}
                        {(s.sharedQuestions?.length ?? 0) > 5 && (
                          <li className="list-none text-xs">{t("moreCount", { count: (s.sharedQuestions?.length ?? 0) - 5 })}</li>
                        )}
                      </ol>
                    )}
                    {/* 수정: 탐구설계 패널을 다시 열어 수정 후 재배포 */}
                    {isEditing && (
                      <div className="border-t p-3">
                        <QuestionSequencePanel
                          sessionId={s.id}
                          subject={s.subject}
                          topic={s.topic}
                          editMode
                          initialQuestions={(s.sharedQuestions ?? []).map((q, i) => ({
                            id: `deployed-${i}`,
                            type: q.type || "student",
                            content: q.content,
                            source: q.source === "teacher" ? "teacher" : "student",
                            contentGroup: q.contentGroup || t("groupDefault"),
                            priority: q.priority ?? i + 1,
                            lessonPhase: t("phaseDefault"),
                            rationale: "",
                          }))}
                          initialSettings={{
                            isActive: s.isActive,
                            defaultQuestionPublic: s.defaultQuestionPublic,
                            likesVisibleToPeers: s.likesVisibleToPeers,
                            commentsVisibleToPeers: s.commentsVisibleToPeers,
                          }}
                          onDeployed={reloadSessions}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {currentSession && currentSession.unitDesignId && (
        <InquiryFlowGraph
          title={t("flowTitle")}
          description={t("flowDesc")}
          subject={currentSession.subject}
          topic={currentSession.topic}
          sharedQuestions={Array.isArray(currentSession.sharedQuestions) ? currentSession.sharedQuestions : []}
          studentQuestions={filtered.map((question) => ({
            id: question.id,
            content: question.content,
            cognitive: question.cognitive,
            closure: question.closure,
            isPublic: question.isPublic,
          }))}
          audience="teacher"
        />
      )}

        </div>
      )}

      {/* 수정 다이얼로그 */}
      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/40 rounded-lg">
                <p className="font-medium">{t("questionContentLabel")}</p>
                <p className="mt-1 text-foreground">{selectedQuestion.content}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("authorPrefix")}{selectedQuestion.author.name}
                  {selectedQuestion.author.className && ` (${selectedQuestion.author.className})`}
                </p>
                {selectedQuestion.session && (
                  <p className="text-xs text-indigo-600 mt-1">
                    {t("sessionPrefix")}{buildSessionLabel(selectedQuestion.session.date, selectedQuestion.session.subject, selectedQuestion.session.topic)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tCls("closure")}</Label>
                  <Select value={correctionClosure} onValueChange={setCorrectionClosure}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">{t("closedOption")}</SelectItem>
                      <SelectItem value="open">{t("openOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("cognitiveLevel")}</Label>
                  <Select value={correctionCognitive} onValueChange={setCorrectionCognitive}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="factual">{t("factualOption")}</SelectItem>
                      <SelectItem value="conceptual">{t("conceptualOption")}</SelectItem>
                      <SelectItem value="controversial">{t("controversialOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("commentOptional")}</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isGeneratingAi || !selectedQuestion}
                    onClick={async () => {
                      if (!selectedQuestion) return;
                      setIsGeneratingAi(true);
                      setCorrectionMsg(null);
                      try {
                        const res = await fetch(`/api/questions/${selectedQuestion.id}/ai-answer`, { method: "POST" });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        setComment(data.answer);
                      } catch (err) {
                        setCorrectionMsg({ type: "error", text: err instanceof Error ? err.message : t("aiAnswerFailedGen") });
                      } finally {
                        setIsGeneratingAi(false);
                      }
                    }}
                    className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs h-7"
                  >
                    {isGeneratingAi ? t("aiGenerating") : t("aiGenerate")}
                  </Button>
                </div>
                <Textarea
                  placeholder={t("commentPlaceholder")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          {correctionMsg && (
            <p className={`text-sm ${correctionMsg.type === "error" ? "text-red-600" : "text-green-700"}`}>
              {correctionMsg.text}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedQuestion(null); setCorrectionMsg(null); }}>{tc("cancel")}</Button>
            <Button onClick={handleSaveCorrection} disabled={isSavingCorrection}>
              {isSavingCorrection ? t("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 답변 미리보기 Dialog */}
      <Dialog open={!!bulkPreviews} onOpenChange={() => { if (!isSendingPreviews) { setBulkPreviews(null); setEditedAnswers({}); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("previewDialogTitle")}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("previewDialogDesc")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                {t("previewReady", { ready: bulkPreviewReady, total: bulkPreviewTotal })}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {t("previewPending", { total: bulkPreviewTotal })}
              </span>
              {bulkPreviewOverLimit > 0 && (
                <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {t("previewOverLimit", { count: bulkPreviewOverLimit })}
                </span>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {bulkPreviews?.map((preview) => {
              const answerText = editedAnswers[preview.questionId] ?? preview.answer;
              const answerLength = answerText.length;
              const initial = preview.authorName.trim().slice(0, 1) || "?";

              return (
                <div key={preview.questionId} className="overflow-hidden rounded-xl border bg-muted/40">
                  <div className="border-b bg-card px-4 py-3">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-sm">
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{preview.authorName}</p>
                        {preview.authorInfo && (
                          <p className="text-xs text-muted-foreground">{preview.authorInfo}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{preview.questionContent}</p>
                  </div>
                  <div className="px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-indigo-600">{t("aiGeneratedAnswer")}</p>
                      <span
                        className={`text-xs font-medium ${
                          answerLength > 150 ? "text-amber-700" : "text-muted-foreground"
                        }`}
                      >
                        {t("charCount", { n: answerLength })}
                      </span>
                    </div>
                    <Textarea
                      value={answerText}
                      onChange={(e) =>
                        setEditedAnswers((prev) => ({ ...prev, [preview.questionId]: e.target.value }))
                      }
                      rows={3}
                      className="resize-none text-sm"
                      disabled={isSendingPreviews}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {bulkMsg?.type === "error" && (
            <p className="text-sm text-red-600 mt-1">{bulkMsg.text}</p>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => { setBulkPreviews(null); setEditedAnswers({}); setBulkMsg(null); }}
              disabled={isSendingPreviews}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleConfirmBulkAi}
              disabled={isSendingPreviews}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSendingPreviews
                ? t("sending")
                : t("sendCount", { count: bulkPreviews?.length ?? 0 })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      {t("aiGeneratingBulk", { count: selectedIds.size })}
                    </span>
                  ) : (
                    t("aiPreviewBtn", { count: selectedIds.size })
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
