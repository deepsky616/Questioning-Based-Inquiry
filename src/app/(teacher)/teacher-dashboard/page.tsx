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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Stats {
  total: number;
  byClosure: { closed: number; open: number };
  byCognitive: { factual: number; interpretive: number; evaluative: number };
  byStudent: Array<{
    studentId: string;
    name: string;
    className?: string;
    total: number;
    distribution: { closed: number; open: number };
    cognitiveDistribution: { factual: number; interpretive: number; evaluative: number };
    trend: number | null;
  }>;
  timeline: Array<{ date: string; count: number }>;
}

export default function TeacherDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState("month");
  const [className, setClassName] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ period });
    if (className !== "all") params.append("className", className);
    fetch(`/api/stats?${params}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [period, className]);

  const getTrendLabel = (trend: number | null) => {
    if (trend === null) return <span className="text-gray-400 text-xs">신규</span>;
    if (trend > 0) return <span className="text-green-600 text-xs font-medium">▲{trend}%</span>;
    if (trend < 0) return <span className="text-red-500 text-xs font-medium">▼{Math.abs(trend)}%</span>;
    return <span className="text-gray-400 text-xs">-</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">교사 대시보드</h2>
        <p className="text-gray-600">학생들의 질문 통계를 확인하세요</p>
      </div>

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
        <Select value={className} onValueChange={setClassName}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 반</SelectItem>
            <SelectItem value="1반">1반</SelectItem>
            <SelectItem value="2반">2반</SelectItem>
            <SelectItem value="3반">3반</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : !stats ? (
        <div className="text-center py-16 text-gray-400">통계를 불러올 수 없습니다</div>
      ) : (
        <>
          {/* 총 질문 수 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-gray-500">총 질문 수</p>
                  <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
                </div>
                <div className="text-xs text-gray-400 border-l pl-4">
                  {period === "week" && "최근 1주 기준"}
                  {period === "month" && "최근 1개월 기준"}
                  {period === "semester" && "최근 6개월 기준"}
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
              <div className="grid grid-cols-2 gap-6">
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
            </CardContent>
          </Card>

          {/* 분류 2 · 사실적 / 해석적 / 평가적 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">분류 2 · 사실적 / 해석적 / 평가적 질문</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                      <span className="text-sm font-medium">사실적 질문</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-700">{stats.byCognitive.factual}</span>
                  </div>
                  <StatBar value={stats.byCognitive.factual} total={stats.total} color="bg-gray-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                      <span className="text-sm font-medium">해석적 질문</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-600">{stats.byCognitive.interpretive}</span>
                  </div>
                  <StatBar value={stats.byCognitive.interpretive} total={stats.total} color="bg-purple-500" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                      <span className="text-sm font-medium">평가적 질문</span>
                    </div>
                    <span className="text-2xl font-bold text-orange-600">{stats.byCognitive.evaluative}</span>
                  </div>
                  <StatBar value={stats.byCognitive.evaluative} total={stats.total} color="bg-orange-500" />
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
                <div className="text-center py-8 text-gray-400">데이터가 없습니다</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>학생</TableHead>
                      <TableHead className="text-right">총</TableHead>
                      <TableHead className="text-right text-blue-600">폐쇄형</TableHead>
                      <TableHead className="text-right text-green-600">개방형</TableHead>
                      <TableHead className="text-right text-gray-500">사실적</TableHead>
                      <TableHead className="text-right text-purple-600">해석적</TableHead>
                      <TableHead className="text-right text-orange-600">평가적</TableHead>
                      <TableHead className="text-right">추세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.byStudent.map((s) => (
                      <TableRow key={s.studentId}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          {s.className && (
                            <div className="text-xs text-gray-400">{s.className}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold">{s.total}</TableCell>
                        <TableCell className="text-right text-blue-600">{s.distribution.closed}</TableCell>
                        <TableCell className="text-right text-green-600">{s.distribution.open}</TableCell>
                        <TableCell className="text-right text-gray-500">{s.cognitiveDistribution.factual}</TableCell>
                        <TableCell className="text-right text-purple-600">{s.cognitiveDistribution.interpretive}</TableCell>
                        <TableCell className="text-right text-orange-600">{s.cognitiveDistribution.evaluative}</TableCell>
                        <TableCell className="text-right">{getTrendLabel(s.trend)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
