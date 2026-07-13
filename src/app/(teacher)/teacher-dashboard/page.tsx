"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherReportsView } from "@/components/teacher/TeacherReportsView";
import { TeacherDashboardFilters } from "./TeacherDashboardFilters";
import { TeacherStudentStatsCard } from "./TeacherStudentStatsCard";
import { TeacherTodayTasksCard, type TeacherTaskItem } from "./TeacherTodayTasksCard";
import { StatBar } from "@/components/shared/StatBar";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { useTranslations } from "next-intl";
import { useTeacherStudents } from "@/lib/app-queries";
import { buildTeacherPriorityCounts } from "@/lib/dashboard-priority-tasks";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";

interface TeacherClass {
  grade: string;
  className: string;
}

interface Stats {
  total: number;
  byClosure: { closed: number; open: number };
  byCognitive: { factual: number; conceptual: number; controversial: number };
  byStudent: Array<{
    studentId: string;
    name: string;
    className?: string;
    grade?: string;
    studentNumber?: string;
    total: number;
    distribution: { closed: number; open: number };
    cognitiveDistribution: { factual: number; conceptual: number; controversial: number };
    trend: number | null;
    sparkline?: number[];
  }>;
  timeline: Array<{ date: string; count: number }>;
  school?: string | null;
  teacherClasses: TeacherClass[];
}

interface TeacherStudent {
  id: string;
  name: string;
  grade: string;
  className: string;
  studentNumber: string;
  questionCount: number;
  commentCount: number;
  lastActivityAt: string | null;
  sessionProgress?: { total: number; completed: number; remaining: number; percent: number };
}

// 학급 Select에서 사용할 복합 키 (grade|className)
function classKey(tc: TeacherClass) {
  return `${tc.grade}|${tc.className}`;
}

export default function TeacherDashboardPage() {
  // useSearchParams(탭 쿼리)는 Suspense 경계가 필요하다
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TeacherDashboard />
    </Suspense>
  );
}

