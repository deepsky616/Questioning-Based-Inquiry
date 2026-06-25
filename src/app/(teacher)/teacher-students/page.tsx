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
import { GAME_LABEL, pointBonusLabel } from "@/lib/points-policy";
import { PageHeader } from "@/components/shared/PageHeader";
import { StudentBulkRegisterCard } from "@/components/teacher/StudentBulkRegisterCard";
import { StudentPasswordResetCard } from "@/components/teacher/StudentPasswordResetCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import { useTranslations, useLocale } from "next-intl";

/** ISO 날짜 → "오늘 / N일 전 / -" */
function lastActiveLabel(iso?: string | null): { key: "today" | "yesterday" | "daysAgo" | "monthsAgo" | "yearsAgo"; v: Record<string, number> } | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return { key: "today", v: {} };
  if (d === 1) return { key: "yesterday", v: {} };
  if (d < 30) return { key: "daysAgo", v: { d } };
  if (d < 365) return { key: "monthsAgo", v: { m: Math.floor(d / 30) } };
  return { key: "yearsAgo", v: { y: Math.floor(d / 365) } };
}

/* ─── 타입 ─── */
interface Student {
  id: string; name: string; grade: string; className: string;
  studentNumber: string; school: string;
  questionCount: number; commentCount: number; pointLogCount: number; totalPoints: number;
  lastActivityAt?: string | null;
}
interface TeacherClass { grade: string; className: string }

interface RawEvent { type: "question" | "comment" | "point"; createdAt: string; weight: number }
interface PointLogItem { id: string; createdAt: string; points: number; gameId: string; bonusType: string; reason: string }
interface QuestionItem { id: string; createdAt: string; content: string; closure: string; cognitive: string }
interface CommentItem { id: string; createdAt: string; content: string }
interface ClassificationSummary {
  total: number;
  closure: { closed: number; open: number };
  cognitive: { factual: number; conceptual: number; controversial: number };
}
interface StudentStats {
  student: Student & {
    totalPoints: number; questionCount: number; commentCount: number;
    likesReceived: number; commentsReceived: number; goodQuestions: number; gamePlays: number;
  };
  classification: ClassificationSummary;
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

function bucketLabel(key: string, period: Period, locale: string): string {
  if (period === "dow") {
    const idx = parseInt(key);
    if (Number.isNaN(idx)) return key;
    // 2024-01-07 = 일요일 기준
    return new Date(2024, 0, 7 + idx).toLocaleDateString(locale, { weekday: "short" });
  }
  if (period === "month") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(locale, { month: "short" });
  }
  if (period === "week") return "W" + key.slice(-2);
  return key;
}

