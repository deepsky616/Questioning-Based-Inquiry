"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { buildTeacherClassLabel } from "@/lib/teacher";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { PageHeader } from "@/components/shared/PageHeader";
import { StudentBulkRegisterCard } from "@/components/teacher/StudentBulkRegisterCard";
import { StudentPasswordResetCard } from "@/components/teacher/StudentPasswordResetCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations, useLocale } from "next-intl";
import {
  appQueryKeys,
  mergeTeacherStudentActivity,
  useTeacherStudentActivity,
  useTeacherStudentDirectory,
} from "@/lib/app-queries";
import { StudentDetailDialog, StudentSessionProgress } from "./StudentDetailDialog";
import type { Student, TeacherClass } from "./types";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";
import {
  buildQuestionActivityScopeHref,
  readQuestionActivityScope,
} from "@/lib/teacher-student-question-activity-scope";
import {
  matchesStudentManagementSearch,
  summarizeStudentActivity,
} from "@/lib/teacher-student-management";

/** ISO 날짜 → "오늘 / N일 전 / -" */
function lastActiveLabel(iso?: string | null): { key: "today" | "yesterday" | "daysAgo" | "monthsAgo" | "yearsAgo"; v: Record<string, number> } | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return { key: "today", v: {} };
  if (d === 1) return { key: "yesterday", v: {} };
  if (d < 30) return { key: "daysAgo", v: { d } };
  if (d < 365) return { key: "monthsAgo", v: { m: Math.floor(d / 30) } };
  return { key: "yearsAgo", v: { y: Math.floor(d / 365) } };
}

/* ─── 타입 ─── */
/* ─── 타입 ─── */
interface TeacherStatsSummary {
  activeStudentIds: string[];
}


const EMPTY_STUDENTS: Student[] = [];
const EMPTY_TEACHER_CLASSES: TeacherClass[] = [];

type ProgressFilter = "all" | "remaining";
type StudentSort = "class" | "progressAsc";


