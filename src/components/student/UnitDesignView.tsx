"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { TranslateAllButton } from "@/components/shared/TranslateAllButton";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildSessionLabel, sortSessionsAsc, sortSessionsDesc, getSessionFilterOptions, filterSessions, groupSessionsByMonth, isSessionAvailable } from "@/lib/sessions";
import { SessionReferencePanel } from "@/components/shared/SessionReferencePanel";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { groupSharedQuestions } from "@/lib/shared-questions";
import { CommentThread } from "@/components/shared/CommentThread";
import { EmptyState } from "@/components/shared/EmptyState";
import { getSessionUser } from "@/lib/auth-helpers";
import { useStudentSessions } from "@/lib/app-queries";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";

interface SharedQuestion {
  type: string;
  content: string;
  contentGroup?: string;
  lessonPhase?: string;
  rationale?: string;
  priority?: number;
  /** 비슷한 질문 묶기로 이 대표 질문에 합쳐진 학생 원본 질문들 */
  mergedFrom?: string[];
}

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher?: { name: string };
  unitDesignId?: string | null;
  sharedQuestions?: SharedQuestion[];
}

interface Published {
  id: string;
  content: string;
  likeCount: number;
  commentCount: number;
  myLike: boolean;
}

const TYPE_STYLE: Record<string, string> = {
  factual: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  conceptual: "bg-violet-50 text-violet-700 border-violet-200",
  controversial: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  student: "bg-muted/40 text-foreground border-border",
};

function LikeButton({
  id, likeCount, myLike, onChange,
}: { id: string; likeCount: number; myLike: boolean; onChange: (count: number, my: boolean) => void }) {
  const [pending, setPending] = useState(false);
  const click = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/questions/${id}/likes`, { method: myLike ? "DELETE" : "POST" });
      if (res.ok) {
        const d = await res.json();
        onChange(typeof d.likeCount === "number" ? d.likeCount : likeCount, !myLike);
      }
    } catch {
      // 무시
    } finally {
      setPending(false);
    }
  };
  return (
    <button
      onClick={click}
      disabled={pending}
      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
        myLike ? "bg-rose-100 text-rose-600 hover:bg-rose-200" : "bg-muted text-muted-foreground hover:bg-rose-50 hover:text-rose-500"
      } ${pending ? "opacity-50" : ""}`}
    >
      <span>{myLike ? "❤️" : "🤍"}</span>
      <span>{likeCount}</span>
    </button>
  );
}

