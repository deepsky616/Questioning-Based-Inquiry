"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuestionClassificationStats, applyClassificationFilter, type ClosureFilter, type CognitiveFilter } from "@/components/shared/QuestionClassificationStats";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSessionUser } from "@/lib/auth-helpers";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsDesc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
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
  likeCount?: number;
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
  const [filterClosure, setFilterClosure] = useState<ClosureFilter>("all");
  const [filterCognitive, setFilterCognitive] = useState<CognitiveFilter>("all");
  const [likeSort, setLikeSort] = useState<"none" | "desc" | "asc">("none");
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentsByQuestion, setCommentsByQuestion] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 조회 모드
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

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    fetchQuestions({ sessionId: val });
  };

  // 날짜·교과·주제로 세션 목록을 좁힌다(세션을 고르는 보조 필터, 교사 페이지와 동일)
  const filterOptions = getSessionFilterOptions(sessions);
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  });

  // 필터로 선택 세션이 목록 밖이 되면 전체로 보정
  useEffect(() => {
    if (selectedSessionId === "all") return;
    if (!filteredSessions.some((s) => s.id === selectedSessionId)) {
      handleSessionChange("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterSubject, filterTopic]);

  const filtered = questions;

  const classified = applyClassificationFilter(filtered, filterClosure, filterCognitive);
  const displayed =
    likeSort === "none"
      ? classified
      : [...classified].sort((a, b) =>
          likeSort === "desc"
            ? (b.likeCount ?? 0) - (a.likeCount ?? 0)
            : (a.likeCount ?? 0) - (b.likeCount ?? 0)
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
            <TableHead className="w-16">좋아요</TableHead>
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
                  <TableCell className="text-sm text-rose-500">
                    ♥ {q.likeCount ?? 0}
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
                    <TableCell colSpan={10} className="bg-gray-50/70 px-6 py-4">
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

      {/* 조회 방법: 날짜·교과·주제로 좁혀 세션 선택 (교사 페이지와 동일) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">조회 방법</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-36">
              <label className="text-xs font-medium text-muted-foreground">날짜</label>
              <Select value={filterDate || "__all__"} onValueChange={(v) => setFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder="전체 날짜" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 날짜</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label className="text-xs font-medium text-muted-foreground">교과</label>
              <Select value={filterSubject || "__all__"} onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 교과</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-medium text-muted-foreground">주제</label>
              <Select value={filterTopic || "__all__"} onValueChange={(v) => setFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 주제</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs font-medium text-muted-foreground">세션</label>
              <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                <SelectTrigger className="bg-background font-medium"><SelectValue placeholder="세션 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 세션</SelectItem>
                  {filteredSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{buildSessionLabel(s.date, s.subject, s.topic)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">💡 날짜·교과·주제로 좁혀도, 직접 세션을 골라도 결과는 같습니다.</p>
        </CardContent>
      </Card>

      {/* 분류 1: 폐쇄형 / 개방형 */}
      {/* 질문 분류 통계 현황 (막대/칩 클릭으로 필터) */}
      <QuestionClassificationStats
        questions={filtered}
        filterClosure={filterClosure}
        filterCognitive={filterCognitive}
        onFilterClosure={setFilterClosure}
        onFilterCognitive={setFilterCognitive}
      />

      {/* 전체 질문 목록 — 정렬(좋아요순) */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              📝 전체 질문 목록 <span className="text-sm font-normal text-muted-foreground">{displayed.length}개</span>
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">좋아요순</span>
              <div className="flex rounded-md border overflow-hidden">
                {(["none", "desc", "asc"] as const).map((order, i) => (
                  <button
                    key={order}
                    onClick={() => setLikeSort(order)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
                      likeSort === order ? "bg-rose-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {order === "none" ? "기본" : order === "desc" ? "많은 순 ↓" : "적은 순 ↑"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <QuestionRows list={displayed} />
        </CardContent>
      </Card>
    </div>
  );
}
