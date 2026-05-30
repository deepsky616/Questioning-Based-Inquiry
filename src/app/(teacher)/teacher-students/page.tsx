"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { buildTeacherClassLabel } from "@/lib/teacher";
import { AI_BONUS_TYPES, BonusKey, GAME_LABEL } from "@/lib/points-policy";

/* ─── 타입 ─── */
interface Student {
  id: string; name: string; grade: string; className: string;
  studentNumber: string; school: string;
  questionCount: number; commentCount: number; pointLogCount: number; totalPoints: number;
}
interface TeacherClass { grade: string; className: string }

interface RawEvent { type: "question" | "comment" | "point"; createdAt: string; weight: number }
interface PointLogItem { id: string; createdAt: string; points: number; gameId: string; bonusType: string; reason: string }
interface QuestionItem { id: string; createdAt: string; content: string; closure: string; cognitive: string }
interface CommentItem { id: string; createdAt: string; content: string }
interface StudentStats {
  student: Student & { totalPoints: number; questionCount: number; commentCount: number };
  events: RawEvent[];
  recentQuestions: QuestionItem[];
  recentComments: CommentItem[];
  recentPoints: PointLogItem[];
}

type Period = "month" | "week" | "dow";
type Metric = "question" | "comment" | "point";

/* ─── 기간 집계 헬퍼 ─── */
function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function bucketKey(date: Date, period: Period): string {
  if (period === "month") return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  if (period === "week") {
    const { year, week } = isoWeek(date);
    return `${year}-W${pad(week)}`;
  }
  return String(date.getDay()); // 0~6
}

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function bucketLabel(key: string, period: Period): string {
  if (period === "dow") return DOW_LABELS[parseInt(key)] ?? key;
  if (period === "month") return key.slice(5) + "월";
  if (period === "week") return "W" + key.slice(-2);
  return key;
}

/* 결손 슬롯을 채워 정렬된 시리즈 반환 */
function buildSeries(events: RawEvent[], period: Period): Array<{ key: string; label: string; question: number; comment: number; point: number }> {
  const map: Record<string, { question: number; comment: number; point: number }> = {};
  for (const ev of events) {
    const d = new Date(ev.createdAt);
    const k = bucketKey(d, period);
    if (!map[k]) map[k] = { question: 0, comment: 0, point: 0 };
    if (ev.type === "question") map[k].question += 1;
    else if (ev.type === "comment") map[k].comment += 1;
    else if (ev.type === "point") map[k].point += ev.weight;
  }

  let keys: string[];
  if (period === "dow") {
    keys = ["0", "1", "2", "3", "4", "5", "6"];
  } else if (period === "month") {
    // 최근 6개월
    keys = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }
  } else {
    // 최근 8주
    keys = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const { year, week } = isoWeek(d);
      keys.push(`${year}-W${pad(week)}`);
    }
  }

  return keys.map((k) => ({
    key: k,
    label: bucketLabel(k, period),
    question: map[k]?.question ?? 0,
    comment: map[k]?.comment ?? 0,
    point: map[k]?.point ?? 0,
  }));
}

/* ─── 막대 차트 컴포넌트 ─── */
const METRIC_COLOR: Record<Metric, string> = {
  question: "#6366f1",
  comment: "#10b981",
  point: "#f59e0b",
};
const METRIC_LABEL: Record<Metric, string> = {
  question: "질문 수",
  comment: "답변 수",
  point: "포인트",
};

