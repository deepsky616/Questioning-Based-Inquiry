"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QuestionClassificationStats, applyClassificationFilter, type ClosureFilter, type CognitiveFilter } from "@/components/shared/QuestionClassificationStats";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsDesc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import { getSessionUser } from "@/lib/auth-helpers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InquiryFlowGraph } from "@/components/shared/InquiryFlowGraph";
import type { LikeSortOrder } from "@/lib/question-likes";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  unitDesignId?: string | null;
  sharedQuestions?: Array<{ type: string; content: string }>;
}

interface Comment {
  id: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
}

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  source?: string;
  inquiryType?: string | null;
  author: { id: string; name: string; className?: string };
  createdAt: string;
  likeCount: number;
  myLike: boolean;
}

function CommentSection({ questionId }: { questionId: string }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    fetch(`/api/questions/${questionId}/comments`)
      .then((r) => r.json())
      .then(setComments)
      .catch(() => {})
      .finally(() => setIsLoadingComments(false));
  }, [questionId]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setIsPosting(true);
    try {
      const res = await fetch(`/api/questions/${questionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      const created: Comment = await res.json();
      setComments((prev) => [...prev, created]);
      setNewComment("");
    } catch {
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoadingComments) {
    return <div className="px-4 py-2 text-xs text-gray-400">댓글 로딩 중...</div>;
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-4 space-y-3">
      {comments.length === 0 ? (
        <p className="text-xs text-gray-400">아직 댓글이 없습니다</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              <span className="font-medium text-gray-700 shrink-0">{c.author.name}</span>
              <span className="text-gray-600 flex-1">{c.content}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(c.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </div>
          ))}
        </div>
      )}
      {user.id && (
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="댓글을 입력하세요..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="text-sm h-8"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPosting || !newComment.trim()}
            className="h-8 shrink-0"
          >
            {isPosting ? "..." : "등록"}
          </Button>
        </div>
      )}
    </div>
  );
}

function LikeButton({
  questionId,
  authorId,
  likeCount,
  myLike,
  onLikeChange,
}: {
  questionId: string;
  authorId: string;
  likeCount: number;
  myLike: boolean;
  onLikeChange: (questionId: string, newCount: number, myLike: boolean) => void;
}) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [isPending, setIsPending] = useState(false);

  const isSelf = user.id === authorId;

  const handleClick = async () => {
    if (!user.id || isSelf || isPending) return;
    setIsPending(true);
    try {
      const method = myLike ? "DELETE" : "POST";
      const res = await fetch(`/api/questions/${questionId}/likes`, { method });
      if (res.ok) {
        const data = await res.json();
        onLikeChange(questionId, data.likeCount, !myLike);
      }
    } catch {
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isSelf || isPending || !user.id}
      title={isSelf ? "자신의 질문에는 좋아요를 할 수 없습니다" : myLike ? "좋아요 취소" : "좋아요"}
      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
        myLike
          ? "bg-rose-100 text-rose-600 hover:bg-rose-200"
          : isSelf
          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
          : "bg-gray-100 text-gray-500 hover:bg-rose-50 hover:text-rose-500"
      } ${isPending ? "opacity-50" : ""}`}
    >
      <span>{myLike ? "❤️" : "🤍"}</span>
      <span>{likeCount}</span>
    </button>
  );
}

