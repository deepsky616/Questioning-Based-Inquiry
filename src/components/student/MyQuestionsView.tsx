"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommentThread } from "@/components/shared/CommentThread";
import { formatDateTime } from "@/lib/datetime";
import { QuestionClassificationStats, ClassificationChips, QuestionSortControl, applyClassificationFilter, type ClosureFilter, type CognitiveFilter, type SortField, type SortDir } from "@/components/shared/QuestionClassificationStats";
import { EmptyState } from "@/components/shared/EmptyState";
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
  unitDesignId?: string | null;
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
  commentCount?: number;
  comments?: Comment[];
  session?: { id: string; date: string; subject: string; topic: string } | null;
}

interface Comment {
  id: string;
  content: string;
  author: { name: string };
  createdAt: string;
}

export function MyQuestionsView() {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filterClosure, setFilterClosure] = useState<ClosureFilter>("all");
  const [filterCognitive, setFilterCognitive] = useState<CognitiveFilter>("all");
  const [sortField, setSortField] = useState<SortField>("like");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});
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
  // 탐구질문에서 생성한 수업세션(unitDesignId)은 내 질문 조회에서 제외(수업 탐구 질문 탭에서만 다룸)
  const browsableSessions = sessions.filter((s) => !s.unitDesignId);
  const filterOptions = getSessionFilterOptions(browsableSessions);
  const filteredSessions = filterSessions(browsableSessions, {
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

  const filtered = search.trim()
    ? questions.filter((q) => q.content.toLowerCase().includes(search.trim().toLowerCase()))
    : questions;

  const classified = applyClassificationFilter(filtered, filterClosure, filterCognitive);
  const sortKey = (q: Question) => (sortField === "like" ? q.likeCount ?? 0 : q.commentCount ?? 0);
  const displayed = [...classified].sort((a, b) =>
    sortDir === "desc" ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b)
  );

  const toggleComments = (questionId: string) => {
    setExpandedQuestionId((prev) => (prev === questionId ? null : questionId));
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
      <EmptyState icon="📝" title="해당하는 질문이 없습니다" description="다른 조건으로 조회해 보세요" />
    ) : (
      <div className="overflow-x-auto"><Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>질문 내용</TableHead>
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
            <TableHead className="w-24">공개</TableHead>
            <TableHead className="w-32">수업 세션</TableHead>
            <TableHead className="w-36">작성 일시</TableHead>
            <TableHead className="w-16">좋아요</TableHead>
            <TableHead className="w-24">댓글</TableHead>
            <TableHead className="w-20">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q, i) => {
            const commentCount = commentCountOverride[q.id] ?? q.comments?.length ?? 0;
            const isExpanded = expandedQuestionId === q.id;
            const isDeleting = deletingId === q.id;

            return (
              <Fragment key={q.id}>
                <TableRow>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
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
                    <span className={`text-xs px-2 py-1 rounded ${q.isPublic ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {q.isPublic ? "공개" : "비공개"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {q.session ? buildSessionLabel(q.session.date, q.session.subject, q.session.topic) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(q.createdAt)}
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
                          ? "h-8 border-border bg-muted/40 text-muted-foreground hover:bg-muted/40 hover:text-muted-foreground"
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
                    <TableCell colSpan={10} className="bg-muted/30 px-6 py-4">
                      <CommentThread
                        questionId={q.id}
                        onCountChange={(n) => setCommentCountOverride((p) => ({ ...p, [q.id]: n }))}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table></div>
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        작성한 질문을 조회하고, 분류·세션별로 확인하거나 삭제할 수 있어요 · 총 {questions.length}개
      </p>

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
              <label className="text-xs font-medium text-muted-foreground">수업 세션</label>
              <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                <SelectTrigger className="bg-background font-medium"><SelectValue placeholder="수업 세션 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 수업 세션</SelectItem>
                  {filteredSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{buildSessionLabel(s.date, s.subject, s.topic)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">💡 날짜·교과·주제로 좁혀도, 직접 수업 세션을 골라도 결과는 같습니다.</p>
        </CardContent>
      </Card>

      {/* 질문 분류 통계 현황 (비율 막대, 표시 전용) */}
      <QuestionClassificationStats questions={filtered} />

      {/* 전체 질문 목록 — 분류 필터(분류1/분류2) + 정렬(좋아요순·댓글순) */}
      <Card>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-base">
                📝 전체 질문 목록 <span className="text-sm font-normal text-muted-foreground">{displayed.length}개</span>
              </CardTitle>
              <Input
                placeholder="질문으로 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm w-56 bg-background"
              />
            </div>
            <QuestionSortControl
              field={sortField}
              dir={sortDir}
              showStudent={false}
              onChange={(f, d) => { setSortField(f); setSortDir(d); }}
            />
          </div>
          <ClassificationChips
            filterClosure={filterClosure}
            filterCognitive={filterCognitive}
            onFilterClosure={setFilterClosure}
            onFilterCognitive={setFilterCognitive}
          />
        </CardHeader>
        <CardContent>
          <QuestionRows list={displayed} />
        </CardContent>
      </Card>
    </div>
  );
}
