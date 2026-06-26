"use client";

import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [commentCountOverride, setCommentCountOverride] = useState<Record<string, number>>({});

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
      if (!res.ok) throw new Error("failed to load questions");
      return res.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user.id) return;
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => setSessions(sortSessionsDesc(data)))
      .catch(() => {});
  }, [user.id]);

  const handleSessionChange = (val: string) => {
    setSelectedSessionId(val);
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

  const QuestionRows = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <EmptyState icon="📝" title={t("empty")} description={t("emptyDesc")} />
    ) : (
      <div className="overflow-x-auto"><Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t("colContent")}</TableHead>
            <TableHead className="w-20 break-keep text-center">{t("colLikes")}</TableHead>
            <TableHead className="w-24 text-center">{t("colComments")}</TableHead>
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
                    <p className="truncate">{ct.text({ type: "QUESTION", id: q.id }, q.content)}</p>
                    {ct.canTranslate && <TranslateToggle item={{ type: "QUESTION", id: q.id }} ct={ct} className="mt-0.5" />}
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
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={4} className="bg-muted/30 px-6 py-4">
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
        {t("intro", { count: questions.length })}
      </p>

      {/* 조회 방법: 날짜·교과·주제로 좁혀 세션 선택 (교사 페이지와 동일) */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-36">
              <label className="text-xs font-medium text-muted-foreground">{tEx("date")}</label>
              <Select value={filterDate || "__all__"} onValueChange={(v) => setFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder={tEx("allDates")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tEx("allDates")}</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-32">
              <label className="text-xs font-medium text-muted-foreground">{tEx("subject")}</label>
              <Select value={filterSubject || "__all__"} onValueChange={(v) => setFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder={tEx("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tEx("allSubjects")}</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-52">
              <label className="text-xs font-medium text-muted-foreground">{tEx("topic")}</label>
              <Select value={filterTopic || "__all__"} onValueChange={(v) => setFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-background"><SelectValue placeholder={tEx("all")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tEx("allTopics")}</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <label className="text-xs font-medium text-muted-foreground">{tEx("classSession")}</label>
              <Select value={selectedSessionId} onValueChange={handleSessionChange}>
                <SelectTrigger className="bg-background font-medium"><SelectValue placeholder={tEx("selectSession")} /></SelectTrigger>
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

      {/* 질문 분류 통계 현황 (비율 막대, 표시 전용) */}
      <QuestionClassificationStats questions={filtered} />

      {/* 전체 질문 목록 — 분류 필터(분류1/분류2) + 정렬(좋아요순·댓글순) */}
      <Card>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-base">
                {tEx("listTitle")} <span className="text-sm font-normal text-muted-foreground">{tEx("countItems", { count: displayed.length })}</span>
              </CardTitle>
              <Input
                placeholder={t("searchPlaceholder")}
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
