"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_CATEGORIES,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
  matchesCognitiveCategory,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsDesc } from "@/lib/sessions";
import { getSessionUser } from "@/lib/auth-helpers";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
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
  author: { name: string; className?: string };
  createdAt: string;
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            className="text-sm h-8"
          />
          <Button size="sm" onClick={handleSubmit} disabled={isPosting || !newComment.trim()} className="h-8 shrink-0">
            {isPosting ? "..." : "등록"}
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q }: { q: Question }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 bg-gray-50 flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-gray-900">{q.content}</p>
          <div className="flex gap-2 mt-2">
            <span className={`text-xs px-2 py-1 rounded ${CLOSURE_STYLE[q.closure]}`}>
              {CLOSURE_LABEL[q.closure]}
            </span>
            <span className={`text-xs px-2 py-1 rounded ${COGNITIVE_STYLE[q.cognitive]}`}>
              {COGNITIVE_LABEL[q.cognitive]}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <div className="text-sm text-gray-600">{q.author.name}</div>
            {q.author.className && (
              <div className="text-xs text-gray-400">{q.author.className}</div>
            )}
          </div>
          <button
            onClick={() => setShowComments((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {showComments ? "댓글 닫기" : "댓글 보기"}
          </button>
        </div>
      </div>
      {showComments && <CommentSection questionId={q.id} />}
    </div>
  );
}

export default function ExplorePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchQuestions = (sessionId: string) => {
    setIsLoading(true);
    const params = new URLSearchParams({ isPublic: "true" });
    if (sessionId !== "all") params.set("sessionId", sessionId);
    fetch(`/api/questions?${params}`)
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchQuestions("all");
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => setSessions(sortSessionsDesc(data)))
      .catch(() => {});
  }, []);

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedSessionId(val);
    setSearch("");
    fetchQuestions(val);
  };

  const filtered = questions.filter(
    (q) =>
      q.content.toLowerCase().includes(search.toLowerCase()) ||
      q.author.name.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) =>
      key === "cognitive" ? matchesCognitiveCategory(q.cognitive, value) : q[key] === value
    );

  const Empty = () => (
    <div className="text-center py-8 text-gray-400 text-sm">
      {search ? "검색 결과가 없습니다" : "해당하는 질문이 없습니다"}
    </div>
  );

  const QuestionList = ({ list }: { list: Question[] }) =>
    list.length === 0 ? <Empty /> : (
      <div className="space-y-3 mt-3">
        {list.map((q) => <QuestionCard key={q.id} q={q} />)}
      </div>
    );

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 탐구</h2>
        <p className="text-gray-600">다른 학생들의 질문을 살펴보고 댓글을 남겨보세요 · 공개 {questions.length}개</p>
      </div>

      {/* 필터 영역 */}
      <div className="flex flex-wrap gap-3 items-center">
        {sessions.length > 0 && (
          <select
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        )}
        <Input
          placeholder="질문 또는 이름으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {selectedSessionId !== "all" && (
        <div className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
          {buildSessionLabel(
            sessions.find((s) => s.id === selectedSessionId)?.date ?? "",
            sessions.find((s) => s.id === selectedSessionId)?.subject ?? "",
            sessions.find((s) => s.id === selectedSessionId)?.topic ?? ""
          )} · {filtered.length}개 질문
        </div>
      )}

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
            <TabsContent value="closed"><QuestionList list={byType("closure", "closed")} /></TabsContent>
            <TabsContent value="open"><QuestionList list={byType("closure", "open")} /></TabsContent>
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
                <QuestionList list={byType("cognitive", category.value)} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
