"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherReportsView } from "@/components/teacher/TeacherReportsView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatBar } from "@/components/shared/StatBar";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations } from "next-intl";

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
  const tc = useTranslations("common");
  const t = useTranslations("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "reports" ? "reports" : "overview";
  const setTab = (v: "overview" | "reports") =>
    router.replace(v === "reports" ? "/teacher-dashboard?tab=reports" : "/teacher-dashboard", { scroll: false });
  const [period, setPeriod] = useState("month");
  const [selectedClass, setSelectedClass] = useState("all");

  // 학급 통계(질문수·댓글수·좋아요수 등)는 react-query로 주기 폴링(12초)+포커스 재조회.
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["teacher-stats", period, selectedClass],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (selectedClass !== "all") {
        const [grade, className] = selectedClass.split("|");
        params.append("grade", grade);
        params.append("className", className);
      }
      const r = await fetch(`/api/stats?${params}`);
      if (!r.ok) throw new Error("failed to load stats");
      return r.json();
    },
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

  // 학급 변경 시 선택값이 새 목록에 없으면 "전체"로 초기화
  useEffect(() => {
    if (!stats || selectedClass === "all") return;
    const keys = stats.teacherClasses.map(classKey);
    if (!keys.includes(selectedClass)) setSelectedClass("all");
  }, [stats, selectedClass]);

  // 기본값: 담당 학급이 1개뿐이면 그 학급을 자동 선택(최초 1회, 이후 교사 선택 존중)
  const [classDefaulted, setClassDefaulted] = useState(false);
  useEffect(() => {
    if (classDefaulted || !stats) return;
    if (stats.teacherClasses.length === 1) setSelectedClass(classKey(stats.teacherClasses[0]));
    setClassDefaulted(true);
  }, [stats, classDefaulted]);

  // 추세 배지 — 아이콘+짧은 단어로 뜻이 바로 읽히게, 정확한 수치·설명은 툴팁으로
  const getTrendBadge = (trend: number | null) => {
    if (trend === null)
      return (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950/40" title={t("trendNewTitle")}>
          🆕 {t("trendBadgeNew")}
        </span>
      );
    if (trend > 0)
      return (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-600 dark:bg-green-950/40" title={`${t("trendUpTitle")} (+${trend}%)`}>
          ▲ {t("trendBadgeUp")}
        </span>
      );
    if (trend < 0)
      return (
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-950/40" title={`${t("trendDownTitle")} (-${Math.abs(trend)}%)`}>
          ▼ {t("trendBadgeDown")}
        </span>
      );
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground" title={t("trendFlatTitle")}>
        — {t("trendBadgeFlat")}
      </span>
    );
  };

  // 미니 스파크라인 — 기간 6버킷의 질문 수를 작은 막대로(활동 리듬을 한눈에)
  const Sparkline = ({ data }: { data?: number[] }) => {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data, 1);
    return (
      <span
        className="inline-flex h-5 items-end gap-[2px]"
        title={t("sparklineTooltip", { counts: data.join(" · ") })}
      >
        {data.map((v, i) => (
          <span
            key={i}
            className={`w-[7px] rounded-sm ${v > 0 ? "bg-indigo-400" : "bg-muted"}`}
            style={{ height: v > 0 ? `${Math.max(20, (v / max) * 100)}%` : "3px" }}
          />
        ))}
      </span>
    );
  };

  // 추세 열 정렬: 기본(번호순) ↔ 감소 학생 우선(지도가 필요한 학생 찾기)
  const [trendSortOn, setTrendSortOn] = useState(false);
  const trendRank = (trend: number | null) => (trend === null ? 3 : trend < 0 ? 0 : trend === 0 ? 1 : 2);

  const teacherClasses = stats?.teacherClasses ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherDashboard.title")} description={tPages("teacherDashboard.description")} />

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
            {v === "overview" ? t("tabOverview") : t("tabReports")}
          </button>
        ))}
      </div>

      {tab === "reports" ? (
        <TeacherReportsView />
      ) : (
      <>
      {/* 필터 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">{t("periodWeek")}</SelectItem>
            <SelectItem value="month">{t("periodMonth")}</SelectItem>
            <SelectItem value="semester">{t("periodSemester")}</SelectItem>
          </SelectContent>
        </Select>

        {/* 담당 학급 드롭다운 — 동적으로 생성 */}
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger className="w-full sm:w-[22rem] md:w-[28rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-[var(--radix-select-trigger-width)]">
            <SelectItem value="all">{t("allClasses")}</SelectItem>
            {teacherClasses.map((tc) => (
              <SelectItem key={classKey(tc)} value={classKey(tc)}>
                {stats?.school ? `${stats.school} ` : ""}{t("gradeClass", { grade: tc.grade, className: tc.className })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                  {selectedClass !== "all" && (() => {
                    const [grade, className] = selectedClass.split("|");
                    const classLabel = `${stats.school ? `${stats.school} ` : ""}${t("gradeClass", { grade, className })}`;
                    return ` · ${classLabel}`;
                  })()}
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

          {/* 학생별 통계 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{t("studentStats")}</CardTitle>
                {/* 무엇을 하는지 라벨로 보이는 정렬 토글 */}
                <button
                  type="button"
                  onClick={() => setTrendSortOn((v) => !v)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    trendSortOn
                      ? "border-orange-400 bg-orange-500 text-white"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  title={t("trendSortTitle")}
                >
                  ▼ {t("trendSortLabel")}
                </button>
              </div>
              {/* 추세 읽는 법 — 이미지만 보고도 이해되도록 한 줄 범례 */}
              <p className="text-xs text-muted-foreground">{t("trendLegend")}</p>
            </CardHeader>
            <CardContent>
              {stats.byStudent.length === 0 ? (
                <EmptyState icon="📊" title={t("noData")} />
              ) : (
                <>
                <div className="space-y-2 lg:hidden">
                  {(trendSortOn
                    ? [...stats.byStudent].sort((a, b) => trendRank(a.trend) - trendRank(b.trend) || (a.trend ?? 0) - (b.trend ?? 0))
                    : stats.byStudent
                  ).map((s) => (
                    <div key={s.studentId} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{s.name}</p>
                          {(s.grade || s.className || s.studentNumber) && (
                            <p className="text-xs text-muted-foreground">
                              {[
                                s.grade && t("gradeLabel", { grade: s.grade }),
                                s.className && t("classLabel", { className: s.className }),
                                s.studentNumber && t("numberLabel", { n: s.studentNumber }),
                              ].filter(Boolean).join(" ")}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted-foreground">{t("colTotal")}</p>
                          <p className="text-xl font-bold text-foreground">{s.total}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="rounded-md bg-blue-50 px-2 py-2 text-center dark:bg-blue-950/30">
                          <p className="text-[11px] text-blue-600">{tCls("closed.label")}</p>
                          <p className="text-sm font-semibold text-blue-600">{s.distribution.closed}</p>
                        </div>
                        <div className="rounded-md bg-green-50 px-2 py-2 text-center dark:bg-green-950/30">
                          <p className="text-[11px] text-green-600">{tCls("open.label")}</p>
                          <p className="text-sm font-semibold text-green-600">{s.distribution.open}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{tCls("factual.label")}</p>
                          <p className="text-sm font-semibold text-foreground">{s.cognitiveDistribution.factual}</p>
                        </div>
                        <div className="rounded-md bg-purple-50 px-2 py-2 text-center dark:bg-purple-950/30">
                          <p className="text-[11px] text-purple-600">{tCls("conceptual.label")}</p>
                          <p className="text-sm font-semibold text-purple-600">{s.cognitiveDistribution.conceptual}</p>
                        </div>
                        <div className="rounded-md bg-orange-50 px-2 py-2 text-center dark:bg-orange-950/30">
                          <p className="text-[11px] text-orange-600">{tCls("controversial.label")}</p>
                          <p className="text-sm font-semibold text-orange-600">{s.cognitiveDistribution.controversial}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colTrend")}</p>
                          <span className="inline-flex items-center justify-center gap-1.5">
                            <Sparkline data={s.sparkline} />
                            {getTrendBadge(s.trend)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto lg:block"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colStudent")}</TableHead>
                      <TableHead className="text-center w-12">{t("colTotal")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-3 text-blue-600">{tCls("closed.label")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-3 text-green-600">{tCls("open.label")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-3 text-muted-foreground">{tCls("factual.label")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-3 text-purple-600">{tCls("conceptual.label")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-3 text-orange-600">{tCls("controversial.label")}</TableHead>
                      <TableHead className="text-center w-36 whitespace-nowrap" title={t("colTrendTitle")}>
                        {t("colTrend")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(trendSortOn
                      ? [...stats.byStudent].sort((a, b) => trendRank(a.trend) - trendRank(b.trend) || (a.trend ?? 0) - (b.trend ?? 0))
                      : stats.byStudent
                    ).map((s) => (
                      <TableRow key={s.studentId}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          {(s.grade || s.className || s.studentNumber) && (
                            <div className="text-xs text-muted-foreground">
                              {[
                                s.grade && t("gradeLabel", { grade: s.grade }),
                                s.className && t("classLabel", { className: s.className }),
                                s.studentNumber && t("numberLabel", { n: s.studentNumber }),
                              ].filter(Boolean).join(" ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold">{s.total}</TableCell>
                        <TableCell className="text-center text-blue-600">{s.distribution.closed}</TableCell>
                        <TableCell className="text-center text-green-600">{s.distribution.open}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{s.cognitiveDistribution.factual}</TableCell>
                        <TableCell className="text-center text-purple-600">{s.cognitiveDistribution.conceptual}</TableCell>
                        <TableCell className="text-center text-orange-600">{s.cognitiveDistribution.controversial}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Sparkline data={s.sparkline} />
                            {getTrendBadge(s.trend)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 순위 (개인: 우리반/교내/전체 · 반: 교내/전체)
              · 특정 학급: 해당 학급 학생 순위
              · 전체 담당 학급: 담당 학급별 학생 순위를 쌓아 모두 표시 + 반 순위에 담당 반 강조 */}
          {(() => {
            const [selGrade, selClassName] =
              selectedClass !== "all" ? selectedClass.split("|") : [undefined, undefined];
            return (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  {selectedClass !== "all" ? (
                    <StudentRankPanel gradeParam={selGrade} classNameParam={selClassName} />
                  ) : (
                    teacherClasses.map((tc) => (
                      <StudentRankPanel
                        key={classKey(tc)}
                        gradeParam={tc.grade}
                        classNameParam={tc.className}
                      />
                    ))
                  )}
                </div>
                <ClassRankingPanel
                  gradeParam={selGrade}
                  classNameParam={selClassName}
                  highlightSelf={selectedClass !== "all"}
                  highlightClasses={selectedClass === "all" ? teacherClasses : undefined}
                  defaultScope="school"
                />
              </div>
            );
          })()}
        </>
      )}
      </>
      )}
    </div>
  );
}
