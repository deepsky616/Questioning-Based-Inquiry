"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DatePicker from "@/components/shared/DatePicker";
import { getSessionUser } from "@/lib/auth-helpers";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_CATEGORIES,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
  matchesCognitiveCategory,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsDesc } from "@/lib/sessions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
}

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  isPublic: boolean;
  createdAt: string;
  comments?: Comment[];
  session?: { id: string; date: string; subject: string; topic: string } | null;
}

interface Comment {
  id: string;
  content: string;
  author: { name: string };
  createdAt: string;
}

export default function HistoryPage() {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [search, setSearch] = useState("");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentsByQuestion, setCommentsByQuestion] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 조회 모드
  const [lookupMode, setLookupMode] = useState<"session" | "detail">("session");
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  const fetchQuestions = useCallback(
    (opts?: { sessionId?: string; date?: string; subject?: string; topic?: string }) => {
      if (!user.id) return;
      const params = new URLSearchParams({ authorId: user.id });
      if (opts?.sessionId && opts.sessionId !== "all") params.set("sessionId", opts.sessionId);
      if (opts?.date) params.set("date", opts.date);
      if (opts?.subject) params.set("subject", opts.subject);
      if (opts?.topic) params.set("topic", opts.topic);
      fetch(`/api/questions?${params}`)
        .then((r) => r.json())
        .then(setQuestions)
        .catch(() => {});
    },
    [user.id]
  );

  useEffect(() => {
    if (!user.id) return;
    fetchQuestions();
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => setSessions(sortSessionsDesc(data)))
      .catch(() => {});
  }, [user.id, fetchQuestions]);

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedSessionId(val);
    fetchQuestions({ sessionId: val });
  };

  const applyDetailFilter = () => {
    fetchQuestions({ date: filterDate, subject: filterSubject, topic: filterTopic });
  };

  const clearDetailFilter = () => {
    setFilterDate("");
    setFilterSubject("");
    setFilterTopic("");
    fetchQuestions();
  };

  const switchMode = (m: "session" | "detail") => {
    setLookupMode(m);
    if (m === "session") {
      setSelectedSessionId("all");
      fetchQuestions();
    } else {
      clearDetailFilter();
    }
  };

  const filtered = questions.filter((q) =>
    q.content.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) =>
      key === "cognitive" ? matchesCognitiveCategory(q.cognitive, value) : q[key] === value
    );

  const toggleComments = async (questionId: string) => {
    if (expandedQuestionId === questionId) {
      setExpandedQuestionId(null);
      return;
    }

    setExpandedQuestionId(questionId);
    if (commentsByQuestion[questionId]) return;

    setLoadingComments((prev) => ({ ...prev, [questionId]: true }));
    try {
      const res = await fetch(`/api/questions/${questionId}/comments`);
      if (!res.ok) throw new Error("댓글을 불러오지 못했습니다");
      const data: Comment[] = await res.json();
      setCommentsByQuestion((prev) => ({ ...prev, [questionId]: data }));
    } catch {
      setCommentsByQuestion((prev) => ({ ...prev, [questionId]: [] }));
    } finally {
      setLoadingComments((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const handleDelete = async (questionId: string) => {
    if (!confirm("이 질문을 정말 삭제할까요? 작성한 댓글도 모두 함께 사라집니다.")) return;
    setDeletingId(questionId);
    try {
      const res = await fetch(`/api/questions/${questionId}`, { method: "DELETE" });
      if (res.ok) {
        setQuestions((prev) => prev.filter((q) => q.id !== questionId));
        setExpandedQuestionId((prev) => (prev === questionId ? null : prev));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? "삭제에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const QuestionRows = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <div className="text-center py-8 text-gray-400 text-sm">해당하는 질문이 없습니다</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>질문 내용</TableHead>
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
            <TableHead className="w-24">공개</TableHead>
            <TableHead className="w-32">세션</TableHead>
            <TableHead className="w-28">날짜</TableHead>
            <TableHead className="w-24">댓글</TableHead>
            <TableHead className="w-20">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q, i) => {
            const comments = commentsByQuestion[q.id] ?? q.comments ?? [];
            const commentCount = comments.length;
            const isExpanded = expandedQuestionId === q.id;
            const isLoadingComments = loadingComments[q.id];
            const isDeleting = deletingId === q.id;

            return (
              <Fragment key={q.id}>
                <TableRow>
                  <TableCell className="text-gray-400">{i + 1}</TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate">{q.content}</p>
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
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded ${q.isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {q.isPublic ? "공개" : "비공개"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-xs truncate">
                    {q.session ? buildSessionLabel(q.session.date, q.session.subject, q.session.topic) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-gray-400">
                    {new Date(q.createdAt).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={
                        commentCount === 0
                          ? "h-8 border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-50 hover:text-gray-500"
                          : "h-8"
                      }
                      onClick={() => toggleComments(q.id)}
                    >
                      댓글 {commentCount}개
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-red-500 border-red-200 hover:bg-red-50"
                      disabled={isDeleting}
                      onClick={() => handleDelete(q.id)}
                    >
                      {isDeleting ? "삭제 중..." : "🗑 삭제"}
                    </Button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-gray-50/70 px-6 py-4">
                      {isLoadingComments ? (
                        <div className="text-sm text-gray-400">댓글을 불러오는 중...</div>
                      ) : comments.length === 0 ? (
                        <div className="text-sm text-gray-400">댓글이 없습니다</div>
                      ) : (
                        <div className="space-y-3">
                          {comments.map((comment) => (
                            <div key={comment.id} className="rounded-md border bg-white p-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-gray-700">
                                  {comment.author.name}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(comment.createdAt).toLocaleDateString("ko-KR")}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                                {comment.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">내 질문</h2>
        <p className="text-gray-600">
          작성한 질문을 조회하고, 분류·세션별로 확인하거나 삭제할 수 있어요 · 총 {questions.length}개
        </p>
      </div>

      {/* 조회 모드 토글 + 필터 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">조회 방법</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={lookupMode === "session" ? "default" : "outline"}
              size="sm"
              onClick={() => switchMode("session")}
            >
              🗂️ 세션별 조회
            </Button>
            <Button
              variant={lookupMode === "detail" ? "default" : "outline"}
              size="sm"
              onClick={() => switchMode("detail")}
            >
              🔍 날짜·교과·주제별 조회
            </Button>
          </div>

          {lookupMode === "session" && (
            <div className="space-y-2 max-w-md">
              <Label className="text-sm">수업 세션 선택</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={selectedSessionId}
                onChange={handleSessionChange}
              >
                <option value="all">전체 세션</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {buildSessionLabel(s.date, s.subject, s.topic)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {lookupMode === "detail" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">날짜</Label>
                <DatePicker value={filterDate} onChange={setFilterDate} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">교과</Label>
                <Input
                  placeholder="예) 과학"
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">주제</Label>
                <Input
                  placeholder="예) 빛의 굴절"
                  value={filterTopic}
                  onChange={(e) => setFilterTopic(e.target.value)}
                />
              </div>
              <div className="sm:col-span-3 flex gap-2">
                <Button size="sm" onClick={applyDetailFilter}>
                  적용
                </Button>
                <Button size="sm" variant="outline" onClick={clearDetailFilter}>
                  초기화
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Input
        placeholder="질문 내용 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* 분류 1: 폐쇄형 / 개방형 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">분류 1 · 폐쇄형 / 개방형 질문</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="closed">
            <TabsList>
              <TabsTrigger value="closed">
                폐쇄형 질문 <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{byType("closure", "closed").length}</span>
              </TabsTrigger>
              <TabsTrigger value="open">
                개방형 질문 <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{byType("closure", "open").length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="closed">
              <QuestionRows list={byType("closure", "closed")} />
            </TabsContent>
            <TabsContent value="open">
              <QuestionRows list={byType("closure", "open")} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 분류 2: 사실적 / 개념적 / 논쟁적 */}
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
                <QuestionRows list={byType("cognitive", category.value)} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
