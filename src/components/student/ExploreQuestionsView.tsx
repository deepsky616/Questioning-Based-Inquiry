"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QuestionClassificationStats, ClassificationChips, QuestionSortControl, applyClassificationFilter, compareByStudent, type ClosureFilter, type CognitiveFilter, type SortField, type SortDir } from "@/components/shared/QuestionClassificationStats";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { CommentThread } from "@/components/shared/CommentThread";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { formatDateTime } from "@/lib/datetime";

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
  source?: string;
  inquiryType?: string | null;
  author: { id: string; name: string; className?: string; grade?: string; studentNumber?: string };
  createdAt: string;
  likeCount: number;
  commentCount?: number;
  myLike: boolean;
  likesVisibleToPeers?: boolean;
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
  const t = useTranslations("explore");
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
      title={isSelf ? t("likeSelfDisabled") : myLike ? t("unlike") : t("like")}
      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
        myLike
          ? "bg-rose-100 text-rose-600 hover:bg-rose-200"
          : isSelf
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-muted text-muted-foreground hover:bg-rose-50 hover:text-rose-500"
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
  ct,
}: {
  q: Question;
  onLikeChange: (questionId: string, newCount: number, myLike: boolean) => void;
  likesEnabled: boolean;
  commentsEnabled: boolean;
  ct: ReturnType<typeof useContentTranslation>;
}) {
  const t = useTranslations("explore");
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(q.commentCount ?? 0);
  const isTeacherShared = q.source === "TEACHER_SHARED";

  return (
    <div
      className={
        isTeacherShared
          ? "rounded-lg border-2 border-indigo-300 overflow-hidden bg-gradient-to-br from-indigo-50/60 to-white dark:bg-none dark:bg-card"
          : "rounded-lg border border-border overflow-hidden"
      }
    >
      <div
        className={
          isTeacherShared
            ? "p-4 bg-indigo-50 dark:bg-indigo-950/40/30 flex justify-between items-start gap-4"
            : "p-4 bg-muted/40 flex justify-between items-start gap-4"
        }
      >
        <div className="flex-1 min-w-0">
          {/* 출처 배지 */}
          <div className="flex gap-2 mb-2 flex-wrap items-center">
            {isTeacherShared ? (
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                {t("unitDesignBadge")}
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/30">
                {t("studentBadge")}
              </span>
            )}
            {isTeacherShared && q.inquiryType && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white text-indigo-600 border border-indigo-200">
                {q.inquiryType}
              </span>
            )}
          </div>
          <p className={isTeacherShared ? "text-foreground font-medium" : "text-foreground"}>
            {ct.text({ type: "QUESTION", id: q.id }, q.content)}
          </p>
          {ct.canTranslate && (
            <div className="mt-1">
              <TranslateToggle item={{ type: "QUESTION", id: q.id }} ct={ct} />
            </div>
          )}
          {isTeacherShared && commentsEnabled && (
            <div className="mt-2 rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              {t.rich("teacherInquiryNotice", { b: (chunks) => <b>{chunks}</b> })}
            </div>
          )}
          <div className="flex gap-2 mt-2 flex-wrap items-center">
            <span className={`text-xs px-2 py-1 rounded break-keep ${CLOSURE_STYLE[q.closure]}`}>
              {CLOSURE_LABEL[q.closure]}
            </span>
            <span className={`text-xs px-2 py-1 rounded break-keep ${COGNITIVE_STYLE[q.cognitive]}`}>
              {COGNITIVE_LABEL[q.cognitive]}
            </span>
            {likesEnabled && q.likesVisibleToPeers !== false && (
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
            <div className="text-sm text-muted-foreground">
              {isTeacherShared ? t("teacherName", { name: q.author.name }) : q.author.name}
            </div>
            {!isTeacherShared && (q.author.grade || q.author.className || q.author.studentNumber) && (
              <div className="text-xs text-muted-foreground">
                {[
                  q.author.grade && t("gradeLabel", { grade: q.author.grade }),
                  q.author.className && t("classLabel", { className: q.author.className }),
                  q.author.studentNumber && t("numberLabel", { studentNumber: q.author.studentNumber }),
                ].filter(Boolean).join(" ")}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">{formatDateTime(q.createdAt)}</div>
          </div>
          {commentsEnabled && (
            <button
              onClick={() => setShowComments((v) => !v)}
              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                isTeacherShared && !showComments
                  ? "rounded-full bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-700"
                  : "text-indigo-600 hover:text-indigo-800"
              }`}
            >
              <span>💬 {commentCount}</span>
              <span>{showComments ? t("close") : isTeacherShared ? t("answer") : t("comment")}</span>
            </button>
          )}
        </div>
      </div>
      {commentsEnabled && showComments && (
        <div className="border-t border-border bg-white px-4 pt-3 pb-4 dark:bg-card">
          <CommentThread questionId={q.id} onCountChange={setCommentCount} />
        </div>
      )}
    </div>
  );
}

export function ExploreQuestionsView() {
  const t = useTranslations("explore");
  const tT = useTranslations("translate");
  const ct = useContentTranslation();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");
  const [sortField, setSortField] = useState<SortField>("like");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // 좋아요·댓글 사용 여부는 수업세션/질문 단위 공개 설정으로 제어한다(전역 explore 설정 폐지)
  const exploreCfg = { likesEnabled: true, commentsEnabled: true };
  const [filterClosure, setFilterClosure] = useState<ClosureFilter>("all");
  const [filterCognitive, setFilterCognitive] = useState<CognitiveFilter>("all");

  const fetchQuestions = useCallback(
    (sessionId: string, opts?: { date?: string; subject?: string; topic?: string }) => {
      setIsLoading(true);
      const params = new URLSearchParams({ isPublic: "true" });
      if (sessionId !== "all") params.set("sessionId", sessionId);
      if (opts?.date) params.set("date", opts.date);
      if (opts?.subject) params.set("subject", opts.subject);
      if (opts?.topic) params.set("topic", opts.topic);
      fetch(`/api/questions?${params}`)
        .then((r) => r.json())
        .then(setQuestions)
        .catch(() => {})
        .finally(() => setIsLoading(false));
    },
    []
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

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
    fetchQuestions(val);
  };

  // 날짜·교과·주제로 세션 목록을 좁힌다(세션을 고르는 보조 필터, 교사 페이지와 동일)
  const filterOptions = getSessionFilterOptions(sessions);
  // 탐구질문에서 생성한 수업세션(unitDesignId)은 전체 질문탐구에서 제외(수업 탐구 질문 탭에서만 다룸)
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  }).filter((s) => !s.unitDesignId);

  // 필터로 선택 세션이 목록 밖이 되면 전체로 보정
  useEffect(() => {
    if (selectedSessionId === "all") return;
    if (!filteredSessions.some((s) => s.id === selectedSessionId)) {
      handleSessionChange("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterSubject, filterTopic]);

  // 배포된 탐구 질문(TEACHER_SHARED)은 학생 탐구설계 화면에서만 다루므로 질문탐구 목록에서는 제외한다
  const sortKey = (q: Question) => (sortField === "like" ? q.likeCount ?? 0 : q.commentCount ?? 0);
  const filtered = questions
    .filter(
      (q) =>
        q.source !== "TEACHER_SHARED" &&
        (q.content.toLowerCase().includes(search.toLowerCase()) ||
          q.author.name.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortField === "student") {
        const c = compareByStudent(a.author, b.author);
        return sortDir === "asc" ? c : -c;
      }
      return sortDir === "desc" ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b);
    });
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);

  const displayed = applyClassificationFilter(filtered, filterClosure, filterCognitive);

  const Empty = () => (
    <EmptyState icon="🔍" title={search ? t("emptySearch") : t("emptyNone")} description={t("emptyDesc")} />
  );

  const QuestionList = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <Empty />
    ) : (
      <div className="space-y-3 mt-3">
        {list.map((q) => (
          <QuestionCard key={q.id} q={q} onLikeChange={handleLikeChange}
            likesEnabled={exploreCfg.likesEnabled} commentsEnabled={exploreCfg.commentsEnabled} ct={ct} />
        ))}
      </div>
    );

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("intro", { count: questions.length })}
      </p>

      {/* 조회 방법: 날짜·교과·주제로 좁혀 세션 선택 (교사 페이지와 동일) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("filterHeader")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-36">
              <label className="text-xs font-medium text-muted-foreground">{t("date")}</label>
              <Select value={filterDate || "__all__"} onValueChange={(v) => setFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder={t("allDates")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allDates")}</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label className="text-xs font-medium text-muted-foreground">{t("subject")}</label>
              <Select value={filterSubject || "__all__"} onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder={t("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allSubjects")}</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-medium text-muted-foreground">{t("topic")}</label>
              <Select value={filterTopic || "__all__"} onValueChange={(v) => setFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder={t("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("allTopics")}</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs font-medium text-muted-foreground">{t("classSession")}</label>
              <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                <SelectTrigger className="bg-background font-medium"><SelectValue placeholder={t("selectSession")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allSessions")}</SelectItem>
                  {filteredSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{buildSessionLabel(s.date, s.subject, s.topic)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t("filterHint")}</p>
        </CardContent>
      </Card>

      {selectedSession?.unitDesignId && (
        <InquiryFlowGraph
          title={t("flowTitle")}
          description={t("flowDesc")}
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

      {/* 질문 분류 통계 현황 (비율 막대, 표시 전용) */}
      <QuestionClassificationStats questions={filtered} />

      {/* 전체 질문 목록 — 분류 필터(분류1/분류2) + 정렬(좋아요순·댓글순) */}
      <Card>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-base">
                {t("listTitle")}{" "}
                <span className="text-sm font-normal text-muted-foreground">{t("countItems", { count: displayed.length })}</span>
              </CardTitle>
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm w-56 bg-background"
              />
              {ct.canTranslate && displayed.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    ct.anyShown
                      ? ct.showAllOriginal()
                      : ct.translateAll(displayed.map((q) => ({ type: "QUESTION", id: q.id })))
                  }
                  className="h-8 rounded-md border border-indigo-200 px-3 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  {ct.anyShown ? tT("showAllOriginal") : tT("translateAll")}
                </button>
              )}
            </div>
            <QuestionSortControl
              field={sortField}
              dir={sortDir}
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
          <QuestionList list={displayed} />
        </CardContent>
      </Card>
    </div>
  );
}
