"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Student {
  id: string; name: string; grade: string | null; className: string | null;
  studentNumber: string | null;
  totalPoints: number;
  _count: { pointLogs: number };
}

export default function TeacherPointsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");

  // 수정 다이얼로그
  const [target, setTarget] = useState<Student | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/teacher/points")
      .then((r) => r.json())
      .then((d) => setStudents(d.students ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const classes = Array.from(new Set(
    students.filter((s) => s.grade && s.className).map((s) => `${s.grade}-${s.className}`)
  )).sort();

  const filtered = students.filter((s) => {
    if (filterClass !== "all" && `${s.grade}-${s.className}` !== filterClass) return false;
    if (search && !s.name.includes(search)) return false;
    return true;
  });

  // 학급별 그룹화
  const grouped: Record<string, Student[]> = {};
  for (const s of filtered) {
    const key = s.grade && s.className ? `${s.grade}학년 ${s.className}반` : "기타";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  // 학급 평균
  const avgByGroup: Record<string, number> = {};
  for (const [k, list] of Object.entries(grouped)) {
    avgByGroup[k] = list.length === 0 ? 0 : Math.round(list.reduce((a, b) => a + b.totalPoints, 0) / list.length);
  }

  async function submit() {
    if (!target || delta === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: target.id, points: delta, reason }),
      });
      if (res.ok) {
        setTarget(null);
        setDelta(0);
        setReason("");
        load();
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">🏆 학생 포인트 관리</h1>
          <p className="text-gray-500 text-sm mt-1">학생들의 누적 포인트를 보고 수정·회수할 수 있어요</p>
        </div>
        <Button variant="outline" onClick={load}>새로고침</Button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-center">
          <p className="text-xs text-indigo-500 font-medium">전체 학생</p>
          <p className="text-2xl font-black text-indigo-700 mt-1">{students.length}명</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-center">
          <p className="text-xs text-emerald-500 font-medium">총 누적</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">
            {students.reduce((a, b) => a + b.totalPoints, 0)}점
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
          <p className="text-xs text-amber-500 font-medium">평균</p>
          <p className="text-2xl font-black text-amber-700 mt-1">
            {students.length === 0 ? 0 : Math.round(students.reduce((a, b) => a + b.totalPoints, 0) / students.length)}점
          </p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="이름 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="border rounded-md px-3 py-2 text-sm bg-white"
          value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
          <option value="all">전체 학급</option>
          {classes.map((c) => {
            const [g, n] = c.split("-");
            return <option key={c} value={c}>{g}학년 {n}반</option>;
          })}
        </select>
      </div>

      {/* 학급별 학생 목록 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-400">학생이 없어요</div>
      ) : (
        Object.entries(grouped).map(([groupName, list]) => (
          <div key={groupName} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-black text-gray-700">{groupName}</h2>
              <span className="text-xs text-gray-500">
                {list.length}명 · 평균 {avgByGroup[groupName]}점
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">번호</th>
                  <th className="px-4 py-2 text-left">이름</th>
                  <th className="px-4 py-2 text-right">누적 포인트</th>
                  <th className="px-4 py-2 text-right">획득 기록</th>
                  <th className="px-4 py-2 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {list.sort((a, b) => b.totalPoints - a.totalPoints).map((s) => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{s.studentNumber ?? "-"}</td>
                    <td className="px-4 py-2 font-bold text-gray-800">{s.name}</td>
                    <td className="px-4 py-2 text-right font-black text-indigo-600">{s.totalPoints}점</td>
                    <td className="px-4 py-2 text-right text-gray-400 text-xs">{s._count.pointLogs}회</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline"
                        onClick={() => { setTarget(s); setDelta(0); setReason(""); }}>
                        수정
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* 수정 다이얼로그 */}
      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent className="max-w-sm">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>{target.name} 포인트 수정</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">현재 누적</p>
                  <p className="text-2xl font-black text-indigo-600">{target.totalPoints}점</p>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600">변경 점수 (양수=지급, 음수=회수)</Label>
                  <Input type="number" value={delta || ""} onChange={(e) => setDelta(parseInt(e.target.value) || 0)}
                    placeholder="예: 10 또는 -5" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-600">사유 (선택)</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="예: 수업 중 좋은 질문" className="mt-1" />
                </div>
                {delta !== 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <p className="text-xs text-indigo-500">변경 후 누적</p>
                    <p className="text-xl font-black text-indigo-700">
                      {Math.max(0, target.totalPoints + delta)}점
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setTarget(null)}>취소</Button>
                <Button onClick={submit} disabled={delta === 0 || saving}>
                  {saving ? "저장 중..." : delta >= 0 ? "지급" : "회수"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
