"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { buildTeacherClassLabel } from "@/lib/teacher";

interface Student {
  id: string;
  name: string;
  grade: string;
  className: string;
  studentNumber: string;
  school: string;
  questionCount: number;
}

interface TeacherClass {
  grade: string;
  className: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");

  useEffect(() => {
    fetch("/api/teacher/students")
      .then((r) => r.json())
      .then((data) => {
        setStudents(data.students ?? []);
        setTeacherClasses(data.teacherClasses ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = students.filter((s) => {
    const matchSearch =
      s.name.includes(search) ||
      s.grade.includes(search) ||
      s.className.includes(search);
    const matchClass =
      filterClass === "all" ||
      `${s.grade}-${s.className}` === filterClass;
    return matchSearch && matchClass;
  });

  // 학년·반별 그룹화
  const grouped = filtered.reduce<Record<string, Student[]>>((acc, s) => {
    const key = buildTeacherClassLabel(s.grade, s.className);
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">학생 관리</h2>
        <p className="text-gray-600">담당 학년·반 학생 목록과 질문 활동을 확인하세요</p>
      </div>

      {/* 담당 학급 배지 */}
      {teacherClasses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterClass("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterClass === "all"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            전체
          </button>
          {teacherClasses.map((tc) => {
            const key = `${tc.grade}-${tc.className}`;
            return (
              <button
                key={key}
                onClick={() => setFilterClass(filterClass === key ? "all" : key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterClass === key
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                }`}
              >
                {buildTeacherClassLabel(tc.grade, tc.className)}
              </button>
            );
          })}
        </div>
      )}

      {/* 검색 */}
      <Input
        placeholder="이름, 학년, 반 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p className="font-medium mb-1">등록된 학생이 없습니다</p>
            <p className="text-sm text-gray-400">
              같은 학교·학년·반 학생이 회원가입하면 여기에 표시됩니다
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([classLabel, classStudents]) => (
          <Card key={classLabel}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-sm font-semibold">
                  {classLabel}
                </span>
                <span className="text-sm font-normal text-gray-500">
                  {classStudents.length}명
                </span>
              </CardTitle>
              <CardDescription>
                총 질문 수: {classStudents.reduce((sum, s) => sum + s.questionCount, 0)}개
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">번호</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead className="text-right">총 질문</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classStudents.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-gray-500">{s.studentNumber}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${s.questionCount > 0 ? "text-indigo-600" : "text-gray-400"}`}>
                          {s.questionCount}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