function BarChart({
  data, metric,
}: { data: ReturnType<typeof buildSeries>; metric: Metric }) {
  const values = data.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const color = METRIC_COLOR[metric];
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-1 h-40 px-1">
        {data.map((d) => {
          const v = d[metric];
          const h = max === 0 ? 0 : (v / max) * 100;
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="text-xs font-bold text-gray-600 h-4">
                {v > 0 ? v : ""}
              </div>
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${h}%`,
                  background: color,
                  minHeight: v > 0 ? "4px" : "0",
                  opacity: v > 0 ? 1 : 0.15,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 px-1">
        {data.map((d) => (
          <div key={d.key} className="flex-1 text-center truncate">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

/* ─── 학생 상세 다이얼로그 ─── */
function StudentDetailDialog({
  student, onClose, onChanged,
}: { student: Student; onClose: () => void; onChanged: () => void }) {
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [metric, setMetric] = useState<Metric>("question");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/teacher/students/${student.id}/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, [student.id]);

  const series = useMemo(
    () => (stats ? buildSeries(stats.events, period) : []),
    [stats, period]
  );

  async function submitPoints() {
    if (delta === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, points: delta, reason }),
      });
      if (res.ok) {
        setDelta(0); setReason("");
        // stats 재조회
        const refreshed = await fetch(`/api/teacher/students/${student.id}/stats`).then((r) => r.json());
        setStats(refreshed);
        onChanged();
      }
    } catch {} finally { setSaving(false); }
  }

  function bonusLabel(bonusType: string): { label: string; emoji: string } {
    if (bonusType in AI_BONUS_TYPES) {
      const def = AI_BONUS_TYPES[bonusType as BonusKey];
      return { label: def.label, emoji: def.emoji };
    }
    if (bonusType === "PARTICIPATION") return { label: "참여", emoji: "✋" };
    if (bonusType === "VALID_QUESTIONS") return { label: "유효 질문", emoji: "❓" };
    if (bonusType === "COMPLETION") return { label: "완료", emoji: "✅" };
    if (bonusType === "WINNER") return { label: "우승", emoji: "👑" };
    if (bonusType === "TEACHER_GRANT") return { label: "교사 지급", emoji: "🎁" };
    if (bonusType === "TEACHER_REVOKE") return { label: "교사 회수", emoji: "↩️" };
    return { label: bonusType, emoji: "🎯" };
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{student.name}</span>
            <span className="text-sm font-normal text-gray-500">
              {buildTeacherClassLabel(student.grade, student.className)} · {student.studentNumber}번
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 누적 통계 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-center">
            <p className="text-xs text-indigo-500 font-medium">총 질문</p>
            <p className="text-2xl font-black text-indigo-700">
              {stats?.student.questionCount ?? student.questionCount}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
            <p className="text-xs text-emerald-500 font-medium">총 답변</p>
            <p className="text-2xl font-black text-emerald-700">
              {stats?.student.commentCount ?? student.commentCount}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
            <p className="text-xs text-amber-500 font-medium">총 포인트</p>
            <p className="text-2xl font-black text-amber-700">
              {stats?.student.totalPoints ?? student.totalPoints}
            </p>
          </div>
        </div>

        {/* 기간/지표 토글 + 차트 */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {(["month", "week", "dow"] as Period[]).map((p) => (
                <button key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1 text-xs font-bold rounded-lg transition-colors"
                  style={{
                    background: period === p ? "#4f46e5" : "#f3f4f6",
                    color: period === p ? "white" : "#374151",
                  }}>
                  {p === "month" ? "월별" : p === "week" ? "주별" : "요일별"}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["question", "comment", "point"] as Metric[]).map((m) => (
                <button key={m}
                  onClick={() => setMetric(m)}
                  className="px-3 py-1 text-xs font-bold rounded-lg transition-colors"
                  style={{
                    background: metric === m ? METRIC_COLOR[m] : "#f3f4f6",
                    color: metric === m ? "white" : "#374151",
                  }}>
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {!stats ? (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>
          ) : (
            <BarChart data={series} metric={metric} />
          )}
        </div>

        {/* 최근 활동 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <h4 className="text-xs font-black text-indigo-600 mb-2">📝 최근 질문</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.recentQuestions.length === 0 ? (
                  <p className="text-xs text-gray-400">없음</p>
                ) : stats.recentQuestions.map((q) => (
                  <div key={q.id} className="text-xs text-gray-700 truncate">{q.content}</div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <h4 className="text-xs font-black text-emerald-600 mb-2">💬 최근 답변</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.recentComments.length === 0 ? (
                  <p className="text-xs text-gray-400">없음</p>
                ) : stats.recentComments.map((c) => (
                  <div key={c.id} className="text-xs text-gray-700 truncate">{c.content}</div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <h4 className="text-xs font-black text-amber-600 mb-2">🏆 최근 포인트</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.recentPoints.length === 0 ? (
                  <p className="text-xs text-gray-400">없음</p>
                ) : stats.recentPoints.map((p) => {
                  const b = bonusLabel(p.bonusType);
                  return (
                    <div key={p.id} className="text-xs flex items-center gap-1 text-gray-700">
                      <span>{b.emoji}</span>
                      <span className="truncate flex-1">
                        {b.label} · {GAME_LABEL[p.gameId] ?? p.gameId}
                      </span>
                      <span className={`font-bold ${p.points >= 0 ? "text-indigo-600" : "text-red-500"}`}>
                        {p.points > 0 ? `+${p.points}` : p.points}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 포인트 수동 지급/회수 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="font-black text-amber-700 text-sm">🎁 포인트 수동 지급 / 회수</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-amber-700 font-bold">점수 (음수=회수)</Label>
              <Input type="number" value={delta || ""}
                onChange={(e) => setDelta(parseInt(e.target.value) || 0)}
                placeholder="예: 10 또는 -5" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-amber-700 font-bold">사유 (선택)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="예: 수업 중 좋은 질문" className="mt-1" />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={delta === 0 || saving}
            onClick={submitPoints}>
            {saving ? "처리 중..." : delta >= 0 ? `${delta}점 지급` : `${Math.abs(delta)}점 회수`}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 메인 페이지 ─── */
export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [selected, setSelected] = useState<Student | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    fetch("/api/teacher/students")
      .then((r) => r.json())
      .then((data) => {
        setStudents(data.students ?? []);
        setTeacherClasses(data.teacherClasses ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const normalizedSearch = search.trim().replace(/학년|반/g, "").trim();

  const filtered = students.filter((s) => {
    const matchSearch =
      normalizedSearch === "" ||
      s.name.includes(normalizedSearch) ||
      s.grade.includes(normalizedSearch) ||
      s.className.includes(normalizedSearch);
    const matchClass =
      filterClass === "all" ||
      `${s.grade}-${s.className}` === filterClass;
    return matchSearch && matchClass;
  });

  const grouped = filtered.reduce<Record<string, Student[]>>((acc, s) => {
    const key = buildTeacherClassLabel(s.grade, s.className);
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  // 전체 통계
  const totalQ = students.reduce((a, b) => a + b.questionCount, 0);
  const totalC = students.reduce((a, b) => a + b.commentCount, 0);
  const totalP = students.reduce((a, b) => a + b.totalPoints, 0);
  const avgP = students.length === 0 ? 0 : Math.round(totalP / students.length);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">학생 관리</h2>
        <p className="text-gray-600">담당 학생의 질문·답변·포인트 활동을 한눈에 확인하세요</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500 font-medium">전체 학생</p>
          <p className="text-2xl font-black text-gray-800 mt-1">{students.length}명</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-center">
          <p className="text-xs text-indigo-500 font-medium">총 질문</p>
          <p className="text-2xl font-black text-indigo-700 mt-1">{totalQ}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-center">
          <p className="text-xs text-emerald-500 font-medium">총 답변</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{totalC}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
          <p className="text-xs text-amber-500 font-medium">총 포인트 / 평균</p>
          <p className="text-2xl font-black text-amber-700 mt-1">
            {totalP}<span className="text-sm font-normal text-amber-500 ml-1">/ {avgP}</span>
          </p>
        </div>
      </div>

      {/* 학급 필터 */}
      {teacherClasses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterClass("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterClass === "all"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}>
            전체
          </button>
          {teacherClasses.map((tc) => {
            const key = `${tc.grade}-${tc.className}`;
            return (
              <button key={key}
                onClick={() => setFilterClass(filterClass === key ? "all" : key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterClass === key
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                }`}>
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
        <Card><CardContent className="py-12 text-center text-gray-500">
          <p className="font-medium mb-1">등록된 학생이 없습니다</p>
          <p className="text-sm text-gray-400">같은 학교·학년·반 학생이 회원가입하면 표시됩니다</p>
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">
          <p className="font-medium mb-1">검색 결과가 없습니다</p>
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
                  <span className="text-sm font-normal text-gray-500">
                    {classStudents.length}명
                  </span>
                </CardTitle>
                <CardDescription>
                  질문 {qSum} · 답변 {cSum} · 포인트 {pSum}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">번호</TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead className="text-right">질문</TableHead>
                      <TableHead className="text-right">답변</TableHead>
                      <TableHead className="text-right">포인트</TableHead>
                      <TableHead className="text-right w-20">상세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classStudents.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelected(s)}>
                        <TableCell className="text-gray-500">{s.studentNumber}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${s.questionCount > 0 ? "text-indigo-600" : "text-gray-400"}`}>
                            {s.questionCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${s.commentCount > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                            {s.commentCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${s.totalPoints > 0 ? "text-amber-600" : "text-gray-400"}`}>
                            {s.totalPoints}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline"
                            onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
                            상세
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}

      {selected && (
        <StudentDetailDialog
          student={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