/* 결손 슬롯을 채워 정렬된 시리즈 반환 */
function buildSeries(events: RawEvent[], period: Period, locale: string): Array<{ key: string; label: string; question: number; comment: number; point: number }> {
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
    label: bucketLabel(k, period, locale),
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
              <div className="text-xs font-bold text-muted-foreground h-4">
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
      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
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
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const locale = useLocale();
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
    () => (stats ? buildSeries(stats.events, period, locale) : []),
    [stats, period, locale]
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{student.name}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {buildTeacherClassLabel(student.grade, student.className)} · {t("numberSuffix", { n: student.studentNumber })}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 누적 통계 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/30 p-3 text-center">
            <p className="text-xs text-indigo-500 font-medium">{t("totalQuestions")}</p>
            <p className="text-2xl font-black text-indigo-700">
              {stats?.student.questionCount ?? student.questionCount}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-500/30 p-3 text-center">
            <p className="text-xs text-emerald-500 font-medium">{t("totalAnswers")}</p>
            <p className="text-2xl font-black text-emerald-700">
              {stats?.student.commentCount ?? student.commentCount}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-500/30 p-3 text-center">
            <p className="text-xs text-amber-500 font-medium">{t("totalPoints")}</p>
            <p className="text-2xl font-black text-amber-700">
              {stats?.student.totalPoints ?? student.totalPoints}
            </p>
          </div>
        </div>

        {/* 받은 호응 + 좋은 질문 + 질문놀이 참여 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-500/30 p-3 text-center">
            <p className="text-xs text-rose-500 font-medium">{t("receivedLikes")}</p>
            <p className="text-2xl font-black text-rose-600">{stats?.student.likesReceived ?? "-"}</p>
          </div>
          <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-500/30 p-3 text-center">
            <p className="text-xs text-sky-500 font-medium">{t("receivedAnswers")}</p>
            <p className="text-2xl font-black text-sky-600">{stats?.student.commentsReceived ?? "-"}</p>
          </div>
          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-500/30 p-3 text-center">
            <p className="text-xs text-violet-500 font-medium">{t("goodQuestions")}</p>
            <p className="text-2xl font-black text-violet-600">{stats?.student.goodQuestions ?? "-"}</p>
          </div>
          <div className="rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-500/30 p-3 text-center">
            <p className="text-xs text-teal-500 font-medium">{t("gamePlays")}</p>
            <p className="text-2xl font-black text-teal-600">{stats?.student.gamePlays ?? "-"}</p>
          </div>
        </div>

        {/* 질문 분류 분포 */}
        {stats && stats.classification.total > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-bold text-foreground mb-3">{t("distTitle")}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <ClassificationDonut
                  size={104}
                  slices={[
                    { name: tCls("closed.label"), value: stats.classification.closure.closed, fill: "#3b82f6" },
                    { name: tCls("open.label"), value: stats.classification.closure.open, fill: "#10b981" },
                  ]}
                />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground">{tCls("category1")}</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />{tCls("closed.label")} {stats.classification.closure.closed}</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />{tCls("open.label")} {stats.classification.closure.open}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ClassificationDonut
                  size={104}
                  slices={[
                    { name: tCls("factual.label"), value: stats.classification.cognitive.factual, fill: "#94a3b8" },
                    { name: tCls("conceptual.label"), value: stats.classification.cognitive.conceptual, fill: "#a855f7" },
                    { name: tCls("controversial.label"), value: stats.classification.cognitive.controversial, fill: "#f97316" },
                  ]}
                />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground">{tCls("category2")}</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5" />{tCls("factual.label")} {stats.classification.cognitive.factual}</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1.5" />{tCls("conceptual.label")} {stats.classification.cognitive.conceptual}</p>
                  <p><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1.5" />{tCls("controversial.label")} {stats.classification.cognitive.controversial}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 기간/지표 토글 + 차트 */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
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
                  {p === "month" ? t("periodMonth") : p === "week" ? t("periodWeek") : t("periodDow")}
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
                  {t(m === "question" ? "metricQuestion" : m === "comment" ? "metricComment" : "metricPoint")}
                </button>
              ))}
            </div>
          </div>

          {!stats ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">{t("loading")}</div>
          ) : (
            <BarChart data={series} metric={metric} />
          )}
        </div>

        {/* 최근 활동 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-3">
              <h4 className="text-xs font-black text-indigo-600 mb-2">{t("recentQuestions")}</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.recentQuestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : stats.recentQuestions.map((q) => (
                  <div key={q.id} className="text-xs text-foreground truncate">{q.content}</div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <h4 className="text-xs font-black text-emerald-600 mb-2">{t("recentAnswers")}</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.recentComments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : stats.recentComments.map((c) => (
                  <div key={c.id} className="text-xs text-foreground truncate">{c.content}</div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <h4 className="text-xs font-black text-amber-600 mb-2">{t("recentPoints")}</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.recentPoints.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : stats.recentPoints.map((p) => {
                  const b = pointBonusLabel(p.bonusType);
                  const game = GAME_LABEL[p.gameId];
                  // instance:<UUID>는 중복 지급 방지용 내부 키이므로 표시하지 않는다
                  const showReason = p.reason && p.reason !== b.label && !p.reason.startsWith("instance:");
                  return (
                    <div key={p.id} className="text-xs flex items-center gap-1.5 text-foreground">
                      <span className="shrink-0">{b.emoji}</span>
                      <span className="font-medium shrink-0">{b.label}</span>
                      {game && <span className="text-muted-foreground shrink-0">· {game}</span>}
                      {showReason && <span className="text-muted-foreground truncate flex-1 min-w-0">· {p.reason}</span>}
                      <span className={`font-bold shrink-0 ${!showReason ? "ml-1" : ""} ${p.points >= 0 ? "text-indigo-600" : "text-red-500"}`}>
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
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 space-y-3">
          <h3 className="font-black text-amber-700 text-sm">{t("pointManual")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-amber-700 font-bold">{t("scoreLabel")}</Label>
              <Input type="number" value={delta || ""}
                onChange={(e) => setDelta(parseInt(e.target.value) || 0)}
                placeholder={t("scorePlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-amber-700 font-bold">{t("reasonLabel")}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")} className="mt-1" />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={delta === 0 || saving}
            onClick={submitPoints}>
            {saving ? t("processing") : delta >= 0 ? t("give", { n: delta }) : t("take", { n: Math.abs(delta) })}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 메인 페이지 ─── */
export default function StudentsPage() {
  const tPages = useTranslations("pages");
  const t = useTranslations("students");
  const tSet = useTranslations("settings");
  const [mgmtTab, setMgmtTab] = useState<"list" | "bulk" | "reset">("list");
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
      <PageHeader title={tPages("teacherStudents.title")} description={tPages("teacherStudents.description")} />

      {/* 학생 현황 / 일괄 등록 / 비밀번호 재설정 탭 */}
      <div className="flex w-fit rounded-md border overflow-hidden">
        {([
          ["list", t("tabList")],
          ["bulk", tSet("tabBulk")],
          ["reset", tSet("tabReset")],
        ] as const).map(([v, label], i) => (
          <button
            key={v}
            type="button"
            onClick={() => setMgmtTab(v)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
              mgmtTab === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mgmtTab === "bulk" && <StudentBulkRegisterCard />}
      {mgmtTab === "reset" && (
        <Card>
          <CardContent className="pt-6">
            <StudentPasswordResetCard embedded />
          </CardContent>
        </Card>
      )}

      {mgmtTab === "list" && (
      <>
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-muted/40 border border-border p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">{t("allStudents")}</p>
          <p className="text-2xl font-black text-foreground mt-1">{t("studentCount", { n: students.length })}</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/30 p-4 text-center">
          <p className="text-xs text-indigo-500 font-medium">{t("totalQuestions")}</p>
          <p className="text-2xl font-black text-indigo-700 mt-1">{totalQ}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-500/30 p-4 text-center">
          <p className="text-xs text-emerald-500 font-medium">{t("totalAnswers")}</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{totalC}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-500/30 p-4 text-center">
          <p className="text-xs text-amber-500 font-medium">{t("totalPointsAvg")}</p>
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
                : "bg-card text-muted-foreground border-border hover:border-indigo-300"
            }`}>
            {t("filterAll")}
          </button>
          {teacherClasses.map((tc) => {
            const key = `${tc.grade}-${tc.className}`;
            return (
              <button key={key}
                onClick={() => setFilterClass(filterClass === key ? "all" : key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterClass === key
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100"
                }`}>
                {buildTeacherClassLabel(tc.grade, tc.className)}
              </button>
            );
          })}
        </div>
      )}

      {/* 검색 */}
      <Input
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">{t("loading")}</div>
      ) : students.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState icon="🧑‍🏫" title={t("emptyTitle")} description={t("emptyDesc")} />
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-0">
          <EmptyState icon="🔍" title={t("noResultTitle")} description={t("noResultDesc")} />
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
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("classTotal", { n: classStudents.length })}
                  </span>
                </CardTitle>
                <CardDescription>
                  {t("classSummary", { q: qSum, c: cSum, p: pSum })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center whitespace-nowrap">{t("colNumber")}</TableHead>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colQuestion")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colAnswer")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colPoint")}</TableHead>
                      <TableHead className="text-center w-28 whitespace-nowrap hidden sm:table-cell">{t("colLastActive")}</TableHead>
                      <TableHead className="text-center w-20 whitespace-nowrap">{t("colDetail")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classStudents.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelected(s)}>
                        <TableCell className="text-center text-muted-foreground">{s.studentNumber}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${s.questionCount > 0 ? "text-indigo-600" : "text-muted-foreground"}`}>
                            {s.questionCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${s.commentCount > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {s.commentCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${s.totalPoints > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {s.totalPoints}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                          {(() => { const r = lastActiveLabel(s.lastActivityAt); return r ? t(r.key, r.v) : "-"; })()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline"
                            onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
                            {t("detailBtn")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          );
        })
      )}
      </>
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
