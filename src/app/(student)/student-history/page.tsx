"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getSessionUser } from "@/lib/auth-helpers";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [search, setSearch] = useState("");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentsByQuestion, setCommentsByQuestion] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user.id) return;
    fetch(`/api/questions?authorId=${user.id}`)
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {});
  }, [user.id]);

  const togglePublic = async (id: string, currentPublic: boolean) => {
    // 클릭 즉시 반영 (낙관적 업데이트)
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isPublic: !currentPublic } : q))
    );

    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !currentPublic }),
      });
      if (!res.ok) throw new Error("업데이트 실패");
    } catch {
      // 실패 시 원래 상태로 복원
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, isPublic: currentPublic } : q))
      );
    }
  };

  const filtered = questions.filter((q) =>
    q.content.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) => q[key] === value);

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
            <TableHead className="w-28">날짜</TableHead>
            <TableHead className="w-28">댓글</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q, i) => {
            const comments = commentsByQuestion[q.id] ?? q.comments ?? [];
            const commentCount = comments.length;
            const isExpanded = expandedQuestionId === q.id;
            const isLoadingComments = loadingComments[q.id];

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
                    <Switch checked={q.isPublic} onCheckedChange={() => togglePublic(q.id, q.isPublic)} />
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
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-gray-50/70 px-6 py-4">
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
        <p className="text-gray-600">작성한 질문을 두 가지 분류로 확인할 수 있습니다 · 총 {questions.length}개</p>
      </div>

      <Input
        placeholder="질문 검색..."
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

      {/* 분류 2: 사실적 / 해석적 / 평가적 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">분류 2 · 사실적 / 해석적 / 평가적 질문</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="factual">
            <TabsList>
              <TabsTrigger value="factual">
                사실적 질문 <span className="ml-1.5 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{byType("cognitive", "factual").length}</span>
              </TabsTrigger>
              <TabsTrigger value="interpretive">
                해석적 질문 <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{byType("cognitive", "interpretive").length}</span>
              </TabsTrigger>
              <TabsTrigger value="evaluative">
                평가적 질문 <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{byType("cognitive", "evaluative").length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="factual">
              <QuestionRows list={byType("cognitive", "factual")} />
            </TabsContent>
            <TabsContent value="interpretive">
              <QuestionRows list={byType("cognitive", "interpretive")} />
            </TabsContent>
            <TabsContent value="evaluative">
              <QuestionRows list={byType("cognitive", "evaluative")} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