export function UnitDesignView() {
  const t = useTranslations("unitDesign");
  const tEx = useTranslations("explore");
  const tc = useTranslations("common");
  const tSess = useTranslations("sessions");
  const ct = useContentTranslation();
  const { data: authSession } = useSession();
  const user = getSessionUser(authSession);
  const TYPE_KEY: Record<string, string> = {
    factual: "typeFactual",
    conceptual: "typeConceptual",
    controversial: "typeControversial",
    student: "typeStudent",
  };
  const typeLabel = (type: string) => (TYPE_KEY[type] ? t(TYPE_KEY[type]) : type);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupPanelOpen, setGroupPanelOpen] = useState(true);
  // 조회(필터)·검색·정렬 — 목록이 쌓일 때 대비
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");

  const { data: rawSessions = [], isLoading } = useStudentSessions<QuestionSession>({ userId: user.id });
  const sessions = useMemo(
    () => sortSessionsDesc(rawSessions).filter((session) => (session.sharedQuestions?.length ?? 0) > 0),
    [rawSessions],
  );

  // 첫 세션 자동 선택
  useEffect(() => {
    if (!selectedId && sessions.length > 0) setSelectedId(sessions[0].id);
  }, [sessions, selectedId]);

  // 세션 변경 시 펼침 상태 초기화
  useEffect(() => {
    setExpandedId(null);
    setGroupPanelOpen(true);
  }, [selectedId]);

  // 선택 세션의 배포 질문(좋아요·댓글수)과 공개 설정도 주기 폴링(12초)+포커스 재조회.
  const publishedKey = ["unit-design-published", selectedId] as const;
  const { data: pubData } = useQuery<{ published: Published[]; likesVisible: boolean; commentsVisible: boolean }>({
    queryKey: publishedKey,
    queryFn: async () => {
      const r = await fetch(`/api/sessions/${selectedId}/publish-questions`);
      if (!r.ok) throw new Error("배포된 질문을 불러오지 못했습니다");
      return r.json();
    },
    enabled: Boolean(selectedId),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const published: Published[] = useMemo(
    () => (Array.isArray(pubData?.published) ? pubData!.published : []),
    [pubData],
  );
  const likesVisible = pubData?.likesVisible ?? true;
  const commentsVisible = pubData?.commentsVisible ?? true;

  const selectedSession = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;

  // 조회(필터)·검색·정렬 적용 + 진행 중/지난 수업 구분
  const filterOptions = getSessionFilterOptions(sessions);
  const searchLc = search.trim().toLowerCase();
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  }).filter((s) => !searchLc || buildSessionLabel(s.date, s.subject, s.topic).toLowerCase().includes(searchLc));
  const sortedSessions = sort === "asc" ? sortSessionsAsc(filteredSessions) : sortSessionsDesc(filteredSessions);
  const activeSessions = sortedSessions.filter((s) => isSessionAvailable(s.date));
  const pastSessions = sortedSessions.filter((s) => !isSessionAvailable(s.date));
  const activeSessionMonthGroups = groupSessionsByMonth(activeSessions, sort);
  const pastSessionMonthGroups = groupSessionsByMonth(pastSessions, sort);
  const hasFilter = Boolean(filterDate || filterSubject || filterTopic || search.trim());
  const selectedSessionIndex = sortedSessions.findIndex((session) => session.id === selectedSession?.id);
  const fallbackSessionIndex = sessions.findIndex((session) => session.id === selectedSession?.id);
  const selectedSessionPosition = selectedSessionIndex >= 0 ? selectedSessionIndex + 1 : Math.max(fallbackSessionIndex + 1, 1);
  const selectedSessionTotal = sortedSessions.length > 0 ? sortedSessions.length : sessions.length;
  const selectSession = (id: string, scrollToDetail = false) => {
    setSelectedId(id);
    if (!scrollToDetail || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => {
      document.getElementById("unit-design-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const selectSessionByOffset = (offset: -1 | 1) => {
    const next = sortedSessions[selectedSessionIndex + offset];
    if (next) selectSession(next.id);
  };
  const grouped = useMemo(
    () => groupSharedQuestions(selectedSession?.sharedQuestions ?? []).map(
      (g) => [g.group, g.questions] as [string, typeof g.questions],
    ),
    [selectedSession],
  );
  const pubByContent = useMemo(
    () => new Map(published.map((p) => [p.content.trim(), p])),
    [published],
  );

  // 좋아요·댓글수는 캐시에 즉시 반영(다음 폴링에서 서버 값으로 확정)
  const updateLike = (id: string, count: number, my: boolean) =>
    queryClient.setQueryData<{ published: Published[]; likesVisible: boolean; commentsVisible: boolean }>(publishedKey, (prev) =>
      prev ? { ...prev, published: prev.published.map((p) => (p.id === id ? { ...p, likeCount: count, myLike: my } : p)) } : prev,
    );
  const setCommentCount = (id: string, n: number) =>
    queryClient.setQueryData<{ published: Published[]; likesVisible: boolean; commentsVisible: boolean }>(publishedKey, (prev) =>
      prev ? { ...prev, published: prev.published.map((p) => (p.id === id ? { ...p, commentCount: n } : p)) } : prev,
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">{t("loading")}</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon="📚" title={t("emptyTitle")} description={t("emptyDesc")} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card id="unit-design-session-list" className="scroll-mt-20">
            <CardHeader className="pb-3 space-y-3">
              <div>
                <CardTitle className="text-base">{t("listTitle")}</CardTitle>
                <CardDescription>{t("listDesc")}</CardDescription>
              </div>
              {/* 조회(날짜·교과·단원) + 검색 + 정렬(최신순/오래된순) */}
              <div className="space-y-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-8 text-sm"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    [filterDate, setFilterDate, filterOptions.dates, tSess("allDates")],
                    [filterSubject, setFilterSubject, filterOptions.subjects, tSess("allSubjects")],
                    [filterTopic, setFilterTopic, filterOptions.topics, tSess("allTopics")],
                  ] as const).map(([value, setter, options, allLabel], i) => (
                    <select
                      key={i}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    >
                      <option value="">{allLabel}</option>
                      {options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ))}
                  {hasFilter && (
                    <button
                      type="button"
                      onClick={() => { setFilterDate(""); setFilterSubject(""); setFilterTopic(""); setSearch(""); }}
                      className="h-8 px-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {tc("reset")}
                    </button>
                  )}
                  <div className="ml-auto flex rounded-md border overflow-hidden h-8">
                    {(["desc", "asc"] as const).map((v, i) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSort(v)}
                        className={`px-2.5 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${sort === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                      >
                        {v === "desc" ? tSess("sortDesc") : tSess("sortAsc")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
              {sortedSessions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("listNoMatch")}</p>
              ) : (
                ([
                  [t("sectionActive"), activeSessions, activeSessionMonthGroups],
                  [t("sectionPast"), pastSessions, pastSessionMonthGroups],
                ] as const).map(([label, group, monthGroups]) => group.length === 0 ? null : (
                  <section key={label} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">{label} <span className="font-normal">({group.length})</span></p>
                    {monthGroups.map((monthGroup) => (
                      <div key={monthGroup.key} className="space-y-1.5">
                        <p className="border-b pb-1 text-[11px] font-semibold text-muted-foreground">
                          {monthGroup.label} <span className="font-normal">({monthGroup.sessions.length})</span>
                        </p>
                        {monthGroup.sessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => selectSession(session.id, true)}
                            className={`w-full rounded-md border p-3 text-left transition-colors ${
                              selectedSession?.id === session.id ? "border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40" : "bg-card hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                  {buildSessionLabel(session.date, session.subject, session.topic)}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {t("questionCount", { count: session.sharedQuestions?.length ?? 0 })}
                                  {session.teacher?.name ? t("teacherByline", { name: session.teacher.name }) : ""}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </section>
                ))
              )}
            </CardContent>
          </Card>

          <div id="unit-design-detail-panel" className="space-y-6 scroll-mt-20">
            {selectedSession && (
              <div className="tablet-session-toolbar sticky top-3 z-10 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur lg:static lg:shadow-none">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {buildSessionLabel(selectedSession.date, selectedSession.subject, selectedSession.topic)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("sessionPosition", {
                        current: selectedSessionPosition,
                        total: selectedSessionTotal,
                      })}
                      {" · "}
                      {t("questionCount", { count: selectedSession.sharedQuestions?.length ?? 0 })}
                      {selectedSession.teacher?.name ? t("teacherByline", { name: selectedSession.teacher.name }) : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href="#unit-design-session-list"
                      className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {t("backToList")}
                    </a>
                    <button
                      type="button"
                      onClick={() => selectSessionByOffset(-1)}
                      disabled={selectedSessionIndex <= 0}
                      className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("prevSession")}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectSessionByOffset(1)}
                      disabled={selectedSessionIndex < 0 || selectedSessionIndex >= sortedSessions.length - 1}
                      className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("nextSession")}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* 참고자료(접기, 기본 닫힘) */}
            {selectedId && <SessionReferencePanel sessionId={selectedId} />}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {selectedSession
                      ? buildSessionLabel(selectedSession.date, selectedSession.subject, selectedSession.topic)
                      : t("fallbackTitle")}
                  </CardTitle>
                  <TranslateAllButton
                    items={(selectedSession?.sharedQuestions ?? [])
                      .map((q) => pubByContent.get(q.content.trim()))
                      .filter((p): p is NonNullable<typeof p> => Boolean(p))
                      .map((p) => ({ type: "QUESTION" as const, id: p.id }))}
                    ct={ct}
                  />
                </div>
                <CardDescription>{t("detailDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(selectedSession?.sharedQuestions ?? []).map((question, index) => {
                    const pub = pubByContent.get(question.content.trim());
                    return (
                      <div key={`${question.content}-${index}`} className="rounded-lg border bg-white p-3 dark:bg-card">
                        <div className="flex gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${TYPE_STYLE[question.type] ?? TYPE_STYLE.student}`}>
                                {typeLabel(question.type)}
                              </span>
                              {question.contentGroup && (
                                <span className="rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                                  {question.contentGroup}
                                </span>
                              )}
                              {question.lessonPhase && (
                                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                                  {question.lessonPhase}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-foreground">
                              {pub ? ct.text({ type: "QUESTION", id: pub.id }, question.content) : question.content}
                            </p>
                            {ct.canTranslate && pub && <TranslateToggle item={{ type: "QUESTION", id: pub.id }} ct={ct} />}
                            {question.rationale && <p className="text-xs text-muted-foreground">{question.rationale}</p>}
                            {pub && (
                              <div className="flex items-center gap-3 pt-1">
                                {likesVisible && (
                                  <LikeButton
                                    id={pub.id}
                                    likeCount={pub.likeCount}
                                    myLike={pub.myLike}
                                    onChange={(c, m) => updateLike(pub.id, c, m)}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setExpandedId((e) => (e === pub.id ? null : pub.id))}
                                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                >
                                  <span>💬 {pub.commentCount}</span>
                                  <span>{expandedId === pub.id ? t("close") : t("comment")}</span>
                                </button>
                                {/* 교사가 댓글을 비공개로 설정한 경우(친구 댓글 비노출) 안내 배지 */}
                                {!commentsVisible && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                                    title={tEx("commentsHiddenHint")}
                                  >
                                    🔒 {tEx("commentsHidden")}
                                  </span>
                                )}
                              </div>
                            )}
                            {pub && expandedId === pub.id && (
                              <div className="border-t pt-3">
                                <CommentThread questionId={pub.id} onCountChange={(n) => setCommentCount(pub.id, n)} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {grouped.length > 1 && (
              <Card>
                <CardHeader className="pb-3">
                  <button
                    type="button"
                    onClick={() => setGroupPanelOpen((open) => !open)}
                    aria-expanded={groupPanelOpen}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-base font-semibold text-foreground transition-colors hover:bg-muted/50 hover:text-primary"
                  >
                    <span>{t("groupTitle")}</span>
                    <CollapseChevron open={groupPanelOpen} className="shrink-0" />
                  </button>
                  <CardDescription>{t("groupDesc")}</CardDescription>
                </CardHeader>
                {groupPanelOpen && (
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      {grouped.map(([group, questions]) => (
                        <div key={group} className="rounded-lg border bg-white p-3 dark:bg-card">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-foreground">{group}</h3>
                            <span className="text-xs text-muted-foreground">{t("groupCount", { count: questions.length })}</span>
                          </div>
                          <ul className="space-y-1.5 text-xs text-muted-foreground">
                            {questions.map((question, index) => (
                              <li key={`${question.content}-${index}`}>
                                <p className="line-clamp-2 font-medium text-foreground/80">
                                  {question.priority}. {question.content}
                                </p>
                                {/* 이 대표 질문에 묶인 우리(학생들)의 원본 질문 */}
                                {(question.mergedFrom?.length ?? 0) > 1 && (
                                  <ul className="mt-0.5 space-y-0.5 border-l-2 border-emerald-200 pl-2 dark:border-emerald-500/30">
                                    {question.mergedFrom!.map((original, i) => (
                                      <li key={`${original}-${i}`} className="break-words">· {original}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
