"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Student {
  studentId: string;
  name: string;
  className?: string;
  total: number;
  distribution: { closed: number; open: number };
  cognitiveDistribution: { factual: number; interpretive: number; evaluative: number };
  trend: number;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stats?period=semester");
      const data = await res.json();
      setStudents(data.byStudent || []);
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
        <h2 className="text-2xl font-bold text-gray-900">학생 관리</h2>
        <p className="text-gray-600">학생별 질문 활동량을 확인하세요</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>학생 목록</CardTitle>
          <CardDescription>반 전체 학생의 질문 활동 통계</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : students.length === 0 ? (
            <div className="text-center py-8 text-gray-500">학생 데이터가 없습니다</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>반</TableHead>
                  <TableHead className="text-right">총 질문</TableHead>
                  <TableHead className="text-right">사실적</TableHead>
                  <TableHead className="text-right">해석적</TableHead>
                  <TableHead className="text-right">평가적</TableHead>
                  <TableHead className="text-right">추세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>{student.className || "-"}</TableCell>
                    <TableCell className="text-right">{student.total}</TableCell>
                    <TableCell className="text-right">{student.cognitiveDistribution.factual}</TableCell>
                    <TableCell className="text-right">{student.cognitiveDistribution.interpretive}</TableCell>
                    <TableCell className="text-right">{student.cognitiveDistribution.evaluative}</TableCell>
                    <TableCell className="text-right">{getTrendIcon(student.trend)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}