/* ─── 메인 페이지 ─── */
export default function StudentsPage() {
  const tPages = useTranslations("pages");
  const t = useTranslations("students");
  const tCommon = useTranslations("common");
  const tSet = useTranslations("settings");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [mgmtTab, setMgmtTab] = useState<"list" | "bulk" | "reset">("list");
  const [search, setSearch] = useState("");
  const [localFilterClass, setLocalFilterClass] = useState<string>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [studentSort, setStudentSort] = useState<StudentSort>("class");
  const [selected, setSelected] = useState<Student | null>(null);
  const questionActivityScope = readQuestionActivityScope(searchParams);
  const dashboardFilter = questionActivityScope.filter;
  const noQuestionsFilterOn = dashboardFilter === "noQuestions";
  const attentionFilterOn = dashboardFilter === "attention";
  const questionActivityFilterOn = questionActivityScope.enabled;
  const questionActivityPeriod = questionActivityScope.period;
  const filterClass = questionActivityFilterOn
    ? questionActivityScope.filterClass
    : localFilterClass;
  const progressParam = searchParams.get("progress");
  const sortParam = searchParams.get("sort");

  const teacherStudentDirectoryQuery = useTeacherStudentDirectory<Student, TeacherClass>();
  const teacherStudentActivityQuery = useTeacherStudentActivity();
  const students = useMemo(
    () => mergeTeacherStudentActivity(
      teacherStudentDirectoryQuery.data?.students ?? EMPTY_STUDENTS,
      teacherStudentActivityQuery.data?.activity ?? [],
    ),
    [teacherStudentActivityQuery.data, teacherStudentDirectoryQuery.data],
  );
  const teacherClasses = teacherStudentDirectoryQuery.data?.teacherClasses ?? EMPTY_TEACHER_CLASSES;
  const isLoading = teacherStudentDirectoryQuery.isLoading || teacherStudentActivityQuery.isLoading;
  const studentDataError =
    teacherStudentDirectoryQuery.isError || teacherStudentActivityQuery.isError;
  const refetchList = () => queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherStudents });
  const questionActivityStatsQuery = useQuery<TeacherStatsSummary>({
    queryKey: questionActivityScope.queryKey,
    queryFn: async () => {
      const r = await fetch(questionActivityScope.statsPath);
      if (!r.ok) throw new Error("학생 질문 활동을 불러오지 못했습니다");
      return r.json();
    },
    enabled: questionActivityFilterOn,
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const activeStudentIdsForFilter = useMemo(
    () => new Set(questionActivityStatsQuery.data?.activeStudentIds ?? []),
    [questionActivityStatsQuery.data],
  );

  useEffect(() => {
    if (!questionActivityFilterOn) return;
    setMgmtTab("list");
    setSearch("");
  }, [questionActivityFilterOn]);

  useEffect(() => {
    if (progressParam !== "remaining" && sortParam !== "progressAsc") return;
    setMgmtTab("list");
    if (progressParam === "remaining") setProgressFilter("remaining");
    if (sortParam === "progressAsc") setStudentSort("progressAsc");
    if (
      !questionActivityFilterOn &&
      questionActivityScope.grade &&
      questionActivityScope.className
    ) {
      setLocalFilterClass(
        `${questionActivityScope.grade}-${questionActivityScope.className}`,
      );
    }
  }, [
    progressParam,
    sortParam,
    questionActivityFilterOn,
    questionActivityScope.grade,
    questionActivityScope.className,
  ]);

  const filtered = students.filter((s) => {
    const matchSearch = matchesStudentManagementSearch(s, search);
    const matchClass =
      filterClass === "all" ||
      `${s.grade}-${s.className}` === filterClass;
    const matchNoQuestions =
      !noQuestionsFilterOn ||
      (questionActivityStatsQuery.isSuccess && !activeStudentIdsForFilter.has(s.id));
    const matchAttention =
      !attentionFilterOn ||
      (questionActivityStatsQuery.isSuccess && (
        !activeStudentIdsForFilter.has(s.id) ||
        (s.sessionProgress?.actionableRemaining ?? 0) > 0
      ));
    const matchProgress =
      progressFilter === "all" ||
      (s.sessionProgress?.remaining ?? 0) > 0;
    return matchSearch && matchClass && matchNoQuestions && matchAttention && matchProgress;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (studentSort === "progressAsc") {
      const percentDiff = (a.sessionProgress?.percent ?? 100) - (b.sessionProgress?.percent ?? 100);
      if (percentDiff !== 0) return percentDiff;
      const remainingDiff = (b.sessionProgress?.remaining ?? 0) - (a.sessionProgress?.remaining ?? 0);
      if (remainingDiff !== 0) return remainingDiff;
    }
    return compareByClassAndNumber(a, b);
  });

  const grouped = sortedFiltered.reduce<Record<string, Student[]>>((acc, s) => {
    const key = buildTeacherClassLabel(tCommon, s.grade, s.className);
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const selectedStudentId = searchParams.get("studentId");
  const questionActivityPeriodLabel =
    questionActivityPeriod === "week" ? t("filterNoQuestionsWeek")
    : questionActivityPeriod === "semester" ? t("filterNoQuestionsSemester")
    : t("filterNoQuestionsMonth");
  const studentListLoading = isLoading || (
    questionActivityFilterOn && questionActivityStatsQuery.isPending
  );
  const visibleSummary = summarizeStudentActivity(filtered);
  const narrowedStudentScope = filtered.length !== students.length;

  useEffect(() => {
    if (!selectedStudentId || students.length === 0) return;
    const target = students.find((s) => s.id === selectedStudentId);
    if (target) {
      setSelected(target);
      setMgmtTab("list");
    }
  }, [selectedStudentId, students]);

  const closeSelected = () => {
    setSelected(null);
    if (selectedStudentId) router.replace("/teacher-students");
  };

  const hasActiveViewControls =
    search.trim() !== "" ||
    filterClass !== "all" ||
    progressFilter !== "all" ||
    studentSort !== "class" ||
    questionActivityFilterOn ||
    progressParam === "remaining" ||
    sortParam === "progressAsc";
  const hasActiveStudentFilters =
    filterClass !== "all" ||
    progressFilter !== "all" ||
    questionActivityFilterOn ||
    progressParam === "remaining";

  const resetStudentViewControls = () => {
    setSearch("");
    setLocalFilterClass("all");
    setProgressFilter("all");
    setStudentSort("class");
    if (questionActivityFilterOn || progressParam || sortParam) {
      router.replace("/teacher-students");
    }
  };

  const handleClassFilterChange = (nextClass: TeacherClass | null) => {
    if (questionActivityFilterOn) {
      router.replace(buildQuestionActivityScopeHref(searchParams, nextClass));
      return;
    }

    setLocalFilterClass(
      nextClass ? `${nextClass.grade}-${nextClass.className}` : "all",
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherStudents.title")} description={tPages("teacherStudents.description")} />

      {/* 학생 현황 / 일괄 등록 / 비밀번호 재설정 탭 */}
      <div className="flex w-fit rounded-md border overflow-hidden">
        {([
          ["list", t("tabList")],
          ["bulk", tSet("tabBulk")],
          ["reset", tSet("tabReset")],
        ] as const).map(([v, label], i) => (
          <button
            key={v}
            type="button"
            aria-pressed={mgmtTab === v}
            onClick={() => setMgmtTab(v)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
              mgmtTab === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mgmtTab === "bulk" && <StudentBulkRegisterCard />}
      {mgmtTab === "reset" && (
        <Card>
          <CardContent className="pt-6">
            <StudentPasswordResetCard embedded />
          </CardContent>
        </Card>
      )}

      {mgmtTab === "list" && studentDataError && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">{t("studentDataLoadError")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void Promise.all([
              teacherStudentDirectoryQuery.refetch(),
              teacherStudentActivityQuery.refetch(),
            ])}
          >
            {t("filterActivityRetry")}
          </Button>
        </div>
      )}

      {mgmtTab === "list" && !studentDataError && (
      <>
      {!studentListLoading && !(questionActivityFilterOn && questionActivityStatsQuery.isError) && (
        <div className="space-y-2">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="font-medium text-foreground"
            >
              {search.trim()
                ? t("summaryScopeSearch", {
                    query: search.trim(),
                    shown: visibleSummary.studentCount,
                    total: students.length,
                  })
                : narrowedStudentScope
                ? t("summaryScopeFiltered", {
                    shown: visibleSummary.studentCount,
                    total: students.length,
                  })
                : t("summaryScopeAll", { count: visibleSummary.studentCount })}
            </p>
            <p>{t("summaryValuesNote")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-muted/40 border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground font-medium">{t("allStudents")}</p>
              <p className="text-2xl font-black text-foreground mt-1">{t("studentCount", { n: visibleSummary.studentCount })}</p>
            </div>
            <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/30 p-4 text-center">
              <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">{t("totalQuestions")}</p>
              <p className="text-2xl font-black text-indigo-700 mt-1">{visibleSummary.totalQuestions}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-500/30 p-4 text-center">
              <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">{t("totalAnswers")}</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">{visibleSummary.totalAnswers}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-500/30 p-4 text-center">
              <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">{t("totalPointsAvg")}</p>
              <p className="text-2xl font-black text-amber-800 dark:text-amber-200 mt-1">
                {visibleSummary.totalPoints}<span className="text-sm font-normal text-amber-800 dark:text-amber-200 ml-1">/ {visibleSummary.averagePoints}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 학급 필터 */}
      {teacherClasses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={filterClass === "all"}
            onClick={() => handleClassFilterChange(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterClass === "all"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-card text-muted-foreground border-border hover:border-indigo-300"
            }`}>
            {t("filterAll")}
          </button>
          {teacherClasses.map((tc) => {
            const key = `${tc.grade}-${tc.className}`;
            return (
              <button key={key}
                type="button"
                aria-pressed={filterClass === key}
                onClick={() => handleClassFilterChange(filterClass === key ? null : tc)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterClass === key
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100"
                }`}>
                {buildTeacherClassLabel(tCommon, tc.grade, tc.className)}
              </button>
            );
          })}
        </div>
      )}

      {/* 검색 + 지도 우선순위 필터 */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Input
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={progressFilter === "remaining"}
            onClick={() => setProgressFilter(progressFilter === "remaining" ? "all" : "remaining")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              progressFilter === "remaining"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200"
            }`}
          >
            {t("filterRemainingSessions")}
          </button>
          <button
            type="button"
            aria-pressed={studentSort === "progressAsc"}
            onClick={() => setStudentSort(studentSort === "progressAsc" ? "class" : "progressAsc")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              studentSort === "progressAsc"
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200"
            }`}
          >
            {studentSort === "progressAsc" ? t("sortClassDefault") : t("sortLowProgress")}
          </button>
          {hasActiveViewControls && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetStudentViewControls}
              className="h-7 rounded-full px-3 text-xs"
            >
              {t("resetSearchFilters")}
            </Button>
          )}
        </div>
      </div>

      {noQuestionsFilterOn && (
        <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            {t("filterNoQuestionsActive", { period: questionActivityPeriodLabel })}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/teacher-students")}
            className="self-start rounded-md border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:bg-background dark:text-sky-200 sm:self-auto"
          >
            {t("filterNoQuestionsClear")}
          </button>
        </div>
      )}

      {attentionFilterOn && (
        <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            {t("filterAttentionActive", { period: questionActivityPeriodLabel })}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/teacher-students")}
            className="self-start rounded-md border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:bg-background dark:text-sky-200 sm:self-auto"
          >
            {t("filterNoQuestionsClear")}
          </button>
        </div>
      )}

      {questionActivityFilterOn && questionActivityStatsQuery.isError && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">{t("filterActivityLoadError")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void questionActivityStatsQuery.refetch()}
          >
            {t("filterActivityRetry")}
          </Button>
        </div>
      )}

      {questionActivityFilterOn && questionActivityStatsQuery.isError ? null : studentListLoading ? (
        <div className="text-center py-16 text-muted-foreground">{t("loading")}</div>
      ) : students.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState icon="🧑‍🏫" title={t("emptyTitle")} description={t("emptyDesc")} />
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState
            icon="🔍"
            title={t(hasActiveStudentFilters ? "noFilteredStudentsTitle" : "noResultTitle")}
            description={t(hasActiveStudentFilters ? "noFilteredStudentsDesc" : "noResultDesc")}
            action={hasActiveViewControls ? (
              <Button type="button" variant="outline" size="sm" onClick={resetStudentViewControls}>
                {t("resetSearchFilters")}
              </Button>
            ) : undefined}
          />
        </CardContent></Card>
      ) : (
        Object.entries(grouped).map(([classLabel, classStudents]) => {
          const qSum = classStudents.reduce((a, b) => a + b.questionCount, 0);
          const cSum = classStudents.reduce((a, b) => a + b.commentCount, 0);
          const pSum = classStudents.reduce((a, b) => a + b.totalPoints, 0);
          return (
            <Card key={classLabel}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-sm font-semibold">
                    {classLabel}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("classTotal", { n: classStudents.length })}
                  </span>
                </CardTitle>
                <CardDescription>
                  {t("classSummary", { q: qSum, c: cSum, p: pSum })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 lg:hidden">
                  {classStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(s)}
                      className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.studentNumber ? t("numberSuffix", { n: s.studentNumber }) : "-"}
                            {" · "}
                            {(() => { const r = lastActiveLabel(s.lastActivityAt); return r ? t(r.key, r.v) : "-"; })()}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
                          {t("detailBtn")}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colQuestion")}</p>
                          <p className={`text-sm font-semibold ${s.questionCount > 0 ? "text-indigo-600" : "text-muted-foreground"}`}>{s.questionCount}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colAnswer")}</p>
                          <p className={`text-sm font-semibold ${s.commentCount > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{s.commentCount}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colPoint")}</p>
                          <p className={`text-sm font-semibold ${s.totalPoints > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{s.totalPoints}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md bg-emerald-50 px-2 py-2 dark:bg-emerald-950/30">
                        <StudentSessionProgress student={s} />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="hidden overflow-x-auto lg:block"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center whitespace-nowrap">{t("colNumber")}</TableHead>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colQuestion")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colAnswer")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colPoint")}</TableHead>
                      <TableHead className="w-44 whitespace-nowrap">{t("colSessionProgress")}</TableHead>
                      <TableHead className="text-center w-28 whitespace-nowrap hidden sm:table-cell">{t("colLastActive")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colDetail")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classStudents.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelected(s)}>
                        <TableCell className="text-center text-muted-foreground">{s.studentNumber}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${s.questionCount > 0 ? "text-indigo-600" : "text-muted-foreground"}`}>
                            {s.questionCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${s.commentCount > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {s.commentCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${s.totalPoints > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {s.totalPoints}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StudentSessionProgress student={s} />
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                          {(() => { const r = lastActiveLabel(s.lastActivityAt); return r ? t(r.key, r.v) : "-"; })()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline"
                            onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
                            {t("detailBtn")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          );
        })
      )}
      </>
      )}

      {selected && (
        <StudentDetailDialog
          student={selected}
          onClose={closeSelected}
          onChanged={refetchList}
        />
      )}
    </div>
  );
}
