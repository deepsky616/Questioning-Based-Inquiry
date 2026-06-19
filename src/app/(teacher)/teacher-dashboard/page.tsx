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
import { PendingReviewBanner } from "@/components/teacher/PendingReviewBanner";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";

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
        <span className="text-blue-500 text-xs font-medium" title="기간 후반에 처음 질문을 작성했어요">
          🆕 새로 참여
        </span>
      );
    if (trend > 0)
      return (
        <span className="text-green-600 text-xs font-medium" title="기간 전반보다 후반에 질문을 더 많이 썼어요">
          ▲ 활발해짐 {trend}%
        </span>
      );
    if (trend < 0)
      return (
        <span className="text-red-500 text-xs font-medium" title="기간 전반보다 후반에 질문이 줄었어요">
          ▼ 줄어듦 {Math.abs(trend)}%
        </span>
      );
    return (
      <span className="text-muted-foreground text-xs" title="기간 전반과 후반의 질문 수가 비슷해요">
        — 비슷함
      </span>
    );
  };

  const teacherClasses = stats?.teacherClasses ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="교사 대시보드" description="담당 학생들의 질문 통계를 확인하세요" />

      <PendingReviewBanner />

      {/* 필터 */}
      <div className="flex gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">최근 1주</SelectItem>
            <SelectItem value="month">최근 1개월</SelectItem>
            <SelectItem value="semester">최근 6개월</SelectItem>
          </SelectContent>
        </Select>

        {/* 담당 학급 드롭다운 — 동적으로 생성 */}
        <Select value={selectedClass} onValueChange={setSelectedClass}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 담당 학급</SelectItem>
            {teacherClasses.map((tc) => (
              <SelectItem key={classKey(tc)} value={classKey(tc)}>
                {stats?.school ? `${stats.school} ` : ""}{tc.grade}학년 {tc.className}반
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : !stats ? (
        <div className="text-center py-16 text-muted-foreground">통계를 불러올 수 없습니다</div>
      ) : (
        <>
          {/* 총 질문 수 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">총 질문 수</p>
                  <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
                </div>
                <div className="text-xs text-muted-foreground border-l pl-4">
                  {period === "week" && "최근 1주 기준"}
                  {period === "month" && "최근 1개월 기준"}
                  {period === "semester" && "최근 6개월 기준"}
                  {selectedClass !== "all" && (() => {
                    const [grade, className] = selectedClass.split("|");
                    return ` · ${grade}학년 ${className}`;
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 분류 1 · 폐쇄형 / 개방형 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">분류 1 · 폐쇄형 / 개방형 질문</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ClassificationDonut
                  slices={[
                    { name: "폐쇄형", value: stats.byClosure.closed, fill: "#3b82f6" },
                    { name: "개방형", value: stats.byClosure.open, fill: "#22c55e" },
                  ]}
                />
                <div className="grid grid-cols-2 gap-6 flex-1 w-full">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                        <span className="text-sm font-medium">폐쇄형 질문</span>
                      </div>
                      <span className="text-2xl font-bold text-blue-600">{stats.byClosure.closed}</span>
                    </div>
                    <StatBar value={stats.byClosure.closed} total={stats.total} color="bg-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                        <span className="text-sm font-medium">개방형 질문</span>
                      </div>
                      <span className="text-2xl font-bold text-green-600">{stats.byClosure.open}</span>
                    </div>
                    <StatBar value={stats.byClosure.open} total={stats.total} color="bg-green-500" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 분류 2 · 사실적 / 개념적 / 논쟁적 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">분류 2 · 사실적 / 개념적 / 논쟁적 질문</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ClassificationDonut
                  slices={[
                    { name: "사실적", value: stats.byCognitive.factual, fill: "#94a3b8" },
                    { name: "개념적", value: stats.byCognitive.conceptual, fill: "#a855f7" },
                    { name: "논쟁적", value: stats.byCognitive.controversial, fill: "#f97316" },
                  ]}
                />
                <div className="grid grid-cols-3 gap-6 flex-1 w-full">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                        <span className="text-sm font-medium">사실적 질문</span>
                      </div>
                      <span className="text-2xl font-bold text-foreground">{stats.byCognitive.factual}</span>
                    </div>
                    <StatBar value={stats.byCognitive.factual} total={stats.total} color="bg-gray-400" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                        <span className="text-sm font-medium">개념적 질문</span>
                      </div>
                      <span className="text-2xl font-bold text-purple-600">{stats.byCognitive.conceptual}</span>
                    </div>
                    <StatBar value={stats.byCognitive.conceptual} total={stats.total} color="bg-purple-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                        <span className="text-sm font-medium">논쟁적 질문</span>
                      </div>
                      <span className="text-2xl font-bold text-orange-600">{stats.byCognitive.controversial}</span>
                    </div>
                    <StatBar value={stats.byCognitive.controversial} total={stats.total} color="bg-orange-500" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 학생별 통계 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">학생별 통계</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byStudent.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">데이터가 없습니다</div>
              ) : (
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>학생</TableHead>
                      <TableHead className="text-right">총</TableHead>
                      <TableHead className="text-right text-blue-600">폐쇄형</TableHead>
                      <TableHead className="text-right text-green-600">개방형</TableHead>
                      <TableHead className="text-right text-muted-foreground">사실적</TableHead>
                      <TableHead className="text-right text-purple-600">개념적</TableHead>
                      <TableHead className="text-right text-orange-600">논쟁적</TableHead>
                      <TableHead className="text-right whitespace-nowrap" title="선택한 기간을 절반으로 나눠, 전반 대비 후반의 질문 작성량 변화를 보여줍니다">
                        질문 활동 추세
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
                              {s.grade && `${s.grade}학년 `}
                              {s.className && `${s.className}반`}
                              {s.studentNumber && ` ${s.studentNumber}번`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold">{s.total}</TableCell>
                        <TableCell className="text-right text-blue-600">{s.distribution.closed}</TableCell>
                        <TableCell className="text-right text-green-600">{s.distribution.open}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{s.cognitiveDistribution.factual}</TableCell>
                        <TableCell className="text-right text-purple-600">{s.cognitiveDistribution.conceptual}</TableCell>
                        <TableCell className="text-right text-orange-600">{s.cognitiveDistribution.controversial}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{getTrendLabel(s.trend)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              )}
            </CardContent>
          </Card>

          {/* 순위 (개인: 우리반/교내/전체 · 반: 교내/전체) — 선택 학급 기준 */}
          {(() => {
            const [selGrade, selClassName] =
              selectedClass !== "all" ? selectedClass.split("|") : [undefined, undefined];
            return (
              <div className="grid gap-4 lg:grid-cols-2">
                <StudentRankPanel
                  gradeParam={selGrade}
                  classNameParam={selClassName}
                />
                <ClassRankingPanel
                  gradeParam={selGrade}
                  classNameParam={selClassName}
                  highlightSelf={selectedClass !== "all"}
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
