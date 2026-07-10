"use client";

import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";

export interface TeacherStudentQuestionStats {
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
}

interface TeacherStudentStatsCardProps {
  students: TeacherStudentQuestionStats[];
  trendSortOn: boolean;
  highlight: boolean;
  onTrendSortToggle: () => void;
}

const trendRank = (trend: number | null) => (trend === null ? 3 : trend < 0 ? 0 : trend === 0 ? 1 : 2);

function sortStudents(students: TeacherStudentQuestionStats[], trendSortOn: boolean) {
  if (!trendSortOn) return students;
  return [...students].sort((a, b) => trendRank(a.trend) - trendRank(b.trend) || (a.trend ?? 0) - (b.trend ?? 0));
}

function Sparkline({ data }: { data?: number[] }) {
  const t = useTranslations("dashboard");
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
}

function TrendBadge({ trend }: { trend: number | null }) {
  const t = useTranslations("dashboard");
  if (trend === null) {
    return (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950/40" title={t("trendNewTitle")}>
        🆕 {t("trendBadgeNew")}
      </span>
    );
  }
  if (trend > 0) {
    return (
      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-600 dark:bg-green-950/40" title={`${t("trendUpTitle")} (+${trend}%)`}>
        ▲ {t("trendBadgeUp")}
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-950/40" title={`${t("trendDownTitle")} (-${Math.abs(trend)}%)`}>
        ▼ {t("trendBadgeDown")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground" title={t("trendFlatTitle")}>
      - {t("trendBadgeFlat")}
    </span>
  );
}

function StudentClassMeta({ student }: { student: TeacherStudentQuestionStats }) {
  const t = useTranslations("dashboard");
  if (!student.grade && !student.className && !student.studentNumber) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {[
        student.grade && t("gradeLabel", { grade: student.grade }),
        student.className && t("classLabel", { className: student.className }),
        student.studentNumber && t("numberLabel", { n: student.studentNumber }),
      ].filter(Boolean).join(" ")}
    </p>
  );
}

export const TeacherStudentStatsCard = forwardRef<HTMLDivElement, TeacherStudentStatsCardProps>(
  function TeacherStudentStatsCard({ students, trendSortOn, highlight, onTrendSortToggle }, ref) {
    const t = useTranslations("dashboard");
    const tCls = useTranslations("classification");
    const sortedStudents = sortStudents(students, trendSortOn);

    return (
      <Card
        ref={ref}
        className={`scroll-mt-24 transition-shadow ${
          highlight ? "shadow-[0_0_0_3px_rgba(249,115,22,0.5)]" : ""
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t("studentStats")}</CardTitle>
            <button
              type="button"
              onClick={onTrendSortToggle}
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
          <p className="text-xs text-muted-foreground">{t("trendLegend")}</p>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <EmptyState icon="📊" title={t("noData")} />
          ) : (
            <>
              <div className="space-y-2 lg:hidden">
                {sortedStudents.map((student) => (
                  <div key={student.studentId} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{student.name}</p>
                        <StudentClassMeta student={student} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-muted-foreground">{t("colTotal")}</p>
                        <p className="text-xl font-bold text-foreground">{student.total}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div className="rounded-md bg-blue-50 px-2 py-2 text-center dark:bg-blue-950/30">
                        <p className="text-[11px] text-blue-600">{tCls("closed.label")}</p>
                        <p className="text-sm font-semibold text-blue-600">{student.distribution.closed}</p>
                      </div>
                      <div className="rounded-md bg-green-50 px-2 py-2 text-center dark:bg-green-950/30">
                        <p className="text-[11px] text-green-600">{tCls("open.label")}</p>
                        <p className="text-sm font-semibold text-green-600">{student.distribution.open}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                        <p className="text-[11px] text-muted-foreground">{tCls("factual.label")}</p>
                        <p className="text-sm font-semibold text-foreground">{student.cognitiveDistribution.factual}</p>
                      </div>
                      <div className="rounded-md bg-purple-50 px-2 py-2 text-center dark:bg-purple-950/30">
                        <p className="text-[11px] text-purple-600">{tCls("conceptual.label")}</p>
                        <p className="text-sm font-semibold text-purple-600">{student.cognitiveDistribution.conceptual}</p>
                      </div>
                      <div className="rounded-md bg-orange-50 px-2 py-2 text-center dark:bg-orange-950/30">
                        <p className="text-[11px] text-orange-600">{tCls("controversial.label")}</p>
                        <p className="text-sm font-semibold text-orange-600">{student.cognitiveDistribution.controversial}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                        <p className="text-[11px] text-muted-foreground">{t("colTrend")}</p>
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <Sparkline data={student.sparkline} />
                          <TrendBadge trend={student.trend} />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colStudent")}</TableHead>
                      <TableHead className="w-12 text-center">{t("colTotal")}</TableHead>
                      <TableHead className="whitespace-nowrap px-3 text-center text-blue-600">{tCls("closed.label")}</TableHead>
                      <TableHead className="whitespace-nowrap px-3 text-center text-green-600">{tCls("open.label")}</TableHead>
                      <TableHead className="whitespace-nowrap px-3 text-center text-muted-foreground">{tCls("factual.label")}</TableHead>
                      <TableHead className="whitespace-nowrap px-3 text-center text-purple-600">{tCls("conceptual.label")}</TableHead>
                      <TableHead className="whitespace-nowrap px-3 text-center text-orange-600">{tCls("controversial.label")}</TableHead>
                      <TableHead className="w-36 whitespace-nowrap text-center" title={t("colTrendTitle")}>
                        {t("colTrend")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStudents.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell>
                          <div className="font-medium">{student.name}</div>
                          <StudentClassMeta student={student} />
                        </TableCell>
                        <TableCell className="text-center font-bold">{student.total}</TableCell>
                        <TableCell className="text-center text-blue-600">{student.distribution.closed}</TableCell>
                        <TableCell className="text-center text-green-600">{student.distribution.open}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{student.cognitiveDistribution.factual}</TableCell>
                        <TableCell className="text-center text-purple-600">{student.cognitiveDistribution.conceptual}</TableCell>
                        <TableCell className="text-center text-orange-600">{student.cognitiveDistribution.controversial}</TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <span className="inline-flex items-center gap-1.5">
                            <Sparkline data={student.sparkline} />
                            <TrendBadge trend={student.trend} />
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  },
);
