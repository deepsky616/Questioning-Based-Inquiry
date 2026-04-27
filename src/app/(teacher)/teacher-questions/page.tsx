"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";
import { buildSessionLabel, isSessionAvailable, sortSessionsDesc } from "@/lib/sessions";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
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
  const [search, setSearch] = useState("");
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

  // 일괄 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkComment, setBulkComment] = useState("");
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showBulkSuccess, setShowBulkSuccess] = useState(false);

  // 세션 관련 상태
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [sessForm, setSessForm] = useState({ date: "", subject: "", topic: "" });
  const [isSavingSess, setIsSavingSess] = useState(false);
  const [sessMsg, setSessMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSessForm, setShowSessForm] = useState(false);

  const fetchQuestions = useCallback((sessionId: string) => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (sessionId !== "all") params.append("sessionId", sessionId);
    fetch(`/api/questions?${params}`)
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchQuestions("all");
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => setSessions(sortSessionsDesc(data)))
      .catch(() => {});
  }, [fetchQuestions]);

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    setSearch("");
    setSessionAnalysis(null);
    setSessionAnalysisError(null);
    setSelectedIds(new Set());
    setBulkMsg(null);
    setShowBulkSuccess(false);
    fetchQuestions(val);
  };

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
    setBulkMsg(null);
    setShowBulkSuccess(false);
  };

  const handleBulkComment = async () => {
    const ids = Array.from(selectedIds);
    if (!bulkComment.trim() || ids.length === 0) return;
    setIsSendingBulk(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/questions/bulk-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: ids, content: bulkComment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBulkMsg({ type: "success", text: `${data.success}개 질문에 피드백을 전송했습니다` });
      setShowBulkSuccess(true);
      setBulkComment("");
      window.setTimeout(() => {
        setSelectedIds(new Set());
        setBulkMsg(null);
        setShowBulkSuccess(false);
      }, 1600);
    } catch (err) {
      setShowBulkSuccess(false);
      setBulkMsg({ type: "error", text: err instanceof Error ? err.message : "전송에 실패했습니다" });
    } finally {
      setIsSendingBulk(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessForm.date || !sessForm.subject) {
      setSessMsg({ type: "error", text: "날짜와 교과는 필수입니다" });
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
      setSessForm({ date: "", subject: "", topic: "" });
      setSessMsg({ type: "success", text: "세션이 추가됐습니다" });
    } catch {
      setSessMsg({ type: "error", text: "세션 저장에 실패했습니다" });
    } finally {
      setIsSavingSess(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("이 세션을 삭제하시겠습니까?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (selectedSessionId === id) handleSessionChange("all");
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

  const filtered = questions.filter(
    (q) =>
      q.content.toLowerCase().includes(search.toLowerCase()) ||
      q.author.name.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) => q[key] === value);

  const currentSession = sessions.find((s) => s.id === selectedSessionId);

  const QuestionTable = ({ list }: { list: Question[] }) => {
    const allChecked = list.length > 0 && list.every((q) => selectedIds.has(q.id));
    return list.length === 0 ? (
      <div className="text-center py-8 text-gray-400 text-sm">
        {search ? "검색 결과가 없습니다" : "해당하는 질문이 없습니다"}
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
            {selectedSessionId === "all" && <TableHead className="w-36">세션</TableHead>}
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
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
              {selectedSessionId === "all" && (
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedQuestion(q);
                    setCorrectionClosure(q.closure);
                    setCorrectionCognitive(q.cognitive);
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
                <Label htmlFor="sess-date">날짜</Label>
                <Input
                  id="sess-date"
                  type="date"
                  value={sessForm.date}
                  onChange={(e) => setSessForm((p) => ({ ...p, date: e.target.value }))}
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
                <Label htmlFor="sess-topic">주제 (선택)</Label>
                <Input
                  id="sess-topic"
                  placeholder="예: 지구의 역사"
                  value={sessForm.topic}
                  onChange={(e) => setSessForm((p) => ({ ...p, topic: e.target.value }))}
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

      {/* 세션 선택 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedSessionId} onValueChange={handleSessionChange}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="세션 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 질문</SelectItem>
            <SelectItem value="none">세션 없는 질문</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {buildSessionLabel(s.date, s.subject, s.topic)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="질문 또는 학생 이름 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-sm text-gray-500 ml-auto">{filtered.length}개</span>
      </div>

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
              <StatBadge label="해석적" value={byType("cognitive", "interpretive").length} color="bg-purple-100 text-purple-700" />
              <StatBadge label="평가적" value={byType("cognitive", "evaluative").length} color="bg-orange-100 text-orange-700" />
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

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : currentSession ? (
        /* ── 세션 선택됨: 통합 단일 테이블 ── */
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
                {search ? "검색 결과가 없습니다" : "이 세션에 등록된 질문이 없습니다"}
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedQuestion(q);
                            setCorrectionClosure(q.closure);
                            setCorrectionCognitive(q.cognitive);
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
      ) : (
        /* ── 전체 / 세션없음 조회: 분류별 탭 ── */
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
              <CardTitle className="text-base">분류 2 · 사실적 / 해석적 / 평가적 질문</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="factual">
                <TabsList>
                  <TabsTrigger value="factual">
                    사실적 <span className="ml-1.5 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{byType("cognitive", "factual").length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="interpretive">
                    해석적 <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{byType("cognitive", "interpretive").length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="evaluative">
                    평가적 <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{byType("cognitive", "evaluative").length}</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="factual"><QuestionTable list={byType("cognitive", "factual")} /></TabsContent>
                <TabsContent value="interpretive"><QuestionTable list={byType("cognitive", "interpretive")} /></TabsContent>
                <TabsContent value="evaluative"><QuestionTable list={byType("cognitive", "evaluative")} /></TabsContent>
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
                      <SelectItem value="interpretive">해석적 질문</SelectItem>
                      <SelectItem value="evaluative">평가적 질문</SelectItem>
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

      {/* 일괄 피드백 패널 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-indigo-300 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 px-4 py-4 shadow-2xl">
          <div className="mx-auto max-w-5xl space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-indigo-700 shadow-sm">
                  {selectedIds.size}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">선택한 질문에 일괄 피드백 전송</p>
                  <p className="text-xs text-indigo-100">일괄 피드백은 AI 없이 동일 내용이 전송됩니다</p>
                </div>
              </div>
              <button
                onClick={clearSelection}
                className="self-start rounded-md px-2 py-1 text-xs font-medium text-indigo-100 underline-offset-4 hover:bg-white/10 hover:text-white hover:underline sm:self-auto"
              >
                선택 해제
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Textarea
                placeholder="선택한 모든 질문에 전송될 피드백을 입력하세요..."
                value={bulkComment}
                onChange={(e) => setBulkComment(e.target.value)}
                rows={2}
                className="min-h-[72px] flex-1 resize-none border-white/20 bg-white text-sm shadow-sm placeholder:text-gray-400"
              />
              <Button
                onClick={handleBulkComment}
                disabled={isSendingBulk || !bulkComment.trim()}
                className="h-10 shrink-0 bg-white px-5 text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:bg-white/60 disabled:text-indigo-300"
              >
                {isSendingBulk ? "전송 중..." : "일괄 전송"}
              </Button>
            </div>
            {bulkMsg && (
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                  bulkMsg.type === "success"
                    ? "bg-white text-indigo-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {bulkMsg.type === "success" && (
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-600" />
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