function QuestionCard({
  q,
  onLikeChange,
  likesEnabled,
  commentsEnabled,
}: {
  q: Question;
  onLikeChange: (questionId: string, newCount: number, myLike: boolean) => void;
  likesEnabled: boolean;
  commentsEnabled: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const isTeacherShared = q.source === "TEACHER_SHARED";

  return (
    <div
      className={
        isTeacherShared
          ? "rounded-lg border-2 border-indigo-300 overflow-hidden bg-gradient-to-br from-indigo-50/60 to-white dark:bg-none dark:bg-card"
          : "rounded-lg border border-gray-200 overflow-hidden"
      }
    >
      <div
        className={
          isTeacherShared
            ? "p-4 bg-indigo-50/30 flex justify-between items-start gap-4"
            : "p-4 bg-gray-50 flex justify-between items-start gap-4"
        }
      >
        <div className="flex-1 min-w-0">
          {/* 출처 배지 */}
          <div className="flex gap-2 mb-2 flex-wrap items-center">
            {isTeacherShared ? (
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                📌 단원설계 질문
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                ✏️ 학생 질문
              </span>
            )}
            {isTeacherShared && q.inquiryType && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white text-indigo-600 border border-indigo-200">
                {q.inquiryType}
              </span>
            )}
          </div>
          <p className={isTeacherShared ? "text-gray-900 font-medium" : "text-gray-900"}>
            {q.content}
          </p>
          <div className="flex gap-2 mt-2 flex-wrap items-center">
            <span className={`text-xs px-2 py-1 rounded ${CLOSURE_STYLE[q.closure]}`}>
              {CLOSURE_LABEL[q.closure]}
            </span>
            <span className={`text-xs px-2 py-1 rounded ${COGNITIVE_STYLE[q.cognitive]}`}>
              {COGNITIVE_LABEL[q.cognitive]}
            </span>
            {likesEnabled && (
              <LikeButton
                questionId={q.id}
                authorId={q.author.id}
                likeCount={q.likeCount}
                myLike={q.myLike}
                onLikeChange={onLikeChange}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div className="text-sm text-gray-600">
              {isTeacherShared ? `${q.author.name} 선생님` : q.author.name}
            </div>
            {!isTeacherShared && q.author.className && (
              <div className="text-xs text-gray-400">{q.author.className}</div>
            )}
          </div>
          {commentsEnabled && (
            <button
              onClick={() => setShowComments((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {showComments ? "댓글 닫기" : "댓글 보기"}
            </button>
          )}
        </div>
      </div>
      {commentsEnabled && showComments && <CommentSection questionId={q.id} />}
    </div>
  );
}

export default function ExplorePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");
  const [likeSort, setLikeSort] = useState<LikeSortOrder>("none");
  const [exploreCfg, setExploreCfg] = useState<{ likesEnabled: boolean; commentsEnabled: boolean }>({ likesEnabled: true, commentsEnabled: true });
  const [filterClosure, setFilterClosure] = useState<ClosureFilter>("all");
  const [filterCognitive, setFilterCognitive] = useState<CognitiveFilter>("all");

  useEffect(() => {
    fetch("/api/explore-config")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.likesEnabled === "boolean") setExploreCfg(d);
      })
      .catch(() => {});
  }, []);

  const fetchQuestions = useCallback(
    (sessionId: string, opts?: { date?: string; subject?: string; topic?: string; likeSort?: LikeSortOrder }) => {
      setIsLoading(true);
      const params = new URLSearchParams({ isPublic: "true" });
      if (sessionId !== "all") params.set("sessionId", sessionId);
      if (opts?.date) params.set("date", opts.date);
      if (opts?.subject) params.set("subject", opts.subject);
      if (opts?.topic) params.set("topic", opts.topic);
      const sort = opts?.likeSort ?? likeSort;
      if (sort !== "none") params.set("likeSort", sort);
      fetch(`/api/questions?${params}`)
        .then((r) => r.json())
        .then(setQuestions)
        .catch(() => {})
        .finally(() => setIsLoading(false));
    },
    [likeSort]
  );

  useEffect(() => {
    fetchQuestions("all");
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => setSessions(sortSessionsDesc(data)))
      .catch(() => {});
  }, [fetchQuestions]);

  const handleLikeChange = (questionId: string, newCount: number, myLike: boolean) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, likeCount: newCount, myLike } : q))
    );
  };

  const handleLikeSortChange = (order: LikeSortOrder) => {
    setLikeSort(order);
    fetchQuestions(selectedSessionId, { likeSort: order });
  };

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    fetchQuestions(val);
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

  // 단원설계 질문(TEACHER_SHARED)을 일반 학생 질문과 같이 한 목록에 표시
  // (정렬은 단원설계 질문이 위쪽에 오도록 우선순위 부여)
  const filtered = questions
    .filter(
      (q) =>
        q.content.toLowerCase().includes(search.toLowerCase()) ||
        q.author.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const aPriority = a.source === "TEACHER_SHARED" ? 0 : 1;
      const bPriority = b.source === "TEACHER_SHARED" ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);

  const displayed = applyClassificationFilter(filtered, filterClosure, filterCognitive);

  const Empty = () => (
    <div className="text-center py-8 text-gray-400 text-sm">
      {search ? "검색 결과가 없습니다" : "해당하는 질문이 없습니다"}
    </div>
  );

  const QuestionList = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <Empty />
    ) : (
      <div className="space-y-3 mt-3">
        {list.map((q) => (
          <QuestionCard key={q.id} q={q} onLikeChange={handleLikeChange}
            likesEnabled={exploreCfg.likesEnabled} commentsEnabled={exploreCfg.commentsEnabled} />
        ))}
      </div>
    );

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 탐구</h2>
        <p className="text-gray-600">
          다른 학생들의 질문을 살펴보고 댓글을 남겨보세요 · 공개 {questions.length}개
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
          <div className="mt-3">
            <Input
              placeholder="질문 또는 이름으로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {selectedSession?.unitDesignId && (
        <InquiryFlowGraph
          title="탐구 질문 관계도"
          description="선생님의 탐구 질문과 친구들의 공개 질문 흐름을 함께 봅니다"
          subject={selectedSession.subject}
          topic={selectedSession.topic}
          sharedQuestions={
            Array.isArray(selectedSession.sharedQuestions) ? selectedSession.sharedQuestions : []
          }
          studentQuestions={filtered.map((question) => ({
            id: question.id,
            content: question.content,
            cognitive: question.cognitive,
            closure: question.closure,
            isPublic: true,
          }))}
          audience="student"
        />
      )}

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
              📝 전체 질문 목록{" "}
              <span className="text-sm font-normal text-muted-foreground">{displayed.length}개</span>
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">좋아요순</span>
              <div className="flex rounded-md border overflow-hidden">
                {(["none", "desc", "asc"] as LikeSortOrder[]).map((order, i) => (
                  <button
                    key={order}
                    onClick={() => handleLikeSortChange(order)}
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
          <QuestionList list={displayed} />
        </CardContent>
      </Card>
    </div>
  );
}
