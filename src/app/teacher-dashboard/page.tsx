"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    trend: number;
  }>;
  timeline: Array<{ date: string; count: number }>;
}

export default function TeacherDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState("month");
  const [className, setClassName] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [period, className]);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (className !== "all") params.append("className", className);
      const res = await fetch(`/api/stats?${params}`);
      const data = await res.json();
      setStats(data);
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <span className="text-green-600">▲{trend}%</span>;
    if (trend < 0) return <span className="text-red-600">▼{Math.abs(trend)}%</span>;
    return <span className="text-gray-400">-</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">교사 대시보드</h2>
        <p className="text-gray-600">학생들의 질문 통계를 확인하세요</p>
      </div>

      <div className="flex gap-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="기간" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">최근 1주</SelectItem>
            <SelectItem value="month">최근 1개월</SelectItem>
            <SelectItem value="semester">최근 6개월</SelectItem>
          </SelectContent>
        </Select>

        <Select value={className} onValueChange={setClassName}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="반" />
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
        <div className="text-center py-12">로딩 중...</div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">총 질문 수</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">페쇄형</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{stats.byClosure.closed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">개방형</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{stats.byClosure.open}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">평가적 질문</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">{stats.byCognitive.evaluative}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>인지 수준 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">사실적</span>
                    <span className="font-medium">{stats.byCognitive.factual}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">해석적</span>
                    <span className="font-medium">{stats.byCognitive.interpretive}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">평가적</span>
                    <span className="font-medium">{stats.byCognitive.evaluative}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>학생별 통계</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byStudent.length === 0 ? (
                <div className="text-center py-8 text-gray-500">데이터가 없습니다</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>학생</TableHead>
                      <TableHead className="text-right">총 질문</TableHead>
                      <TableHead className="text-right">페쇄형</TableHead>
                      <TableHead className="text-right">개방형</TableHead>
                      <TableHead className="text-right">추세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.byStudent.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell>
                          <div>{student.name}</div>
                          {student.className && (
                            <div className="text-xs text-gray-400">{student.className}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{student.total}</TableCell>
                        <TableCell className="text-right">{student.distribution.closed}</TableCell>
                        <TableCell className="text-right">{student.distribution.open}</TableCell>
                        <TableCell className="text-right">{getTrendIcon(student.trend)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-center py-12">통계를 불러올 수 없습니다</div>
      )}
    </div>
  );
}