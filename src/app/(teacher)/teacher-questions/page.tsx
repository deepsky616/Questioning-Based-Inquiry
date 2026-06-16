"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { CommentThread } from "@/components/shared/CommentThread";
import { formatDateTime } from "@/lib/datetime";
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
import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { QuestionSortControl, type SortField, type SortDir } from "@/components/shared/QuestionClassificationStats";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
  matchesCognitiveCategory,
  normalizeCognitiveType,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsAsc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import { formatBulkAiSummary, validatePreviewAnswers } from "@/lib/questions";

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

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [correctionClosure, setCorrectionClosure] = useState("");
  const [correctionCognitive, setCorrectionCognitive] = useState("");
  const [comment, setComment] = useState("");
  const [correctionMsg, setCorrectionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isAnalyzingSession, setIsAnalyzingSession] = useState(false);
  const [sessionAnalysis, setSessionAnalysis] = useState<SessionAnalysis | null>(null);
  const [sessionAnalysisError, setSessionAnalysisError] = useState<string | null>(null);

  // 참여 현황
  const [participation, setParticipation] = useState<ParticipationData | null>(null);
  const [isLoadingParticipation, setIsLoadingParticipation] = useState(false);
  const [participationFilter, setParticipationFilter] = useState<"all" | "submitted" | "not-submitted">("all");
  const [showParticipation, setShowParticipation] = useState(false);

  const [showSequence, setShowSequence] = useState(false);
  // 배포한 탐구설계 목록에서 "수정"을 누른 세션(인라인 패널 열림)
  const [editDeploySessionId, setEditDeploySessionId] = useState<string | null>(null);
  const [deletingDeployId, setDeletingDeployId] = useState<string | null>(null);
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

  // 세션 관련 상태
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
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
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => {
        setSessions(sortSessionsAsc(data));
        // 기본값: 날짜·교과·주제·세션 모두 전체
        setSelectedSessionId("all");
        fetchQuestions("all");
      })
      .catch(() => setIsLoading(false));
    // 세션 목록은 최초 1회만 로드한다. (fetchQuestions가 정렬 상태로 재생성돼도
    // 재실행되어 선택 세션이 초기화되지 않도록 deps를 비운다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 배포 삭제·재배포 후 세션 목록(sharedQuestions)을 최신화한다(선택/조회 상태는 유지)
  const reloadSessions = useCallback(
    () =>
      fetch("/api/sessions")
        .then((r) => r.json())
        .then((data: QuestionSession[]) => setSessions(sortSessionsAsc(data)))
        .catch(() => {}),
    [],
  );

  // 배포한 탐구설계 전체 삭제
  const handleDeleteDeploy = async (sessionId: string) => {
    if (!window.confirm("이 세션의 배포한 탐구설계를 삭제할까요? 학생이 남긴 좋아요·댓글도 함께 삭제됩니다.")) return;
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
      window.alert("삭제에 실패했습니다");
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
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  });

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
            q?.author.grade && `${q.author.grade}학년`,
            q?.author.className && `${q.author.className}반`,
            q?.author.studentNumber && `${q.author.studentNumber}번`,
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
        setBulkMsg({ type: "error", text: "AI 답변 생성에 실패했습니다. API 키를 확인해 주세요." });
      } else {
        const initial: Record<string, string> = {};
        previews.forEach((p) => { initial[p.questionId] = p.answer; });
        setEditedAnswers(initial);
        setBulkPreviews(previews);
        if (previews.length < ids.length) {
          setBulkMsg({
            type: "error",
            text: `${ids.length - previews.length}개 질문의 AI 답변 생성에 실패했습니다`,
          });
        }
      }
    } catch (err) {
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : "AI 답변 생성에 실패했습니다" });
    } finally {
      setIsGeneratingPreviews(false);
    }
  };

  // 2단계: 교사 확인 후 댓글로 전송
  const handleConfirmBulkAi = async () => {
    if (!bulkPreviews || bulkPreviews.length === 0) return;
    const validationError = validatePreviewAnswers(
      bulkPreviews.map((p) => ({ questionId: p.questionId, answer: editedAnswers[p.questionId] ?? p.answer }))
    );
    if (validationError) {
      setBulkMsg({ type: "error", text: validationError });
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
          if (!res.ok) throw new Error("전송 실패");
        })
      );
      const success = results.filter((r) => r.status === "fulfilled").length;
      setBulkPreviews(null);
      setEditedAnswers({});
      setBulkMsg({ type: "success", text: formatBulkAiSummary(success, bulkPreviews.length) });
      setShowBulkSuccess(true);
      window.setTimeout(() => {
        setSelectedIds(new Set());
        setBulkMsg(null);
        setShowBulkSuccess(false);
        fetchQuestions(selectedSessionId);
      }, 2000);
    } catch (err) {
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : "전송에 실패했습니다" });
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
      if (!patchRes.ok) throw new Error("분류 수정에 실패했습니다");

      if (comment.trim()) {
        const commentRes = await fetch(`/api/questions/${selectedQuestion.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: comment.trim() }),
        });
        if (!commentRes.ok) throw new Error("코멘트 저장에 실패했습니다");
      }

      setSelectedQuestion(null);
      setComment("");
      fetchQuestions(selectedSessionId);
    } catch (err) {
      setCorrectionMsg({ type: "error", text: err instanceof Error ? err.message : "저장에 실패했습니다" });
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
      if (!res.ok) throw new Error("공개 여부 수정 실패");
    } catch {
      setQuestions((prev) =>
        prev.map((q) => (q.id === question.id ? { ...q, isPublic: question.isPublic } : q))
      );
    }
  };

  const handleDeleteQuestion = async (question: Question) => {
    if (!confirm(`'${question.author.name}' 학생의 질문을 삭제하시겠습니까?\n연결된 댓글도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setQuestions((prev) => prev.filter((q) => q.id !== question.id));
      if (selectedQuestion?.id === question.id) setSelectedQuestion(null);
    } catch {
      alert("삭제에 실패했습니다");
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
    } catch {
      alert("처리에 실패했습니다");
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
      if (!res.ok) throw new Error(data.error ?? "AI 세션 분석에 실패했습니다");
      setSessionAnalysis(data as SessionAnalysis);
    } catch (err) {
      setSessionAnalysis(null);
      setSessionAnalysisError(err instanceof Error ? err.message : "AI 세션 분석에 실패했습니다");
    } finally {
      setIsAnalyzingSession(false);
    }
  };

  const handleLoadParticipation = async () => {
    if (!selectedSessionId) return;
    setIsLoadingParticipation(true);
    try {
      const res = await fetch(`/api/sessions/${selectedSessionId}/participation`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "참여 현황 조회 실패");
      setParticipation(data as ParticipationData);
      setShowParticipation(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingParticipation(false);
    }
  };

  const searchKeyword = search.trim().toLowerCase();
  const filtered = searchKeyword
    ? questions.filter(
        (q) =>
          q.content.toLowerCase().includes(searchKeyword) ||
          q.author.name.toLowerCase().includes(searchKeyword),
      )
    : questions;

  // 분류1(폐쇄/개방)·분류2(사실/개념/논쟁) 필터를 적용한 표시용 목록
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
      <div className="text-center py-8 text-gray-400 text-sm">
        해당하는 질문이 없습니다
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => allChecked ? clearSelection() : selectAll(list)}
                className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
              />
            </TableHead>
            <TableHead>학생</TableHead>
            <TableHead>질문 내용</TableHead>
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
            <TableHead className="w-16 text-center">좋아요</TableHead>
            <TableHead className="w-16 text-center">댓글</TableHead>
            <TableHead className="w-20">공개</TableHead>
            <TableHead className="w-28">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q) => (
            <Fragment key={q.id}>
            <TableRow className={selectedIds.has(q.id) ? "bg-indigo-50/40" : ""}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.id)}
                  onChange={() => toggleSelect(q.id)}
                  className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                />
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium">{q.author.name}</div>
                {q.author.className && (
                  <div className="text-xs text-gray-400">
                    {q.author.grade && `${q.author.grade}학년 `}{q.author.className}반
                    {q.author.studentNumber && ` ${q.author.studentNumber}번`}
                  </div>
                )}
              </TableCell>
              <TableCell className="max-w-md">
                {q.flagged && (
                  <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      ⚠️ {q.flagReason || "부적절 의심"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClearFlag(q)}
                      className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                    >
                      ✓ 이상없음
                    </button>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">{q.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(q.createdAt)}</p>
              </TableCell>
              <TableCell>
                <span className={`text-xs px-2 py-1 rounded ${CLOSURE_STYLE[q.closure]}`}>
                  {CLOSURE_LABEL[q.closure]}
                </span>
              </TableCell>
              <TableCell>
                <span className={`text-xs px-2 py-1 rounded ${COGNITIVE_STYLE[q.cognitive]}`}>
                  {COGNITIVE_LABEL[q.cognitive]}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <div className="group relative inline-block">
                  <span className="flex items-center gap-1 text-sm font-medium text-rose-500">
                    ❤️ {q.likeCount}
                  </span>
                  {(q.likedBy?.length ?? 0) > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-1.5 px-2.5 w-36 shadow-lg">
                      <p className="font-semibold mb-1">좋아요한 학생</p>
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
                  title="댓글 보기·작성"
                >
                  💬 {commentCountOverride[q.id] ?? q.comments?.length ?? 0}
                </button>
              </TableCell>
              <TableCell>
                <Switch
                  checked={q.isPublic}
                  onCheckedChange={() => handleToggleQuestionPublic(q)}
                />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedQuestion(q);
                      setCorrectionClosure(q.closure);
                      setCorrectionCognitive(normalizeCognitiveType(q.cognitive));
                    }}
                  >
                    수정
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => handleDeleteQuestion(q)}
                  >
                    삭제
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            {expandedCommentId === q.id && (
              <TableRow>
                <TableCell colSpan={9} className="bg-muted/30 px-6 py-4">
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
      </Table>
    );
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 조회</h2>
        <p className="text-gray-600">세션을 선택해 학생 질문을 체계적으로 확인하세요</p>
      </div>

      {/* 수업 세션 선택: 날짜·교과·주제로 좁혀서 단일 세션 선택 */}
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-400">
          등록된 세션이 없습니다. 세션을 먼저 추가해 주세요.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-36">
              <label className="text-xs font-medium text-gray-600">날짜</label>
              <Select value={filterDate || "__all__"} onValueChange={(v) => setFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-white"><SelectValue placeholder="전체 날짜" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 날짜</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label className="text-xs font-medium text-gray-600">교과</label>
              <Select value={filterSubject || "__all__"} onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-white"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 교과</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-medium text-gray-600">주제</label>
              <Select value={filterTopic || "__all__"} onValueChange={(v) => setFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-white"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 주제</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs font-medium text-gray-600">세션</label>
              {filteredSessions.length === 0 ? (
                <div className="h-8 flex items-center text-sm text-gray-400">조건에 맞는 세션이 없습니다</div>
              ) : (
                <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                  <SelectTrigger className="bg-white font-medium"><SelectValue placeholder="세션 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 세션</SelectItem>
                    {filteredSessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{buildSessionLabel(s.date, s.subject, s.topic)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">💡 날짜·교과·주제로 좁혀도, 직접 세션을 골라도 결과는 같습니다.</p>
        </div>
      )}

      {/* 학생 참여 현황 */}
      {currentSession && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">학생 참여 현황</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={showParticipation ? () => setShowParticipation(false) : handleLoadParticipation}
                disabled={isLoadingParticipation}
                className="text-xs"
              >
                {isLoadingParticipation ? "조회 중..." : showParticipation ? "접기" : "참여 현황 조회"}
              </Button>
            </div>
          </CardHeader>
          {showParticipation && participation && (
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-green-700 dark:text-green-400">{participation.submittedCount}</span>
                  /{participation.totalStudents}명 제출
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
                      {f === "all" ? "전체" : f === "submitted" ? "제출" : "미제출"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">학년·반·번호</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">학생</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">질문 작성</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">댓글 작성</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">좋아요</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-14">제출</th>
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
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {[
                              s.grade && `${s.grade}학년`,
                              s.className && `${s.className}반`,
                              s.studentNumber && `${s.studentNumber}번`,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                          <td className="px-3 py-2 text-center text-sm font-semibold text-foreground">{s.questionCount}</td>
                          <td className="px-3 py-2 text-center text-sm font-semibold text-indigo-600 dark:text-indigo-400">{s.commentCount}</td>
                          <td className="px-3 py-2 text-center text-sm font-semibold text-rose-500 dark:text-rose-400">{s.likeCount}</td>
                          <td className="px-3 py-2 text-center">
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
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {participationFilter === "submitted"
                      ? "제출한 학생이 없습니다"
                      : "미제출 학생이 없습니다"}
                  </div>
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
              <CardTitle className="text-base">AI 세션 분석</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAnalyzingSession}
                onClick={handleAnalyzeSession}
                className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                {isAnalyzingSession ? "분석 중..." : "✦ 분석하기"}
              </Button>
            </div>
          </CardHeader>
          {(sessionAnalysis || sessionAnalysisError) && (
            <CardContent className="space-y-4">
              {sessionAnalysisError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{sessionAnalysisError}</p>
              ) : sessionAnalysis ? (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">질문 {sessionAnalysis.totalQuestions}개</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">좋아요 {sessionAnalysis.totalLikes ?? 0}개</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">댓글 {sessionAnalysis.totalComments ?? 0}개</span>
                  </div>
                  <div className="rounded-lg bg-muted p-4 text-sm leading-6 text-foreground">{sessionAnalysis.summary}</div>
                  <div className="flex flex-wrap gap-2">
                    {sessionAnalysis.themes.map((theme) => (
                      <span key={theme} className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{theme}</span>
                    ))}
                  </div>
                  <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">교사 시사점</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950 dark:text-amber-100">{sessionAnalysis.insights}</p>
                  </div>
                  {sessionAnalysis.engagementInsights && (
                    <div className="rounded-lg bg-rose-50 p-4 dark:bg-rose-950/30">
                      <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">❤️ 좋아요·참여 분석</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rose-950 dark:text-rose-100">{sessionAnalysis.engagementInsights}</p>
                    </div>
                  )}
                  {sessionAnalysis.commentInsights && (
                    <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/30">
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">댓글 대화 분석</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950 dark:text-emerald-100">{sessionAnalysis.commentInsights}</p>
                    </div>
                  )}
                  {sessionAnalysis.relevanceInsights && (
                    <div className="rounded-lg bg-sky-50 p-4 dark:bg-sky-950/30">
                      <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">🎯 주제 연관성·성의 분석</p>
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
              📊 질문 분류 통계 현황 <span className="text-xs font-normal text-gray-400">· 총 {filtered.length}개</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const s = summarizeQuestionTypes(filtered);
              const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);
              const bar = (name: string, value: number, color: string) => (
                <div key={name} className="flex items-center gap-2 mb-1.5 w-full px-1.5 py-0.5">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">{name}</span>
                  <div className="flex-1 h-3.5 rounded bg-muted overflow-hidden">
                    <div style={{ width: `${pct(value)}%`, background: color, height: "100%" }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">{value} ({pct(value)}%)</span>
                </div>
              );
              return (
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold mb-2">분류1 — 폐쇄형 / 개방형</p>
                    {bar("폐쇄형", s.closure.closed, "#3b82f6")}
                    {bar("개방형", s.closure.open, "#10b981")}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold mb-2">분류2 — 사실 / 개념 / 논쟁</p>
                    {bar("사실적", s.cognitive.factual, "#94a3b8")}
                    {bar("개념적", s.cognitive.conceptual, "#a855f7")}
                    {bar("논쟁적", s.cognitive.controversial, "#f97316")}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* 전체 질문 목록 — 정렬(좋아요순·댓글순) · 보기 방식(목록/질문·댓글) */}
      {hasQuestionList && (
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-foreground">📝 전체 질문 목록 <span className="font-normal text-muted-foreground">총 {filtered.length}개</span></span>
            <Input
              placeholder="질문 또는 이름으로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm w-56 bg-white"
            />
            <button
              type="button"
              onClick={() => setShowFlaggedOnly((v) => !v)}
              className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors ${
                showFlaggedOnly ? "border-red-400 bg-red-500 text-white" : "bg-white text-red-600 border-red-200 hover:bg-red-50"
              }`}
              title="AI·사전이 부적절로 의심한 질문·댓글만 모아 봅니다"
            >
              ⚠️ 부적절 의심만 {flaggedCount > 0 && `(${flaggedCount})`}
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
      )}

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : !hasQuestionList ? (
        <div className="text-center py-16 text-gray-400 text-sm">세션을 선택해 주세요</div>
      ) : (
        /* ── 전체 질문 목록: 분류1/분류2 필터 ── */
        <Card>
          <CardContent className="pt-4">
            {/* 분류 필터 칩 (통계 막대 클릭과 연동) */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-xs text-muted-foreground mr-0.5">분류1</span>
              {([["all", "전체"], ["closed", "폐쇄형"], ["open", "개방형"]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setFilterClosure(v)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${filterClosure === v ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>{label}</button>
              ))}
              <span className="text-xs text-muted-foreground mx-1">분류2</span>
              {([["all", "전체"], ["factual", "사실적"], ["conceptual", "개념적"], ["controversial", "논쟁적"]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setFilterCognitive(v)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${filterCognitive === v ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>{label}</button>
              ))}
              {(filterClosure !== "all" || filterCognitive !== "all") && (
                <button type="button" onClick={() => { setFilterClosure("all"); setFilterCognitive("all"); }}
                  className="ml-1 text-xs font-medium text-indigo-600">초기화</button>
              )}
            </div>
            <QuestionTable list={displayed} />
          </CardContent>
        </Card>
      )}

      {/* 질문 중심 탐구설계 (질문 목록 아래) */}
      {currentSession && (
        <div className="rounded-xl border bg-card p-4">
          <button
            type="button"
            onClick={() => setShowSequence((v) => !v)}
            className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-indigo-700 hover:text-indigo-800 transition-colors"
          >
            <span className="text-xl">🧩</span>
            질문 중심 탐구설계
            <span className="text-base text-indigo-400">{showSequence ? "▾" : "▸"}</span>
          </button>
          {showSequence && (
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
          )}
        </div>
      )}

      {/* 배포한 탐구설계 목록 (수업세션별) */}
      {(() => {
        const deployed = sessions.filter((s) => (s.sharedQuestions?.length ?? 0) > 0);
        if (deployed.length === 0) return null;
        return (
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-emerald-700">
              <span className="text-xl">📋</span>
              배포한 탐구설계
              <span className="text-sm font-semibold text-emerald-500">총 {deployed.length}개</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              수업세션별로 학생에게 배포한 탐구 질문 목록입니다. 수정 후 재배포하거나 삭제할 수 있어요.
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
                          질문 {s.sharedQuestions?.length ?? 0}개
                          {" · "}
                          {s.isActive ? "학생 활동 켜짐" : "학생 활동 꺼짐"}
                          {" · 좋아요 "}{s.likesVisibleToPeers ? "공개" : "비공개"}
                          {" · 댓글 "}{s.commentsVisibleToPeers ? "공개" : "비공개"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant={isEditing ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setEditDeploySessionId(isEditing ? null : s.id)}
                        >
                          {isEditing ? "닫기" : "수정"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          disabled={deletingDeployId === s.id}
                          onClick={() => handleDeleteDeploy(s.id)}
                        >
                          {deletingDeployId === s.id ? "삭제 중..." : "삭제"}
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
                          <li className="list-none text-xs">…외 {(s.sharedQuestions?.length ?? 0) - 5}개</li>
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
                            contentGroup: q.contentGroup || "수업 순서",
                            priority: q.priority ?? i + 1,
                            lessonPhase: "탐구",
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
          title="탐구 질문 관계도"
          description="선생님의 탐구 질문이 학생 질문으로 어떻게 이어졌는지 한눈에 확인합니다"
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

      {/* 수정 다이얼로그 */}
      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>질문 분류 수정</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium">질문 내용</p>
                <p className="mt-1 text-gray-800">{selectedQuestion.content}</p>
                <p className="text-sm text-gray-500 mt-1">
                  작성자: {selectedQuestion.author.name}
                  {selectedQuestion.author.className && ` (${selectedQuestion.author.className})`}
                </p>
                {selectedQuestion.session && (
                  <p className="text-xs text-indigo-600 mt-1">
                    세션: {buildSessionLabel(selectedQuestion.session.date, selectedQuestion.session.subject, selectedQuestion.session.topic)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>폐쇄형 / 개방형</Label>
                  <Select value={correctionClosure} onValueChange={setCorrectionClosure}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">폐쇄형 질문</SelectItem>
                      <SelectItem value="open">개방형 질문</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>인지적 수준</Label>
                  <Select value={correctionCognitive} onValueChange={setCorrectionCognitive}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="factual">사실적 질문</SelectItem>
                      <SelectItem value="conceptual">개념적 질문</SelectItem>
                      <SelectItem value="controversial">논쟁적 질문</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>댓글 (선택)</Label>
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
                        setCorrectionMsg({ type: "error", text: err instanceof Error ? err.message : "AI 답변 생성 실패" });
                      } finally {
                        setIsGeneratingAi(false);
                      }
                    }}
                    className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs h-7"
                  >
                    {isGeneratingAi ? "AI 생성 중..." : "✦ AI 답변 생성"}
                  </Button>
                </div>
                <Textarea
                  placeholder="학생에게 댓글을 남겨보세요... (AI 답변 생성 후 편집 가능)"
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
            <Button variant="outline" onClick={() => { setSelectedQuestion(null); setCorrectionMsg(null); }}>취소</Button>
            <Button onClick={handleSaveCorrection} disabled={isSavingCorrection}>
              {isSavingCorrection ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 답변 미리보기 Dialog */}
      <Dialog open={!!bulkPreviews} onOpenChange={() => { if (!isSendingPreviews) { setBulkPreviews(null); setEditedAnswers({}); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI 개별 답변 미리보기 및 확인</DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              각 학생의 질문에 맞게 AI가 생성한 답변입니다. 내용을 검토하고 필요시 수정 후 전송하세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                답변 준비 {bulkPreviewReady}/{bulkPreviewTotal}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                전송 대기 {bulkPreviewTotal}개
              </span>
              {bulkPreviewOverLimit > 0 && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  150자 초과 {bulkPreviewOverLimit}개
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
                <div key={preview.questionId} className="overflow-hidden rounded-xl border bg-gray-50">
                  <div className="border-b bg-white px-4 py-3">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-sm">
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{preview.authorName}</p>
                        {preview.authorInfo && (
                          <p className="text-xs text-gray-400">{preview.authorInfo}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-700">{preview.questionContent}</p>
                  </div>
                  <div className="px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-indigo-600">AI 생성 답변 (수정 가능)</p>
                      <span
                        className={`text-xs font-medium ${
                          answerLength > 150 ? "text-amber-700" : "text-gray-400"
                        }`}
                      >
                        {answerLength}/150자
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
              취소
            </Button>
            <Button
              onClick={handleConfirmBulkAi}
              disabled={isSendingPreviews}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSendingPreviews
                ? "전송 중..."
                : `${bulkPreviews?.length ?? 0}개 답변 전송`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 일괄 답변 패널 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-indigo-300 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 px-4 py-4 shadow-2xl">
          <div className="mx-auto max-w-5xl space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-indigo-700 shadow-sm">
                  {selectedIds.size}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">AI 개별 맞춤 답변 전송</p>
                  <p className="text-xs text-indigo-100">각 학생의 질문을 AI가 분석하여 개별 맞춤 답변을 동시에 생성하고 댓글로 전송합니다</p>
                </div>
              </div>
              <button
                onClick={clearSelection}
                disabled={isGeneratingPreviews || isSendingPreviews}
                className="self-start rounded-md px-2 py-1 text-xs font-medium text-indigo-100 underline-offset-4 hover:bg-white/10 hover:text-white hover:underline disabled:opacity-40 sm:self-auto"
              >
                선택 해제
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {previewQuestions.map((q) => (
                <span
                  key={q.id}
                  className="max-w-full truncate rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20"
                  title={`${q.author.name}: ${q.content}`}
                >
                  {q.author.name}: {q.content.length > 30 ? `${q.content.slice(0, 30)}...` : q.content}
                </span>
              ))}
              {hiddenPreviewCount > 0 && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                  +{hiddenPreviewCount}개
                </span>
              )}
            </div>

            <Button
              onClick={handlePreviewBulkAi}
              disabled={isGeneratingPreviews || isSendingPreviews}
              className="h-11 w-full bg-white font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:bg-white/60 disabled:text-indigo-300"
            >
              {isGeneratingPreviews ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                  </svg>
                  AI 답변 생성 중... ({selectedIds.size}개 질문 분석 중)
                </span>
              ) : (
                `✦ AI 개별 답변 미리보기 (${selectedIds.size}개)`
              )}
            </Button>

            {bulkMsg && (
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                  bulkMsg.type === "success"
                    ? "bg-white text-indigo-700"
                    : "bg-red-50 text-red-700"
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
      )}
    </div>
  );
}
