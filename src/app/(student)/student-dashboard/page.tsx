"use client";

import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { getSessionUser } from "@/lib/auth-helpers";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";
import PointsCard from "@/components/shared/PointsCard";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  appNotificationQueryKeys,
  useAppNotifications,
} from "@/lib/app-notifications";
import { useStudentSessions } from "@/lib/app-queries";
import {
  buildStudentPriorityCounts,
  isDashboardActionableSessionDate,
  selectActionableSessionReminders,
} from "@/lib/dashboard-priority-tasks";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";
import { StudentDashboardTasksCard, type StudentDashboardTaskItem } from "./StudentDashboardTasksCard";
import {
  buildDashboardQuestionClassSchedule,
  localDateKey,
} from "@/lib/dashboard-question-class-schedule";
import { isValidSessionDateString } from "@/lib/sessions";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  createdAt: string;
}

interface Stats {
  total: number;
  byClosure: { closed: number; open: number };
  byCognitive: { factual: number; conceptual: number; controversial: number };
}

interface StudentDashboardQuestionData {
  recent: Question[];
  stats: Stats;
  answeredSessionIds: string[];
}

const EMPTY_STATS: Stats = {
  total: 0,
  byClosure: { closed: 0, open: 0 },
  byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
};

interface StudentSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  isActive?: boolean;
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
  const tCls = useTranslations("classification");
  const t = useTranslations("studentDash");
  const tPages = useTranslations("pages");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "reports" ? "reports" : "overview";
  // 내 질문/통계는 react-query로 주기 폴링(12초)+포커스 재조회.
  const questionsQuery = useQuery<StudentDashboardQuestionData>({
    queryKey: ["student-dashboard-questions", user.id],
    queryFn: async () => {
      const r = await fetch("/api/questions?view=dashboard");
      if (!r.ok) throw new Error("질문을 불러오지 못했습니다");
      return r.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const { data: questionData, isLoading } = questionsQuery;
  const sessionsQuery = useStudentSessions<StudentSession>({ userId: user.id });
  const { data: sessions = [] } = sessionsQuery;
  const notificationQuery = useAppNotifications({
    queryKey: appNotificationQueryKeys.student,
    enabled: Boolean(user.id),
  });
  const { notifications, markRead: markNotificationRead } = notificationQuery;

  const questions = questionData?.recent ?? [];
  const stats = questionData?.stats ?? EMPTY_STATS;
  const todayStr = localDateKey();
  const questionSessionIds = useMemo(
    () => new Set(
      questionData?.answeredSessionIds ?? [],
    ),
    [questionData?.answeredSessionIds],
  );
  const availableSessionIds = useMemo(
    () => new Set(
      sessions
        .filter((item) => item.isActive !== false)
        .map((item) => item.id),
    ),
    [sessions],
  );
  const studentSchedule = useMemo(
    () =>
      buildDashboardQuestionClassSchedule({
        sessions,
        today: todayStr,
        completedSessionIds: questionSessionIds,
      }),
    [questionSessionIds, sessions, todayStr],
  );
  const todaySessions = sessions.filter(
    (item) => item.isActive !== false && item.date === todayStr,
  );
  const pastSessions = sessions.filter(
    (item) =>
      item.isActive !== false &&
      isValidSessionDateString(item.date) &&
      item.date < todayStr &&
      isDashboardActionableSessionDate(item.date, todayStr),
  );
  const todayUnaskedSessionIds = todaySessions
    .filter((item) => !questionSessionIds.has(item.id))
    .map((item) => item.id);
  const pastUnaskedSessionIds = pastSessions
    .filter((item) => !questionSessionIds.has(item.id))
    .map((item) => item.id);
  const reminderCandidates = notificationQuery.data?.unreadSessionReminders
    ?? notifications.filter(
      (item) => item.type === "SESSION_REMINDER" && !item.readAt,
    );
  const teacherRequestNotifications = selectActionableSessionReminders({
    reminders: reminderCandidates,
    availableSessionIds,
    completedSessionIds: questionSessionIds,
  });
  const teacherRequestGroups = Array.from(
    teacherRequestNotifications.reduce((groups, item) => {
      const key = item.sessionId ?? item.id;
      groups.set(key, [...(groups.get(key) ?? []), item]);
      return groups;
    }, new Map<string, typeof teacherRequestNotifications>()),
    ([, group]) => group,
  );
  const firstTeacherRequestGroup = teacherRequestGroups[0] ?? [];
  const firstTeacherRequest = firstTeacherRequestGroup[0];
  const scheduleStatus: "loading" | "ready" | "error" =
    questionsQuery.isError || sessionsQuery.isError
      ? "error"
      : questionsQuery.isSuccess && sessionsQuery.isSuccess
        ? "ready"
        : "loading";
  const studentScheduleItem = (() => {
    const scheduleSession = studentSchedule.primarySession;
    if (!scheduleSession || !studentSchedule.date || studentSchedule.kind === "empty") return null;
    const [year, month, day] = studentSchedule.date.split("-");
    const sessionTitle = [scheduleSession.subject.trim(), scheduleSession.topic.trim()]
      .filter(Boolean)
      .join(" · ");
    const dateLabel = t("scheduleDate", {
      year: Number(year),
      month: Number(month),
      day: Number(day),
    });
    const countLabel = studentSchedule.kind === "today"
      ? (studentSchedule.needsQuestionCount ?? 0) > 0
        ? t("scheduleNeedsQuestion", { count: studentSchedule.needsQuestionCount ?? 0 })
        : t("scheduleQuestionsComplete")
      : t("taskClassCount", { count: studentSchedule.totalCount });

    return {
      id: scheduleSession.id,
      label: studentSchedule.kind === "today"
        ? t("scheduleTodayTitle")
        : t("scheduleUpcomingTitle"),
      countLabel,
      detail: studentSchedule.kind === "today"
        ? sessionTitle
        : `${dateLabel} · ${sessionTitle}`,
      href: `/student-ask?sessionId=${encodeURIComponent(scheduleSession.id)}`,
    };
  })();
  const studentScheduleChoices = studentSchedule.selectableSessions.map((session) => ({
    id: session.id,
    label: session.subject.trim() || t("scheduleTodayTitle"),
    countLabel: questionSessionIds.has(session.id)
      ? t("scheduleQuestionComplete")
      : t("scheduleQuestionNeeded"),
    detail: session.topic.trim(),
    href: `/student-ask?sessionId=${encodeURIComponent(session.id)}`,
  }));
  const taskStatus: "loading" | "ready" | "error" =
    questionsQuery.isError || sessionsQuery.isError || notificationQuery.isError
      ? "error"
      : questionsQuery.isSuccess && sessionsQuery.isSuccess && notificationQuery.isSuccess
        ? "ready"
        : "loading";
  const taskCounts = taskStatus === "ready"
    ? buildStudentPriorityCounts({
        teacherRequests: teacherRequestNotifications,
        todayUnaskedSessionIds,
        pastUnaskedSessionIds,
      })
    : [];
  const taskItems: StudentDashboardTaskItem[] = taskCounts.map((item) => {
    if (item.key === "teacherRequest") {
      return {
        key: item.key,
        label: t("taskTeacherRequestTitle"),
        countLabel: t("taskClassCount", { count: item.count }),
        href: firstTeacherRequest?.href ?? "/student-ask",
      };
    }
    return {
      key: item.key,
      label: t("taskPastQuestionTitle"),
      countLabel: t("taskClassCount", { count: item.count }),
      href: "/student-ask?task=past-unasked",
    };
  });
  const openTask = async (item: StudentDashboardTaskItem) => {
    if (item.key === "teacherRequest" && firstTeacherRequest) {
      await Promise.all(
        firstTeacherRequestGroup.map((item) => markNotificationRead(item.id)),
      );
      router.push(firstTeacherRequest.href ?? `/student-ask${firstTeacherRequest.sessionId ? `?sessionId=${firstTeacherRequest.sessionId}` : ""}`);
      return;
    }
    router.push(item.href);
  };
  const retryTasks = () => {
    void Promise.all([
      questionsQuery.refetch(),
      sessionsQuery.refetch(),
      notificationQuery.refetch(),
    ]);
  };

  return (
    <div className="space-y-6">
      {tab === "reports" ? (
        <PageHeader title={tPages("studentReports.title")} description={tPages("studentReports.description")} />
      ) : (
        <PageHeader title={tPages("studentDashboard.title")} description={tPages("studentDashboard.description")} />
      )}

      {tab === "reports" ? (
        <StudentReportView />
      ) : (
        <>
          <div className="student-dashboard-tablet-overview">
            {/* 포인트 카드 */}
            <div className="student-dashboard-points-panel flex flex-col gap-4">
              <div className="min-h-0 flex-1">
                <PointsCard />
              </div>
              <StudentDashboardTasksCard
                status={taskStatus}
                taskItems={taskItems}
                onTaskClick={openTask}
                onRetry={retryTasks}
                schedule={{
                  status: scheduleStatus,
                  item: studentScheduleItem,
                  choices: studentScheduleChoices,
                  onSelect: (item) => router.push(item.href),
                  onRetry: () => {
                    void Promise.all([
                      questionsQuery.refetch(),
                      sessionsQuery.refetch(),
                    ]);
                  },
                  labels: {
                    empty: t("scheduleEmpty"),
                    loading: t("scheduleLoading"),
                    error: t("scheduleLoadError"),
                    retry: t("scheduleRetry"),
                    expand: t("scheduleExpand"),
                    collapse: t("scheduleCollapse"),
                  },
                }}
              />
              <Card className="student-dashboard-question-summary border-indigo-100 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-950/20">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-200">{t("totalQuestions")}</p>
                    <p className="mt-0.5 text-3xl font-black text-foreground">{isLoading ? "..." : stats.total}</p>
                  </div>
                  <Link
                    href="/student-questions"
                    className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-background/70 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
                  >
                    {t("viewAll")}
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>

      {isLoading && <DashboardSkeleton />}

      {!isLoading && (
        <>
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
                <div key={q.id} className="rounded-lg bg-muted/40 p-4">
                  <p className="line-clamp-2 text-sm leading-6 text-foreground md:text-base">{q.content}</p>
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
              <Button variant="outline" className="h-11 w-full sm:w-auto">{t("viewAll")}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
        </>
      )}
      </>
      )}
    </div>
  );
}
