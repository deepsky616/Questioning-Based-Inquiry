"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  }>;
  timeline: Array<{ date: string; count: number }>;
  school?: string | null;
  teacherClasses: TeacherClass[];
}

// 학급 Select에서 사용할 복합 키 (grade|className)
function classKey(tc: TeacherClass) {
  return `${tc.grade}|${tc.className}`;
}

export default function TeacherDashboard() {
  const tPages = useTranslations("pages");
  const tCls = useTranslations("classification");
  const tc = useTranslations("common");
  const t = useTranslations("dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState("month");
  const [selectedClass, setSelectedClass] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ period });
    if (selectedClass !== "all") {
      const [grade, className] = selectedClass.split("|");
      params.append("grade", grade);
      params.append("className", className);
    }
    fetch(`/api/stats?${params}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [period, selectedClass]);

  // 학급 변경 시 선택값이 새 목록에 없으면 "전체"로 초기화
  useEffect(() => {
    if (!stats || selectedClass === "all") return;
    const keys = stats.teacherClasses.map(classKey);
    if (!keys.includes(selectedClass)) setSelectedClass("all");
  }, [stats, selectedClass]);

  const getTrendLabel = (trend: number | null) => {
    if (trend === null)
      return (
        <span className="text-blue-500 text-xs font-medium" title={t("trendNewTitle")}>
          {t("trendNew")}
        </span>
      );
    if (trend > 0)
      return (
        <span className="text-green-600 text-xs font-medium" title={t("trendUpTitle")}>
          {t("trendUp", { trend })}
        </span>
      );
    if (trend < 0)
      return (
        <span className="text-red-500 text-xs font-medium" title={t("trendDownTitle")}>
          {t("trendDown", { trend: Math.abs(trend) })}
        </span>
      );
    return (
      <span className="text-muted-foreground text-xs" title={t("trendFlatTitle")}>
        {t("trendFlat")}
      </span>
    );
  };

  const teacherClasses = stats?.teacherClasses ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherDashboard.title")} description={tPages("teacherDashboard.description")} />

      {/* 필터 */}
      <div className="flex gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
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
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
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
                    return t("gradeClassDot", { grade, className });
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 분류 1 · 폐쇄형 / 개방형 */}
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
                        <span className="text-sm font-medium">{tCls("closed.label")} {tc("questionWord")}</span>
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
                        <span className="text-sm font-medium">{tCls("open.label")} {tc("questionWord")}</span>
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
                        <span className="text-sm font-medium">{tCls("factual.label")} {tc("questionWord")}</span>
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
                        <span className="text-sm font-medium">{tCls("conceptual.label")} {tc("questionWord")}</span>
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
                        <span className="text-sm font-medium">{tCls("controversial.label")} {tc("questionWord")}</span>
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
              <CardTitle className="text-base">{t("studentStats")}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byStudent.length === 0 ? (
                <EmptyState icon="📊" title={t("noData")} />
              ) : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colStudent")}</TableHead>
                      <TableHead className="text-center w-12">{t("colTotal")}</TableHead>
                      <TableHead className="text-center w-16 text-blue-600">{tCls("closed.label")}</TableHead>
                      <TableHead className="text-center w-16 text-green-600">{tCls("open.label")}</TableHead>
                      <TableHead className="text-center w-16 text-muted-foreground">{tCls("factual.label")}</TableHead>
                      <TableHead className="text-center w-16 text-purple-600">{tCls("conceptual.label")}</TableHead>
                      <TableHead className="text-center w-16 text-orange-600">{tCls("controversial.label")}</TableHead>
                      <TableHead className="text-center w-28 whitespace-nowrap" title={t("colTrendTitle")}>
                        {t("colTrend")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.byStudent.map((s) => (
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
                        <TableCell className="text-center whitespace-nowrap">{getTrendLabel(s.trend)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
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
    </div>
  );
}