function TeacherDashboard() {
  const tPages = useTranslations("pages");
  const tCls = useTranslations("classification");
  const t = useTranslations("dashboard");
  const router = useRouter();
  const studentStatsRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "reports" ? "reports" : "overview";
  const [period, setPeriod] = useState("month");
  const [selectedClass, setSelectedClass] = useState("all");

  // 학급 통계(질문수·댓글수·좋아요수 등)는 react-query로 주기 폴링(12초)+포커스 재조회.
  const statsQuery = useQuery<Stats>({
    queryKey: ["teacher-stats", period, selectedClass],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (selectedClass !== "all") {
        const [grade, className] = selectedClass.split("|");
        params.append("grade", grade);
        params.append("className", className);
      }
      const r = await fetch(`/api/stats?${params}`);
      if (!r.ok) throw new Error("통계를 불러오지 못했습니다");
      return r.json();
    },
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const { data: stats, isLoading } = statsQuery;
  const pendingPointQuery = useQuery<number>({
    queryKey: ["teacher-pending-point-count"],
    queryFn: async () => {
      const r = await fetch("/api/teacher/points/pending-count");
      if (!r.ok) throw new Error("추천 포인트 수를 불러오지 못했습니다");
      const data = await r.json();
      return Number(data.count ?? 0);
    },
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const flaggedQuery = useQuery<number>({
    queryKey: ["teacher-flagged-count"],
    queryFn: async () => {
      const r = await fetch("/api/teacher/flagged-count");
      if (!r.ok) throw new Error("부적절 의심 활동 수를 불러오지 못했습니다");
      const data = await r.json();
      return Number(data.total ?? 0);
    },
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const teacherStudentsQuery = useTeacherStudents<TeacherStudent, TeacherClass>();
  const { data: teacherStudentData } = teacherStudentsQuery;
  const teacherStudents = useMemo(() => teacherStudentData?.students ?? [], [teacherStudentData]);

  // 학급 변경 시 선택값이 새 목록에 없으면 "전체"로 초기화
  useEffect(() => {
    if (!stats || selectedClass === "all") return;
    const keys = stats.teacherClasses.map(classKey);
    if (!keys.includes(selectedClass)) setSelectedClass("all");
  }, [stats, selectedClass]);

  // 기본값: 담당 학급이 1개뿐이면 그 학급을 자동 선택(최초 1회, 이후 교사 선택 존중)
  const [classDefaulted, setClassDefaulted] = useState(false);
  useEffect(() => {
    if (classDefaulted || !stats || selectedClass !== "all") return;
    if (stats.teacherClasses.length === 0) return;
    if (stats.teacherClasses.length === 1) {
      setSelectedClass(classKey(stats.teacherClasses[0]));
    }
    setClassDefaulted(true);
  }, [stats, selectedClass, classDefaulted]);

  // 추세 열 정렬: 기본(번호순) ↔ 감소 학생 우선(지도가 필요한 학생 찾기)
  const [trendSortOn, setTrendSortOn] = useState(false);

  const teacherClasses = stats?.teacherClasses ?? [];
  const scopedStudents = useMemo(() => {
    if (selectedClass === "all") return teacherStudents;
    const [grade, className] = selectedClass.split("|");
    return teacherStudents.filter((student) => student.grade === grade && student.className === className);
  }, [teacherStudents, selectedClass]);
  const activeStudentIds = useMemo(
    () => new Set((stats?.byStudent ?? []).map((student) => student.studentId)),
    [stats],
  );
  const attentionHref = (() => {
    const params = new URLSearchParams({ filter: "attention", period });
    if (selectedClass !== "all") {
      const [grade, className] = selectedClass.split("|");
      params.set("grade", grade);
      params.set("className", className);
    }
    return `/teacher-students?${params.toString()}`;
  })();
  const dashboardScopeLabel = (() => {
    if (!stats) return "";
    if (selectedClass === "all") {
      return `${stats.school ? `${stats.school} ` : ""}${t("allClasses")}`;
    }
    const [grade, className] = selectedClass.split("|");
    return `${stats.school ? `${stats.school} ` : ""}${t("gradeClass", { grade, className })}`;
  })();
  const taskStatus =
    statsQuery.isError || pendingPointQuery.isError || flaggedQuery.isError || teacherStudentsQuery.isError
      ? "error"
      : statsQuery.isSuccess && pendingPointQuery.isSuccess && flaggedQuery.isSuccess && teacherStudentsQuery.isSuccess
        ? "ready"
        : "loading";
  const taskCounts = taskStatus === "ready"
    ? buildTeacherPriorityCounts({
        flaggedCount: flaggedQuery.data ?? 0,
        pendingPointCount: pendingPointQuery.data ?? 0,
        students: scopedStudents.map((student) => ({
          id: student.id,
          hasQuestion: activeStudentIds.has(student.id),
          remainingSessionCount: student.sessionProgress?.remaining ?? 0,
        })),
      })
    : [];
  const taskItems: TeacherTaskItem[] = taskCounts.map((item) => {
    if (item.key === "flagged") {
      return {
        key: item.key,
        label: t("taskFlaggedTitle"),
        countLabel: t("taskItemCount", { count: item.count }),
        detail: t("taskWholeScope"),
        href: "/teacher-questions?flagged=1",
      };
    }
    if (item.key === "points") {
      return {
        key: item.key,
        label: t("taskPointsTitle"),
        countLabel: t("taskItemCount", { count: item.count }),
        detail: t("taskWholeScope"),
        href: "/teacher-points?tab=points",
      };
    }
    return {
      key: item.key,
      label: t("taskAttentionTitle"),
      countLabel: t("taskStudentCount", { count: item.count }),
      detail: dashboardScopeLabel,
      href: attentionHref,
    };
  });
  const handleTaskClick = (item: TeacherTaskItem) => {
    router.push(item.href);
  };
  const handleTaskRetry = () => {
    void Promise.all([
      statsQuery.refetch(),
      pendingPointQuery.refetch(),
      flaggedQuery.refetch(),
      teacherStudentsQuery.refetch(),
    ]);
  };

  return (
    <div className="space-y-6">
      {tab === "reports" ? (
        <PageHeader title={tPages("teacherReports.title")} description={tPages("teacherReports.description")} />
      ) : (
        <PageHeader title={tPages("teacherDashboard.title")} description={tPages("teacherDashboard.description")} />
      )}

      {tab === "reports" ? (
        <TeacherReportsView />
      ) : (
      <>
      <TeacherDashboardFilters
        period={period}
        selectedClass={selectedClass}
        teacherClasses={teacherClasses}
        school={stats?.school}
        onPeriodChange={setPeriod}
        onSelectedClassChange={setSelectedClass}
        classKey={classKey}
        labels={{
          periodWeek: t("periodWeek"),
          periodMonth: t("periodMonth"),
          periodSemester: t("periodSemester"),
          allClasses: t("allClasses"),
          gradeClass: (grade, className) => t("gradeClass", { grade, className }),
        }}
      />

      {/* 오늘 할 일 */}
      <TeacherTodayTasksCard
        taskItems={taskItems}
        status={taskStatus}
        onTaskClick={handleTaskClick}
        onRetry={handleTaskRetry}
        labels={{
          title: t("todayTasksTitle"),
          description: t("todayTasksDesc"),
          done: t("taskDone"),
          loading: t("taskLoading"),
          error: t("taskLoadError"),
          retry: t("taskRetry"),
        }}
      />

      {isLoading ? (
        <DashboardSkeleton />
      ) : !stats ? (
        <div className="text-center py-16 text-muted-foreground">{t("statsLoadError")}</div>
      ) : (
        <>
          {/* 총 질문 수 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("totalQuestions")}</p>
                  <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {period === "week" && t("periodWeekBasis")}
                  {period === "month" && t("periodMonthBasis")}
                  {period === "semester" && t("periodSemesterBasis")}
                  {dashboardScopeLabel ? ` · ${dashboardScopeLabel}` : ""}
                </div>
              </div>
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
                <div className="grid grid-cols-3 gap-6 flex-1 w-full">
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

          <TeacherStudentStatsCard
            ref={studentStatsRef}
            students={stats.byStudent}
            trendSortOn={trendSortOn}
            highlight={false}
            onTrendSortToggle={() => setTrendSortOn((v) => !v)}
          />

        </>
      )}
      </>
      )}
    </div>
  );
}
