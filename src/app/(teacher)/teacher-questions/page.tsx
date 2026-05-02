"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_CATEGORIES,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
  matchesCognitiveCategory,
  normalizeCognitiveType,
} from "@/lib/question-labels";
import { buildSessionLabel, isSessionAvailable, sortSessionsDesc } from "@/lib/sessions";
import { formatBulkAiSummary, countQuestionsWithComments, validatePreviewAnswers } from "@/lib/questions";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
  unitDesignId?: string | null;
  defaultQuestionPublic?: boolean;
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
  createdAt: string;
  comments?: Array<{ id: string; content: string; author: { name: string }; createdAt: string }>;
}

interface SessionAnalysis {
  summary: string;
  themes: string[];
  insights: string;
  totalQuestions: number;
}

interface ParticipantStudent {
  id: string;
  name: string;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
  hasQuestion: boolean;
  questionContent: string | null;
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

function DatePicker({ value, onChange, placeholder = "날짜 선택" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = value ? new Date(value + "T00:00:00") : undefined;

  const displayLabel = selected
    ? `${selected.getFullYear()}년 ${selected.getMonth() + 1}월 ${selected.getDate()}일`
    : placeholder;

  const handleSelect = (date: Date | undefined) => {
    if (!date) { onChange(""); setOpen(false); return; }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-8 justify-start text-left text-sm font-normal ${!value ? "text-gray-400" : ""}`}
        >
          📅 {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected ?? new Date()}
        />
        {value && (
          <div className="border-t px-3 py-2">
            <button
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={() => { onChange(""); setOpen(false); }}
            >
              선택 초기화
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
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

  // 뷰 모드
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

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
  const [sessForm, setSessForm] = useState({ date: "", subject: "", topic: "", defaultQuestionPublic: false });
  const [isSavingSess, setIsSavingSess] = useState(false);
  const [sessMsg, setSessMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSessForm, setShowSessForm] = useState(false);

  // 조회 모드: 세션별 | 세부(날짜·교과·주제)
  const [questionLookupMode, setQuestionLookupMode] = useState<"session" | "detail">("session");

  // 날짜·교과·주제 필터 (세부 조회 모드용)
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  const resetBulkState = () => {
    setSelectedIds(new Set());
    setBulkPreviews(null);
    setEditedAnswers({});
    setBulkMsg(null);
    setShowBulkSuccess(false);
  };

  const fetchQuestions = useCallback((
    sessionId: string,
    opts?: { date?: string; subject?: string; topic?: string }
  ) => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (sessionId && sessionId !== "all") params.append("sessionId", sessionId);
    if (opts?.date) params.append("date", opts.date);
    if (opts?.subject) params.append("subject", opts.subject);
    if (opts?.topic) params.append("topic", opts.topic);
    fetch(`/api/questions?${params}`)
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => {
        const sorted = sortSessionsDesc(data);
        setSessions(sorted);
        const defaultId = sorted[0]?.id ?? "";
        setSelectedSessionId(defaultId);
        if (defaultId) {
          fetchQuestions(defaultId);
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => setIsLoading(false));
  }, [fetchQuestions]);

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    setSessionAnalysis(null);
    setSessionAnalysisError(null);
    setParticipation(null);
    setShowParticipation(false);
    resetBulkState();
    fetchQuestions(val);
  };

  const handleLookupModeChange = (mode: "session" | "detail") => {
    setQuestionLookupMode(mode);
    setSessionAnalysis(null);
    setSessionAnalysisError(null);
    setParticipation(null);
    setShowParticipation(false);
    resetBulkState();
    if (mode === "session") {
      if (selectedSessionId) fetchQuestions(selectedSessionId);
      else setQuestions([]);
    } else {
      fetchQuestions("all", { date: filterDate, subject: filterSubject, topic: filterTopic });
    }
  };

  const handleApplyFilter = () => {
    resetBulkState();
    fetchQuestions("all", { date: filterDate, subject: filterSubject, topic: filterTopic });
  };

  const handleClearFilter = () => {
    setFilterDate("");
    setFilterSubject("");
    setFilterTopic("");
    resetBulkState();
    fetchQuestions("all");
  };

  const hasActiveFilter = !!(filterDate.trim() || filterSubject.trim() || filterTopic.trim());
  const uniqueSubjects = Array.from(new Set(sessions.map((s) => s.subject).filter(Boolean))).sort();

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
        if (questionLookupMode === "session") {
          fetchQuestions(selectedSessionId);
        } else {
          fetchQuestions("all", { date: filterDate, subject: filterSubject, topic: filterTopic });
        }
      }, 2000);
    } catch (err) {
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : "전송에 실패했습니다" });
    } finally {
      setIsSendingPreviews(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessForm.date || !sessForm.subject.trim() || !sessForm.topic.trim()) {
      setSessMsg({ type: "error", text: "날짜, 교과, 주제는 필수입니다" });
      return;
    }
    setIsSavingSess(true);
    setSessMsg(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessForm),
      });
      if (!res.ok) throw new Error();
      const created: QuestionSession = await res.json();
      setSessions((prev) => sortSessionsDesc([created, ...prev]));
      setSessForm({ date: "", subject: "", topic: "", defaultQuestionPublic: false });
      setSessMsg({ type: "success", text: "세션이 추가됐습니다" });
      if (questionLookupMode === "session") {
        setSelectedSessionId(created.id);
        fetchQuestions(created.id);
      }
    } catch {
      setSessMsg({ type: "error", text: "세션 저장에 실패했습니다" });
    } finally {
      setIsSavingSess(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("이 세션을 삭제하시겠습니까?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (questionLookupMode === "session" && selectedSessionId === id) {
      const nextId = remaining[0]?.id ?? "";
      setSelectedSessionId(nextId);
      if (nextId) fetchQuestions(nextId);
      else setQuestions([]);
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
      if (questionLookupMode === "session") {
        fetchQuestions(selectedSessionId);
      } else {
        fetchQuestions("all", { date: filterDate, subject: filterSubject, topic: filterTopic });
      }
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

  const filtered = questions;

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) =>
      key === "cognitive" ? matchesCognitiveCategory(q.cognitive, value) : q[key] === value
    );

  const currentSession = questionLookupMode === "session"
    ? sessions.find((s) => s.id === selectedSessionId)
    : undefined;
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
            {questionLookupMode === "detail" && <TableHead className="w-36">세션</TableHead>}
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
            <TableHead className="w-20">공개</TableHead>
            <TableHead className="w-16">수정</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q) => (
            <TableRow key={q.id} className={selectedIds.has(q.id) ? "bg-indigo-50/40" : ""}>
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
              <TableCell className="max-w-xs">
                <p className="truncate">{q.content}</p>
              </TableCell>
              {questionLookupMode === "detail" && (
                <TableCell>
                  {q.session ? (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                      {buildSessionLabel(q.session.date, q.session.subject, q.session.topic)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">세션 없음</span>
                  )}
                </TableCell>
              )}
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
              <TableCell>
                <Switch
                  checked={q.isPublic}
                  onCheckedChange={() => handleToggleQuestionPublic(q)}
                />
              </TableCell>
              <TableCell>
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const QuestionCommentCards = ({ list }: { list: Question[] }) => {
    if (list.length === 0) return (
      <div className="text-center py-8 text-gray-400 text-sm">해당하는 질문이 없습니다</div>
    );
    return (
      <div className="space-y-4">
        {list.map((q) => {
          const studentInfo = [
            q.author.grade ? `${q.author.grade}학년` : null,
            q.author.className ? `${q.author.className}반` : null,
            q.author.studentNumber ? `${q.author.studentNumber}번` : null,
          ].filter(Boolean).join(" ");
          const initial = q.author.name.trim().slice(0, 1) || "?";

          return (
            <div key={q.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b bg-gradient-to-r from-indigo-50 via-white to-gray-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-sm">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{q.author.name}</p>
                        {studentInfo && (
                          <p className="text-xs text-gray-500">{studentInfo}</p>
                        )}
                      </div>
                      <div className="ml-auto flex shrink-0 gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLOSURE_STYLE[q.closure]}`}>
                          {CLOSURE_LABEL[q.closure]}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COGNITIVE_STYLE[q.cognitive]}`}>
                          {COGNITIVE_LABEL[q.cognitive]}
                        </span>
                        <label className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                          공개
                          <Switch
                            checked={q.isPublic}
                            onCheckedChange={() => handleToggleQuestionPublic(q)}
                          />
                        </label>
                      </div>
                    </div>
                    <p className="break-words text-sm leading-relaxed text-gray-800">{q.content}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 px-4 py-3">
                {(q.comments?.length ?? 0) === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-400">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-base leading-none text-gray-400">
                      +
                    </span>
                    아직 댓글이 없습니다
                  </div>
                ) : (
                  q.comments!.map((c) => {
                    const isStudentComment = c.author.name === q.author.name;

                    return (
                      <div
                        key={c.id}
                        className={`rounded-lg border px-3 py-2.5 ${
                          isStudentComment
                            ? "border-gray-200 bg-gray-50"
                            : "border-indigo-100 bg-indigo-50"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold ${
                              isStudentComment ? "text-gray-700" : "text-indigo-700"
                            }`}
                          >
                            {c.author.name}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              isStudentComment
                                ? "bg-white text-gray-500"
                                : "bg-white text-indigo-700"
                            }`}
                          >
                            {isStudentComment ? "학생" : "교사 · AI"}
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed ${isStudentComment ? "text-gray-700" : "text-indigo-950"}`}>
                          {c.content}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">질문 조회</h2>
          <p className="text-gray-600">세션을 선택해 학생 질문을 체계적으로 확인하세요</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setShowSessForm((v) => !v); setSessMsg(null); }}
        >
          {showSessForm ? "세션 설정 닫기" : "세션 설정"}
        </Button>
      </div>

      {/* 세션 관리 (토글) */}
      {showSessForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">질문 세션 설정</CardTitle>
            <CardDescription>날짜·교과·주제를 설정하면 학생 질문하기 화면에서 선택할 수 있습니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>날짜</Label>
                <DatePicker
                  value={sessForm.date}
                  onChange={(v) => setSessForm((p) => ({ ...p, date: v }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sess-subject">교과</Label>
                <Input
                  id="sess-subject"
                  placeholder="예: 과학"
                  value={sessForm.subject}
                  onChange={(e) => setSessForm((p) => ({ ...p, subject: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sess-topic">주제</Label>
                <Input
                  id="sess-topic"
                  placeholder="예: 지구의 역사"
                  value={sessForm.topic}
                  onChange={(e) => setSessForm((p) => ({ ...p, topic: e.target.value }))}
                />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">이 세션 질문 기본 공개</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    켜면 학생이 이 세션에서 만든 질문이 저장 즉시 공개됩니다. 학생은 직접 변경할 수 없습니다.
                  </p>
                </div>
                <Switch
                  checked={sessForm.defaultQuestionPublic}
                  onCheckedChange={(checked) =>
                    setSessForm((p) => ({ ...p, defaultQuestionPublic: checked }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleCreateSession} disabled={isSavingSess}>
                {isSavingSess ? "저장 중..." : "세션 추가"}
              </Button>
              {sessMsg && (
                <span className={`text-sm ${sessMsg.type === "success" ? "text-green-700" : "text-red-600"}`}>
                  {sessMsg.text}
                </span>
              )}
            </div>

            {sessions.length > 0 && (
              <div className="divide-y rounded-lg border mt-2">
                {sessions.map((s) => {
                  const active = isSessionAvailable(s.date);
                  return (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-300"}`} />
                        <span className="text-sm">{buildSessionLabel(s.date, s.subject, s.topic)}</span>
                        {active && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">활성</span>
                        )}
                        {s.unitDesignId && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">탐구 질문 수업</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${s.defaultQuestionPublic ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          질문 {s.defaultQuestionPublic ? "공개" : "비공개"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 h-7 px-2 text-xs"
                        onClick={() => handleDeleteSession(s.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 조회 모드 전환 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          <button
            onClick={() => handleLookupModeChange("session")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              questionLookupMode === "session"
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            세션별 조회
          </button>
          <button
            onClick={() => handleLookupModeChange("detail")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors border-l border-gray-200 ${
              questionLookupMode === "detail"
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            날짜·교과·주제별 조회
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">{filtered.length}개</span>
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              ☰ 목록
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                viewMode === "cards"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              ▦ 질문·댓글
            </button>
          </div>
        </div>
      </div>

      {/* 세션별 조회: 세션 Select */}
      {questionLookupMode === "session" && (
        sessions.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-400">
            등록된 세션이 없습니다. 세션을 먼저 추가해 주세요.
          </div>
        ) : (
          <Select value={selectedSessionId} onValueChange={handleSessionChange}>
            <SelectTrigger className="w-80">
              <SelectValue placeholder="세션 선택" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {buildSessionLabel(s.date, s.subject, s.topic)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      )}

      {/* 세부 조회: 날짜·교과·주제 필터 */}
      {questionLookupMode === "detail" && (
        <div className={`rounded-lg border p-3 ${hasActiveFilter ? "border-indigo-200 bg-indigo-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-xs font-medium text-gray-600">날짜</label>
              <DatePicker
                value={filterDate}
                onChange={setFilterDate}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-xs font-medium text-gray-600">교과</label>
              {uniqueSubjects.length > 0 ? (
                <Select
                  value={filterSubject || "__all__"}
                  onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-sm w-36 bg-white">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {uniqueSubjects.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="예: 과학"
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="h-8 text-sm w-32 bg-white"
                />
              )}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-xs font-medium text-gray-600">주제</label>
              <Input
                placeholder="예: 광합성"
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                className="h-8 text-sm w-40 bg-white"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8" onClick={handleApplyFilter}>
                조회
              </Button>
              {hasActiveFilter && (
                <Button size="sm" variant="outline" className="h-8" onClick={handleClearFilter}>
                  초기화
                </Button>
              )}
            </div>
            {hasActiveFilter && (
              <span className="text-xs text-indigo-600 font-medium self-end pb-0.5">필터 적용 중</span>
            )}
          </div>
        </div>
      )}

      {/* 세션 선택 시 통계 카드 */}
      {currentSession && (
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm font-semibold text-indigo-800 mb-3">
              {buildSessionLabel(currentSession.date, currentSession.subject, currentSession.topic)}
            </p>
            <div className="flex gap-2 flex-wrap">
              <StatBadge label="전체" value={filtered.length} color="bg-white text-gray-700" />
              <StatBadge label="폐쇄형" value={byType("closure", "closed").length} color="bg-blue-100 text-blue-700" />
              <StatBadge label="개방형" value={byType("closure", "open").length} color="bg-green-100 text-green-700" />
              <StatBadge label="사실적" value={byType("cognitive", "factual").length} color="bg-gray-100 text-gray-700" />
              <StatBadge label="개념적" value={byType("cognitive", "conceptual").length} color="bg-purple-100 text-purple-700" />
              <StatBadge label="논쟁적" value={byType("cognitive", "controversial").length} color="bg-orange-100 text-orange-700" />
            </div>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAnalyzingSession}
                onClick={handleAnalyzeSession}
                className="border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
              >
                {isAnalyzingSession ? "분석 중..." : "✦ AI 세션 분석"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentSession && (sessionAnalysis || sessionAnalysisError) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI 세션 분석 결과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionAnalysisError ? (
              <p className="text-sm text-red-600">{sessionAnalysisError}</p>
            ) : sessionAnalysis ? (
              <>
                <div className="rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-800">
                  {sessionAnalysis.summary}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sessionAnalysis.themes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
                <div className="rounded-lg bg-amber-50 p-4">
                  <p className="text-xs font-semibold text-amber-800">교사 시사점</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                    {sessionAnalysis.insights}
                  </p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* 참여 현황 패널 */}
      {questionLookupMode === "session" && currentSession && (
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
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-green-700">{participation.submittedCount}</span>
                  /{participation.totalStudents}명 제출
                </span>
                <div className="flex rounded-md border border-gray-200 overflow-hidden ml-auto">
                  {(["all", "submitted", "not-submitted"] as const).map((f, i) => (
                    <button
                      key={f}
                      onClick={() => setParticipationFilter(f)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        i > 0 ? "border-l border-gray-200" : ""
                      } ${
                        participationFilter === f
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {f === "all" ? "전체" : f === "submitted" ? "제출" : "미제출"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">학생</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">학년·반·번호</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">질문 내용</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-14">제출</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {participation.students
                      .filter((s) =>
                        participationFilter === "all"
                          ? true
                          : participationFilter === "submitted"
                          ? s.hasQuestion
                          : !s.hasQuestion
                      )
                      .map((s) => (
                        <tr key={s.id} className={s.hasQuestion ? "bg-white" : "bg-gray-50/50"}>
                          <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {[
                              s.grade && `${s.grade}학년`,
                              s.className && `${s.className}반`,
                              s.studentNumber && `${s.studentNumber}번`,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-xs truncate">
                            {s.questionContent ? (
                              <span>
                                &ldquo;{s.questionContent}
                                {s.questionContent.length >= 50 ? "..." : ""}&rdquo;
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">미작성</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {s.hasQuestion ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                                ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs">
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
                  <div className="text-center py-6 text-gray-400 text-sm">
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

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : viewMode === "cards" ? (
        /* ── 카드 뷰: 질문 + 댓글 한눈에 보기 ── */
        <div className="space-y-8">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              {questionLookupMode === "session" && !selectedSessionId
                ? "세션을 선택해 주세요"
                : "해당하는 질문이 없습니다"}
            </div>
          ) : questionLookupMode === "detail" ? (
            <>
              {sessions.map((s) => {
                const sessionQuestions = filtered.filter((q) => q.sessionId === s.id);
                if (sessionQuestions.length === 0) return null;
                return (
                  <div key={s.id}>
                    <div className="mb-3 flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm shadow-sm">
                        📅
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-indigo-700 shadow-sm">
                        {buildSessionLabel(s.date, s.subject, s.topic)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {sessionQuestions.length}개 질문 · 댓글 있는 질문 {countQuestionsWithComments(sessionQuestions)}개
                      </span>
                    </div>
                    <QuestionCommentCards list={sessionQuestions} />
                  </div>
                );
              })}
              {(() => {
                const noSession = filtered.filter((q) => !q.sessionId);
                if (noSession.length === 0) return null;
                return (
                  <div>
                    <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm shadow-sm">
                        📁
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-gray-600 shadow-sm">
                        세션 없는 질문
                      </span>
                      <span className="text-xs text-gray-400">
                        {noSession.length}개 질문 · 댓글 있는 질문 {countQuestionsWithComments(noSession)}개
                      </span>
                    </div>
                    <QuestionCommentCards list={noSession} />
                  </div>
                );
              })()}
            </>
          ) : (
            /* 특정 세션 또는 세션 없음 */
            <div>
              {currentSession && (
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-gray-400">
                    댓글 있는 질문 {countQuestionsWithComments(filtered)}개 / 전체 {filtered.length}개
                  </span>
                </div>
              )}
              <QuestionCommentCards list={filtered} />
            </div>
          )}
        </div>
      ) : questionLookupMode === "session" ? (
        /* ── 세션별 조회 ── */
        !currentSession ? (
          <div className="text-center py-16 text-gray-400 text-sm">세션을 선택해 주세요</div>
        ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              전체 질문 목록
              <span className="ml-2 text-sm font-normal text-gray-500">
                {filtered.length}개
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                이 세션에 등록된 질문이 없습니다
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((q) => selectedIds.has(q.id))}
                        onChange={() =>
                          filtered.every((q) => selectedIds.has(q.id))
                            ? clearSelection()
                            : selectAll(filtered)
                        }
                        className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                      />
                    </TableHead>
                    <TableHead className="w-28">학생</TableHead>
                    <TableHead>질문 내용</TableHead>
                    <TableHead className="w-20 text-center">폐쇄/개방</TableHead>
                    <TableHead className="w-24 text-center">인지 수준</TableHead>
                    <TableHead className="w-20 text-center">공개</TableHead>
                    <TableHead className="w-16 text-center">수정</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((q, i) => (
                    <TableRow
                      key={q.id}
                      className={selectedIds.has(q.id) ? "bg-indigo-50/40" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                    >
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
                            {q.author.grade && `${q.author.grade}학년 `}
                            {q.author.className}반
                            {q.author.studentNumber && ` ${q.author.studentNumber}번`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm leading-snug whitespace-pre-wrap break-words max-w-md">
                          {q.content}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${CLOSURE_STYLE[q.closure]}`}>
                          {CLOSURE_LABEL[q.closure]}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${COGNITIVE_STYLE[q.cognitive]}`}>
                          {COGNITIVE_LABEL[q.cognitive]}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={q.isPublic}
                          onCheckedChange={() => handleToggleQuestionPublic(q)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        )
      ) : (
        /* ── 날짜·교과·주제별 조회: 분류별 탭 ── */
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">분류 1 · 폐쇄형 / 개방형 질문</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="closed">
                <TabsList>
                  <TabsTrigger value="closed">
                    폐쇄형 <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{byType("closure", "closed").length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="open">
                    개방형 <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{byType("closure", "open").length}</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="closed"><QuestionTable list={byType("closure", "closed")} /></TabsContent>
                <TabsContent value="open"><QuestionTable list={byType("closure", "open")} /></TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">분류 2 · 사실적 / 개념적 / 논쟁적 질문</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="factual">
                <TabsList>
                  {COGNITIVE_CATEGORIES.map((category) => (
                    <TabsTrigger key={category.value} value={category.value}>
                      {category.label}
                      <span className="ml-1.5 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                        {byType("cognitive", category.value).length}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {COGNITIVE_CATEGORIES.map((category) => (
                  <TabsContent key={category.value} value={category.value}>
                    <QuestionTable list={byType("cognitive", category.value)} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </>
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
