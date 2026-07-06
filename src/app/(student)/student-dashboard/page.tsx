"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { StudentReportView } from "@/components/reports/StudentReportView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatBar } from "@/components/shared/StatBar";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { getSessionUser } from "@/lib/auth-helpers";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE, matchesCognitiveCategory } from "@/lib/question-labels";
import PointsCard from "@/components/shared/PointsCard";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";
import { EmptyState } from "@/components/shared/EmptyState";
import { isSessionAvailable } from "@/lib/sessions";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  createdAt: string;
  sessionId?: string | null;
  commentCount?: number;
  comments?: unknown[];
}

interface Stats {
  total: number;
  byClosure: { closed: number; open: number };
  byCognitive: { factual: number; conceptual: number; controversial: number };
}

interface StudentSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  sharedQuestions?: Array<{ content: string }>;
}

interface PointLog {
  id: string;
  createdAt: string;
}

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  sessionId: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
}

interface NotificationResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

function metadataText(metadata: unknown, key: "teacherName" | "sessionTitle"): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export default function StudentDashboardPage() {
  // useSearchParams(탭 쿼리)는 Suspense 경계가 필요하다
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <StudentDashboard />
    </Suspense>
  );
}

function StudentDashboard() {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const queryClient = useQueryClient();
  const tCls = useTranslations("classification");
  const t = useTranslations("studentDash");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const pointsSectionRef = useRef<HTMLDivElement | null>(null);
  const [highlightPoints, setHighlightPoints] = useState(false);
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "reports" ? "reports" : "overview";
  const setTab = (v: "overview" | "reports") =>
    router.replace(v === "reports" ? "/student-dashboard?tab=reports" : "/student-dashboard", { scroll: false });
  // 내 질문/통계는 react-query로 주기 폴링(12초)+포커스 재조회.
  const { data: allQuestions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["student-dashboard-questions", user.id],
    queryFn: async () => {
      const r = await fetch(`/api/questions?authorId=${user.id}`);
      if (!r.ok) throw new Error("failed to load questions");
      return r.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });
  const { data: sessions = [] } = useQuery<StudentSession[]>({
    queryKey: ["student-dashboard-sessions", user.id],
    queryFn: async () => {
      const r = await fetch("/api/sessions");
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(user.id),
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });
  const { data: pointData } = useQuery<{ recent: PointLog[] }>({
    queryKey: ["student-dashboard-points", user.id],
    queryFn: async () => {
      const r = await fetch("/api/points/me");
      if (!r.ok) return { recent: [] };
      return r.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });
  const { data: notificationData } = useQuery<NotificationResponse>({
    queryKey: ["student-notifications"],
    queryFn: async () => {
      const r = await fetch("/api/notifications");
      if (!r.ok) return { notifications: [], unreadCount: 0 };
      return r.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

  const questions = allQuestions.slice(0, 5);
  const stats: Stats = {
    total: allQuestions.length,
    byClosure: {
      closed: allQuestions.filter((q) => q.closure === "closed").length,
      open: allQuestions.filter((q) => q.closure === "open").length,
    },
    byCognitive: {
      factual: allQuestions.filter((q) => matchesCognitiveCategory(q.cognitive, "factual")).length,
      conceptual: allQuestions.filter((q) => matchesCognitiveCategory(q.cognitive, "conceptual")).length,
      controversial: allQuestions.filter((q) => matchesCognitiveCategory(q.cognitive, "controversial")).length,
    },
  };
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const questionSessionIds = useMemo(
    () => new Set(allQuestions.map((question) => question.sessionId).filter(Boolean)),
    [allQuestions],
  );
  const todaySessions = sessions.filter((item) => item.date === todayStr);
  const futureSessions = sessions.filter((item) => item.date > todayStr);
  const pastSessions = sessions.filter((item) => item.date < todayStr);
  const todayUnaskedSessionCount = todaySessions.filter((item) => !questionSessionIds.has(item.id)).length;
  const futureUnaskedSessionCount = futureSessions.filter((item) => !questionSessionIds.has(item.id)).length;
  const pastUnaskedSessionCount = pastSessions.filter((item) => !questionSessionIds.has(item.id)).length;
  const todayAskedSessionCount = todaySessions.length - todayUnaskedSessionCount;
  const futureAskedSessionCount = futureSessions.length - futureUnaskedSessionCount;
  const pastAskedSessionCount = pastSessions.length - pastUnaskedSessionCount;
  const activeSessions = sessions.filter((item) => isSessionAvailable(item.date));
  const sharedQuestionSessionCount = activeSessions.filter((item) => (item.sharedQuestions?.length ?? 0) > 0).length;
  const commentedQuestionCount = allQuestions.filter((question) => (question.commentCount ?? question.comments?.length ?? 0) > 0).length;
  const recentPointCount = (pointData?.recent ?? []).filter((log) => {
    const time = new Date(log.createdAt).getTime();
    if (Number.isNaN(time)) return false;
    return Date.now() - time <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const teacherRequestNotifications = (notificationData?.notifications ?? []).filter(
    (item) =>
      item.type === "SESSION_REMINDER" &&
      !item.readAt &&
      (!item.sessionId || !questionSessionIds.has(item.sessionId)),
  );
  const visibleTeacherRequests = teacherRequestNotifications.slice(0, 3);
  const markNotificationRead = async (id: string) => {
    queryClient.setQueryData<NotificationResponse>(["student-notifications"], (prev) => {
      if (!prev) return prev;
      const wasUnread = prev.notifications.some((item) => item.id === id && !item.readAt);
      return {
        unreadCount: wasUnread ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount,
        notifications: prev.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
        ),
      };
    });
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => null);
  };
  const taskItems = [
    {
      key: "todayUnasked",
      title: t("taskTodayQuestionTitle"),
      description: t("taskTodayQuestionDesc"),
      count: todayUnaskedSessionCount,
      progress: {
        total: todaySessions.length,
        completed: todayAskedSessionCount,
        remaining: todayUnaskedSessionCount,
      },
      action: t("taskAsk"),
      href: "/student-ask?task=today-unasked",
      activeClass: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200",
    },
    {
      key: "futureUnasked",
      title: t("taskFutureQuestionTitle"),
      description: t("taskFutureQuestionDesc"),
      count: futureUnaskedSessionCount,
      progress: {
        total: futureSessions.length,
        completed: futureAskedSessionCount,
        remaining: futureUnaskedSessionCount,
      },
      action: t("taskAsk"),
      href: "/student-ask?task=future-unasked",
      activeClass: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200",
    },
    {
      key: "pastUnasked",
      title: t("taskPastQuestionTitle"),
      description: t("taskPastQuestionDesc"),
      count: pastUnaskedSessionCount,
      progress: {
        total: pastSessions.length,
        completed: pastAskedSessionCount,
        remaining: pastUnaskedSessionCount,
      },
      action: t("taskAsk"),
      href: "/student-ask?task=past-unasked",
      activeClass: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200",
    },
    {
      key: "shared",
      title: t("taskSharedTitle"),
      description: t("taskSharedDesc"),
      count: sharedQuestionSessionCount,
      action: t("taskAsk"),
      href: "/student-ask?task=shared",
      activeClass: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-500/30 dark:bg-purple-950/30 dark:text-purple-200",
    },
    {
      key: "comments",
      title: t("taskCommentsTitle"),
      description: t("taskCommentsDesc"),
      count: commentedQuestionCount,
      action: t("taskOpenQuestions"),
      href: "/student-questions",
      activeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200",
    },
    {
      key: "points",
      title: t("taskPointsTitle"),
      description: t("taskPointsDesc"),
      count: recentPointCount,
      action: t("taskCheckPoints"),
      href: "#points",
      activeClass: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200",
    },
  ];
  const hasStudentTasks = teacherRequestNotifications.length > 0 || taskItems.some((item) => item.count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {t("greeting", { name: user.name ?? "" })}
        </h2>
        <p className="text-muted-foreground">{t("greetingSub")}</p>
      </div>

      {/* 개요 / 상세 리포트 탭 */}
      <div className="flex w-fit rounded-md border overflow-hidden">
        {(["overview", "reports"] as const).map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
              tab === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {v === "overview" ? tDash("tabOverview") : tDash("tabReports")}
          </button>
        ))}
      </div>

      {tab === "reports" ? (
        <StudentReportView />
      ) : (
      <>
      {/* 포인트 카드 */}
      <div
        ref={pointsSectionRef}
        className={`scroll-mt-24 rounded-2xl transition-shadow ${
          highlightPoints ? "shadow-[0_0_0_3px_rgba(245,158,11,0.55)]" : ""
        }`}
      >
        <PointsCard />
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
      {/* 내가 할 일 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t("todayTasksTitle")}</CardTitle>
              <CardDescription>{t("todayTasksDesc")}</CardDescription>
            </div>
            {!hasStudentTasks && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                {t("taskDone")}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {visibleTeacherRequests.length > 0 && (
            <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 dark:border-indigo-500/30 dark:bg-indigo-950/30">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-200">{t("taskTeacherRequestTitle")}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-background/70 dark:text-indigo-200">
                  {teacherRequestNotifications.length}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {visibleTeacherRequests.map((item) => {
                  const sessionTitle = metadataText(item.metadata, "sessionTitle");
                  const teacherName = metadataText(item.metadata, "teacherName");
                  const label = sessionTitle
                    ? t("taskTeacherRequestDescWithSession", { teacherName, sessionTitle })
                    : item.message || item.title;
                  const href = item.href ?? "/student-ask";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={async () => {
                        await markNotificationRead(item.id);
                        router.push(href);
                      }}
                      className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-background/80 dark:hover:bg-indigo-950/50"
                    >
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-200">{t("taskAsk")}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {taskItems.map((item) => {
              const active = item.count > 0;
              const progressPercent = item.progress && item.progress.total > 0
                ? Math.round((item.progress.completed / item.progress.total) * 100)
                : 0;
              const handleTaskClick = () => {
                if (item.key === "points") {
                  pointsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setHighlightPoints(true);
                  window.setTimeout(() => setHighlightPoints(false), 1600);
                  return;
                }
                router.push(item.href);
              };
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={handleTaskClick}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    active
                      ? item.activeClass
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-5">{item.description}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${
                      active ? "bg-white/80 text-foreground dark:bg-background/70" : "bg-background text-muted-foreground"
                    }`}>
                      {item.count}
                    </span>
                  </div>
                  {item.progress && item.progress.total > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium">
                        <span>
                          {t("taskSessionProgress", {
                            total: item.progress.total,
                            completed: item.progress.completed,
                            remaining: item.progress.remaining,
                          })}
                        </span>
                        <span>{progressPercent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-background/50">
                        <div
                          className="h-full rounded-full bg-current opacity-70 transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs font-semibold">{item.action}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 총 질문 수 */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{t("totalQuestions")}</p>
          <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
        </CardContent>
      </Card>

      {/* 분류 1 · 닫힌 질문 / 열린 질문 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tCls("card1")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <ClassificationDonut
              slices={[
                { name: tCls("closed.label"), value: stats.byClosure.closed, fill: "#3b82f6" },
                { name: tCls("open.label"), value: stats.byClosure.open, fill: "#22c55e" },
              ]}
            />
            <div className="grid grid-cols-2 gap-6 flex-1 w-full">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("closed.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">{stats.byClosure.closed}</span>
                </div>
                <StatBar value={stats.byClosure.closed} total={stats.total} color="bg-blue-500" />
                <p className="text-xs text-muted-foreground">{tCls("closed.desc")}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("open.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">{stats.byClosure.open}</span>
                </div>
                <StatBar value={stats.byClosure.open} total={stats.total} color="bg-green-500" />
                <p className="text-xs text-muted-foreground">{tCls("open.desc")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 분류 2 · 사실적 / 개념적 / 논쟁적 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tCls("card2")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <ClassificationDonut
              slices={[
                { name: tCls("factual.label"), value: stats.byCognitive.factual, fill: "#94a3b8" },
                { name: tCls("conceptual.label"), value: stats.byCognitive.conceptual, fill: "#a855f7" },
                { name: tCls("controversial.label"), value: stats.byCognitive.controversial, fill: "#f97316" },
              ]}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 w-full">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("factual.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">{stats.byCognitive.factual}</span>
                </div>
                <StatBar value={stats.byCognitive.factual} total={stats.total} color="bg-gray-400" />
                <p className="text-xs text-muted-foreground">{tCls("factual.desc")}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("conceptual.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-purple-600">{stats.byCognitive.conceptual}</span>
                </div>
                <StatBar value={stats.byCognitive.conceptual} total={stats.total} color="bg-purple-500" />
                <p className="text-xs text-muted-foreground">{tCls("conceptual.desc")}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("controversial.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-orange-600">{stats.byCognitive.controversial}</span>
                </div>
                <StatBar value={stats.byCognitive.controversial} total={stats.total} color="bg-orange-500" />
                <p className="text-xs text-muted-foreground">{tCls("controversial.desc")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 최근 질문 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recentTitle")}</CardTitle>
          <CardDescription>{t("recentDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <EmptyState icon="✏️" title={t("empty")} description={t("emptyDesc")} />
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className="p-4 bg-muted/40 rounded-lg">
                  <p className="text-foreground line-clamp-1">{q.content}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded break-keep text-center ${CLOSURE_STYLE[q.closure]}`}>
                      {CLOSURE_LABEL[q.closure]}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded break-keep text-center ${COGNITIVE_STYLE[q.cognitive]}`}>
                      {COGNITIVE_LABEL[q.cognitive]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link href="/student-questions">
              <Button variant="outline">{t("viewAll")}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 순위 (개인: 우리반/교내/전체 · 반: 교내/전체) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StudentRankPanel highlightSelf />
        <ClassRankingPanel highlightSelf defaultScope="school" />
      </div>
        </>
      )}
      </>
      )}
    </div>
  );
}
