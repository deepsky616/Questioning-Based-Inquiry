"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { TranslateAllButton } from "@/components/shared/TranslateAllButton";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { CommentThread } from "@/components/shared/CommentThread";
import { formatDateTime } from "@/lib/datetime";
import { QuestionClassificationStats, ClassificationChips, QuestionSortControl, applyClassificationFilter, type ClosureFilter, type CognitiveFilter, type SortField, type SortDir } from "@/components/shared/QuestionClassificationStats";
import { EmptyState } from "@/components/shared/EmptyState";
import { StudentMyQuestionsSummary } from "@/components/student/StudentMyQuestionsSummary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSessionUser } from "@/lib/auth-helpers";
import { useStudentSessions } from "@/lib/app-queries";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
} from "@/lib/question-labels";
import { buildSessionLabel, sortSessionsDesc, getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { SessionReferencePanel } from "@/components/shared/SessionReferencePanel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  unitDesignId?: string | null;
  sharedQuestions?: Array<{ type: string; content: string }>;
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
  const t = useTranslations("myQuestions");
  const tEx = useTranslations("explore");
  const ct = useContentTranslation();
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [filterClosure, setFilterClosure] = useState<ClosureFilter>("all");
  const [filterCognitive, setFilterCognitive] = useState<CognitiveFilter>("all");
  const [sortField, setSortField] = useState<SortField>("like");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const { data: rawSessions = [] } = useStudentSessions<QuestionSession>({ userId: user.id });
  const sessions = useMemo(() => sortSessionsDesc(rawSessions), [rawSessions]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});
  // 내 질문 수정(반응이 달리기 전까지만) — 저장 시 자동 재분류
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const refreshMyQuestions = () => {
    queryClient.invalidateQueries({ queryKey: ["my-questions"] });
    queryClient.invalidateQueries({ queryKey: ["my-questions-all-sessions"] });
    // 같은 기기에서 전체 질문 탐구로 이동해도 바로 반영되도록 함께 무효화
    queryClient.invalidateQueries({ queryKey: ["explore-questions"] });
  };

  const saveQuestionEdit = async (questionId: string) => {
    const content = editContent.trim();
    if (!content || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      // 내용이 바뀌었으니 자동 재분류 후 함께 저장한다
      const clsRes = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const cls = await clsRes.json().catch(() => ({}));
      const res = await fetch(`/api/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(clsRes.ok && cls.closure ? {
            closure: cls.closure,
            cognitive: cls.cognitive,
            closureScore: cls.closureScore,
            cognitiveScore: cls.cognitiveScore,
          } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : t("editFailed"));
      setEditingQuestionId(null);
      setEditContent("");
      refreshMyQuestions();
      toast({ variant: "success", description: t("editDone") });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : t("editFailed") });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!(await confirm({ description: t("deleteConfirm"), confirmText: t("deleteBtn"), destructive: true }))) return;
    try {
      const res = await fetch(`/api/questions/${questionId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : t("deleteFailed"));
      refreshMyQuestions();
      toast({ variant: "success", description: t("deleteDone") });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : t("deleteFailed") });
    }
  };

  // 조회 모드
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  // 내 질문 목록은 react-query로 주기 폴링(12초) + 창 포커스 시 재조회한다.
  // 교사가 질문조회에서 공개/비공개를 바꾸면 새로고침 없이 자동 반영된다.
  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["my-questions", user.id, selectedSessionId],
    queryFn: async () => {
      const params = new URLSearchParams({ authorId: user.id });
      if (selectedSessionId !== "all") params.set("sessionId", selectedSessionId);
      const res = await fetch(`/api/questions?${params}`);
      if (!res.ok) throw new Error("질문을 불러오지 못했습니다");
      return res.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const { data: allSessionQuestions = [] } = useQuery<Question[]>({
    queryKey: ["my-questions-all-sessions", user.id],
    queryFn: async () => {
      const params = new URLSearchParams({ authorId: user.id });
      const res = await fetch(`/api/questions?${params}`);
      if (!res.ok) throw new Error("질문을 불러오지 못했습니다");
      return res.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
  };

  // 날짜·교과·주제로 세션 목록을 좁힌다(세션을 고르는 보조 필터, 교사 페이지와 동일)
  // 질문 배포 세션(unitDesignId + 배포 질문)만 제외. 탐구질문 수업 세션(배포 질문 없음)은
  // 학생이 직접 질문을 작성하므로 내 질문 조회에 노출한다.
  const browsableSessions = sessions.filter((s) => !s.unitDesignId || isInquiryDesignSession(s));
  const filterOptions = getSessionFilterOptions(browsableSessions);
  const filteredSessions = filterSessions(browsableSessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  });
  const allQuestionSessionIds = useMemo(
    () => new Set(allSessionQuestions.map((q) => q.session?.id).filter((id): id is string => Boolean(id))),
    [allSessionQuestions],
  );
  const sessionProgress = useMemo(() => {
    const total = filteredSessions.length;
    const completed = filteredSessions.filter((s) => allQuestionSessionIds.has(s.id)).length;
    const remaining = Math.max(total - completed, 0);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remainingSessions = filteredSessions.filter((s) => !allQuestionSessionIds.has(s.id)).slice(0, 3);
    return { total, completed, remaining, percent, remainingSessions };
  }, [allQuestionSessionIds, filteredSessions]);

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
  const summaryLikes = filtered.reduce((sum, question) => sum + (question.likeCount ?? 0), 0);
  const summaryComments = filtered.reduce(
    (sum, question) => sum + (commentCountOverride[question.id] ?? question.commentCount ?? question.comments?.length ?? 0),
    0,
  );

  const toggleComments = (questionId: string) => {
    setExpandedQuestionId((prev) => (prev === questionId ? null : questionId));
  };

  const QuestionRows = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <EmptyState icon="📝" title={t("empty")} description={t("emptyDesc")} />
    ) : (
      <>
      <div className="student-questions-tablet-list space-y-3 xl:hidden">
        {list.map((q, i) => {
          const commentCount = commentCountOverride[q.id] ?? q.comments?.length ?? 0;
          const isExpanded = expandedQuestionId === q.id;
          const canEdit = (q.likeCount ?? 0) === 0 && commentCount === 0;

          return (
            <div key={q.id} className="min-h-[148px] rounded-lg border bg-card p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {editingQuestionId === q.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        maxLength={200}
                        rows={4}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[7rem] text-base leading-7"
                        autoFocus
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-muted-foreground">{editContent.length}/200 · {t("reclassifyNote")}</span>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" className="h-10" onClick={() => saveQuestionEdit(q.id)} disabled={isSavingEdit || !editContent.trim()}>
                            {isSavingEdit ? t("savingEdit") : t("saveEdit")}
                          </Button>
                          <Button size="sm" className="h-10" variant="outline" disabled={isSavingEdit} onClick={() => { setEditingQuestionId(null); setEditContent(""); }}>
                            {tEx("close")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-base leading-7 text-foreground">{ct.text({ type: "QUESTION", id: q.id }, q.content)}</p>
                  )}
                  {ct.canTranslate && editingQuestionId !== q.id && <TranslateToggle item={{ type: "QUESTION", id: q.id }} ct={ct} className="mt-1" />}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-2 py-0.5 text-xs break-keep ${CLOSURE_STYLE[q.closure]}`}>{CLOSURE_LABEL[q.closure]}</span>
                <span className={`rounded px-2 py-0.5 text-xs break-keep ${COGNITIVE_STYLE[q.cognitive]}`}>{COGNITIVE_LABEL[q.cognitive]}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${q.isPublic ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{q.isPublic ? t("public") : t("private")}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {selectedSessionId === "all" && q.session && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                    <span>📚</span>
                    <span>{buildSessionLabel(q.session.date, q.session.subject, q.session.topic)}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span>🕒</span>
                  <span>{formatDateTime(q.createdAt)}</span>
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                  <p className="text-[11px] text-muted-foreground">{t("colLikes")}</p>
                  <p className="text-sm font-semibold text-rose-500">❤️ {q.likeCount ?? 0}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleComments(q.id)}
                  className="rounded-md bg-muted/40 px-2 py-2 text-center text-indigo-600 transition-colors hover:bg-muted"
                >
                  <p className="text-[11px] text-muted-foreground">{t("colComments")}</p>
                  <p className="text-sm font-semibold">💬 {commentCount}</p>
                </button>
              </div>

              <div className="mt-3 flex justify-end gap-1">
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditingQuestionId(q.id); setEditContent(q.content); }}
                      disabled={editingQuestionId === q.id}
                      className="flex h-10 w-10 items-center justify-center rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                      title={t("editBtn")}
                      aria-label={t("editBtn")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteQuestion(q.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-500 hover:bg-red-50"
                      title={t("deleteBtn")}
                      aria-label={t("deleteBtn")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => toast({ description: t("lockedHint") })}
                    className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground"
                    title={t("lockedHint")}
                    aria-label={t("lockedHint")}
                  >
                    🔒
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="mt-3 rounded-lg bg-muted/30 p-3">
                  <CommentThread
                    questionId={q.id}
                    onCountChange={(n) => setCommentCountOverride((p) => ({ ...p, [q.id]: n }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto xl:block"><Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t("colContent")}</TableHead>
            <TableHead className="w-20 break-keep text-center">{t("colLikes")}</TableHead>
            <TableHead className="w-24 text-center">{t("colComments")}</TableHead>
            <TableHead className="w-24 text-center">{t("colManage")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q, i) => {
            const commentCount = commentCountOverride[q.id] ?? q.comments?.length ?? 0;
            const isExpanded = expandedQuestionId === q.id;

            return (
              <Fragment key={q.id}>
                <TableRow>
                  <TableCell className="text-muted-foreground align-top">{i + 1}</TableCell>
                  <TableCell className="max-w-md align-top">
                    {editingQuestionId === q.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editContent}
                          maxLength={200}
                          rows={3}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="text-sm"
                          autoFocus
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{editContent.length}/200 · {t("reclassifyNote")}</span>
                          <div className="flex gap-1.5">
                            <Button size="sm" onClick={() => saveQuestionEdit(q.id)} disabled={isSavingEdit || !editContent.trim()}>
                              {isSavingEdit ? t("savingEdit") : t("saveEdit")}
                            </Button>
                            <Button size="sm" variant="outline" disabled={isSavingEdit} onClick={() => { setEditingQuestionId(null); setEditContent(""); }}>
                              {tEx("close")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="truncate">{ct.text({ type: "QUESTION", id: q.id }, q.content)}</p>
                    )}
                    {ct.canTranslate && editingQuestionId !== q.id && <TranslateToggle item={{ type: "QUESTION", id: q.id }} ct={ct} className="mt-0.5" />}
                    {/* 분류·공개 배지를 내용 아래에(탐구 탭과 동일 톤) */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded break-keep ${CLOSURE_STYLE[q.closure]}`}>{CLOSURE_LABEL[q.closure]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded break-keep ${COGNITIVE_STYLE[q.cognitive]}`}>{COGNITIVE_LABEL[q.cognitive]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${q.isPublic ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{q.isPublic ? t("public") : t("private")}</span>
                    </div>
                    {/* 수업세션(📚 칩) · 작성일시(🕒) — 한눈에 구분 */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {selectedSessionId === "all" && q.session && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                          <span>📚</span>
                          <span>{buildSessionLabel(q.session.date, q.session.subject, q.session.topic)}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <span>🕒</span>
                        <span>{formatDateTime(q.createdAt)}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-top">
                    {/* 받은 좋아요(읽기 전용) — 탐구 탭과 같은 알약 모양 */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-rose-500">
                      <span>❤️</span>
                      <span>{q.likeCount ?? 0}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-center align-top">
                    {/* 댓글 토글 — 탐구 탭과 동일한 💬 개수 버튼 */}
                    <button
                      type="button"
                      onClick={() => toggleComments(q.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-800"
                    >
                      <span>💬 {commentCount}</span>
                      <span>{isExpanded ? tEx("close") : tEx("comment")}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-center align-top">
                    {/* 관리: 반응(좋아요·댓글)이 달리기 전까지만 수정·삭제 가능 */}
                    {(q.likeCount ?? 0) === 0 && commentCount === 0 ? (
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setEditingQuestionId(q.id); setEditContent(q.content); }}
                          disabled={editingQuestionId === q.id}
                          className="rounded-md border border-indigo-200 p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                          title={t("editBtn")}
                          aria-label={t("editBtn")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(q.id)}
                          className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                          title={t("deleteBtn")}
                          aria-label={t("deleteBtn")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toast({ description: t("lockedHint") })}
                        className="text-sm text-muted-foreground"
                        title={t("lockedHint")}
                        aria-label={t("lockedHint")}
                      >
                        🔒
                      </button>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30 px-6 py-4">
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
      </>
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("intro", { count: questions.length })}
      </p>

      {/* 조회 방법: 날짜·교과·주제로 좁혀 세션 선택 (교사 페이지와 동일) */}
      <Card>
        <CardContent className="pt-4">
          <div className="my-questions-tablet-filters grid grid-cols-1 gap-3 md:grid-cols-[9rem_8rem_minmax(12rem,0.8fr)_minmax(18rem,1fr)] md:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tEx("date")}</label>
              <Select value={filterDate || "__all__"} onValueChange={(v) => setFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-11 bg-background text-sm"><SelectValue placeholder={tEx("allDates")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tEx("allDates")}</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tEx("subject")}</label>
              <Select value={filterSubject || "__all__"} onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-11 bg-background text-sm"><SelectValue placeholder={tEx("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tEx("allSubjects")}</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tEx("topicFilterLabel")}</label>
              <Select value={filterTopic || "__all__"} onValueChange={(v) => setFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-11 bg-background text-sm"><SelectValue placeholder={tEx("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tEx("allTopics")}</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tEx("classSession")}</label>
              <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                <SelectTrigger className="h-11 bg-background font-medium"><SelectValue placeholder={tEx("selectSession")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tEx("allSessions")}</SelectItem>
                  {filteredSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{buildSessionLabel(s.date, s.subject, s.topic)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{tEx("filterHint")}</p>
        </CardContent>
      </Card>

      {sessionProgress.total > 0 && (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-100">
                  {t("sessionProgressTitle")}
                </p>
                <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
                  {t("sessionProgressSummary", {
                    total: sessionProgress.total,
                    completed: sessionProgress.completed,
                    remaining: sessionProgress.remaining,
                  })}
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
                {sessionProgress.percent}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white dark:bg-emerald-950">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${sessionProgress.percent}%` }}
              />
            </div>
            {sessionProgress.remainingSessions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-200">
                <span className="font-semibold">{t("remainingSessionLabel")}</span>
                {sessionProgress.remainingSessions.map((s) => (
                  <span key={s.id} className="rounded-full bg-white px-2 py-1 dark:bg-emerald-950">
                    {buildSessionLabel(s.date, s.subject, s.topic)}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <StudentMyQuestionsSummary
        className="my-questions-tablet-overview md:grid-cols-4 min-h-[96px] md:[&>*:last-child]:hidden"
        totalQuestions={questions.length}
        shownQuestions={displayed.length}
        totalLikes={summaryLikes}
        totalComments={summaryComments}
        sessionPercent={sessionProgress.percent}
        labels={{
          total: t("summaryTotal"),
          shown: t("summaryShown"),
          likes: t("colLikes"),
          comments: t("colComments"),
          progress: t("sessionProgressTitle"),
        }}
      />

      {/* 탐구질문 수업 세션 선택 시 참고자료(접기, 기본 닫힘) */}
      {selectedSessionId !== "all" && <SessionReferencePanel sessionId={selectedSessionId} />}

      {/* 질문 분류 통계 현황 (비율 막대, 표시 전용) */}
      <QuestionClassificationStats questions={filtered} />

      {/* 전체 질문 목록 — 분류 필터(분류1/분류2) + 정렬(좋아요순·댓글순) */}
      <Card>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <CardTitle className="text-base">
                {tEx("listTitle")} <span className="text-sm font-normal text-muted-foreground">{tEx("countItems", { count: displayed.length })}</span>
              </CardTitle>
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full bg-background text-sm md:w-72"
              />
              <TranslateAllButton items={displayed.map((q) => ({ type: "QUESTION" as const, id: q.id }))} ct={ct} />
            </div>
            <div className="shrink-0">
              <QuestionSortControl
                field={sortField}
                dir={sortDir}
                showStudent={false}
                onChange={(f, d) => { setSortField(f); setSortDir(d); }}
              />
            </div>
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
