"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";
import { formatShortDateTime } from "@/lib/datetime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
interface PendingPointItem { id: string; studentId: string; sessionId: string | null; bonusType: string; points: number; reason: string }
interface QuestionItem {
  id: string; createdAt: string; content: string; closure: string; cognitive: string;
  _count?: { likes: number; comments: number };
}
interface CommentItem { id: string; createdAt: string; content: string; question?: { content: string } }
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

const EMPTY_STUDENTS: Student[] = [];
const EMPTY_TEACHER_CLASSES: TeacherClass[] = [];

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
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [metric, setMetric] = useState<Metric>("question");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  // 최근 활동 탭(질문/답변/포인트) — 폭 전체를 써서 내용을 읽을 수 있게
  const [activityTab, setActivityTab] = useState<"questions" | "answers" | "points">("questions");
  // 항목에서 '지급' 클릭 → 사유 자동 채움 + 점수 입력 포커스
  const deltaInputRef = useRef<HTMLInputElement>(null);
  const fillReasonFrom = (prefix: string, content: string) => {
    const snippet = content.length > 40 ? `${content.slice(0, 40)}...` : content;
    setReason(`${prefix}: ${snippet}`);
    deltaInputRef.current?.focus();
    deltaInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const [saving, setSaving] = useState(false);

  // 학생 상세 통계(질문·댓글·포인트)는 react-query로 주기 폴링(12초)+포커스 재조회.
  const { data: stats = null } = useQuery<StudentStats>({
    queryKey: ["student-stats", student.id],
    queryFn: async () => {
      const r = await fetch(`/api/teacher/students/${student.id}/stats`);
      if (!r.ok) throw new Error("failed to load student stats");
      return r.json();
    },
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });
  const { data: pendingAiPoints = [] } = useQuery<PendingPointItem[]>({
    queryKey: ["student-pending-ai-points", student.id],
    queryFn: async () => {
      const r = await fetch("/api/teacher/points/pending");
      if (!r.ok) return [];
      const d = await r.json();
      const rows = Array.isArray(d.pending) ? d.pending : [];
      return rows.filter((p: PendingPointItem) => p.studentId === student.id);
    },
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

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
        // 포인트 부여 후 상세 통계·목록 캐시 무효화(폴링과 무관하게 즉시 최신화)
        await queryClient.invalidateQueries({ queryKey: ["student-stats", student.id] });
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

        {pendingAiPoints.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold">{t("pendingAiTitle", { count: pendingAiPoints.length })}</p>
              <Link
                href={`/teacher-questions?tab=review&studentId=${student.id}`}
                className="inline-flex h-8 items-center justify-center rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
              >
                {t("pendingAiAction")}
              </Link>
            </div>
            <p className="mt-1 text-xs">{t("pendingAiDesc")}</p>
          </div>
        )}

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

        {/* 최근 활동 — 탭 전환으로 폭 전체 사용(포인트 판단 근거를 읽을 수 있게) */}
        {stats && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <div className="flex rounded-md border overflow-hidden w-fit">
              {([
                ["questions", t("recentQuestions"), stats.recentQuestions.length],
                ["answers", t("recentAnswers"), stats.recentComments.length],
                ["points", t("recentPoints"), stats.recentPoints.length],
              ] as const).map(([key, label, count], i) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityTab(key)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${i > 0 ? "border-l" : ""} ${
                    activityTab === key ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>

            {activityTab === "questions" && (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {stats.recentQuestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : stats.recentQuestions.map((q) => (
                  <div key={q.id} className="rounded-lg border bg-background p-2.5">
                    <p className="text-sm text-foreground leading-snug line-clamp-2">{q.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className={`px-1.5 py-0.5 rounded break-keep ${CLOSURE_STYLE[q.closure] ?? "bg-muted"}`}>{CLOSURE_LABEL[q.closure] ?? q.closure}</span>
                      <span className={`px-1.5 py-0.5 rounded break-keep ${COGNITIVE_STYLE[q.cognitive] ?? "bg-muted"}`}>{COGNITIVE_LABEL[q.cognitive] ?? q.cognitive}</span>
                      <span>❤️ {q._count?.likes ?? 0}</span>
                      <span>💬 {q._count?.comments ?? 0}</span>
                      <span className="inline-flex items-center gap-0.5">🕒 {formatShortDateTime(q.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => fillReasonFrom(t("reasonQuestionPrefix"), q.content)}
                        className="ml-auto rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        {t("awardFromItem")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activityTab === "answers" && (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {stats.recentComments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : stats.recentComments.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-background p-2.5">
                    <p className="text-sm text-foreground leading-snug line-clamp-2">{c.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {c.question?.content && (
                        <span className="max-w-[55%] truncate">↳ {c.question.content}</span>
                      )}
                      <span className="inline-flex items-center gap-0.5">🕒 {formatShortDateTime(c.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => fillReasonFrom(t("reasonAnswerPrefix"), c.content)}
                        className="ml-auto rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        {t("awardFromItem")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activityTab === "points" && (
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
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
            )}
          </div>
        )}

        {/* 포인트 수동 지급/회수 */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 space-y-3">
          <h3 className="font-black text-amber-700 text-sm">{t("pointManual")}</h3>
          {/* 빠른 지급 프리셋 — 칩 두 번으로 지급 완료 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[1, 3, 5, -1, -3].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDelta(v)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors ${
                  delta === v
                    ? v >= 0 ? "border-indigo-500 bg-indigo-600 text-white" : "border-red-400 bg-red-500 text-white"
                    : v >= 0 ? "border-amber-300 bg-white text-amber-700 hover:bg-amber-100 dark:bg-transparent dark:text-amber-300" : "border-red-200 bg-white text-red-500 hover:bg-red-50 dark:bg-transparent"
                }`}
              >
                {v > 0 ? `+${v}` : v}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-amber-300/60" aria-hidden />
            {([
              t("presetGoodQuestion"),
              t("presetKindAnswer"),
              t("presetParticipation"),
              t("presetRuleViolation"),
            ] as string[]).map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setReason(label)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  reason === label
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-amber-300 bg-white text-amber-700 hover:bg-amber-100 dark:bg-transparent dark:text-amber-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-amber-700 font-bold">{t("scoreLabel")}</Label>
              <Input ref={deltaInputRef} type="number" value={delta || ""}
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [mgmtTab, setMgmtTab] = useState<"list" | "bulk" | "reset">("list");
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [selected, setSelected] = useState<Student | null>(null);

  // 학생 목록(질문수·댓글수·포인트 집계)은 react-query로 주기 폴링(12초)+포커스 재조회.
  const { data, isLoading } = useQuery<{ students: Student[]; teacherClasses: TeacherClass[] }>({
    queryKey: ["teacher-student-list"],
    queryFn: async () => {
      const r = await fetch("/api/teacher/students");
      if (!r.ok) throw new Error("failed to load students");
      return r.json();
    },
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });
  const students = data?.students ?? EMPTY_STUDENTS;
  const teacherClasses = data?.teacherClasses ?? EMPTY_TEACHER_CLASSES;
  const refetchList = () => queryClient.invalidateQueries({ queryKey: ["teacher-student-list"] });

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
  const selectedStudentId = searchParams.get("studentId");

  useEffect(() => {
    if (!selectedStudentId || students.length === 0) return;
    const target = students.find((s) => s.id === selectedStudentId);
    if (target) {
      setSelected(target);
      setMgmtTab("list");
    }
  }, [selectedStudentId, students]);

  const closeSelected = () => {
    setSelected(null);
    if (selectedStudentId) router.replace("/teacher-students");
  };

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
                <div className="space-y-2 lg:hidden">
                  {classStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(s)}
                      className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.studentNumber ? t("numberSuffix", { n: s.studentNumber }) : "-"}
                            {" · "}
                            {(() => { const r = lastActiveLabel(s.lastActivityAt); return r ? t(r.key, r.v) : "-"; })()}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
                          {t("detailBtn")}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colQuestion")}</p>
                          <p className={`text-sm font-semibold ${s.questionCount > 0 ? "text-indigo-600" : "text-muted-foreground"}`}>{s.questionCount}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colAnswer")}</p>
                          <p className={`text-sm font-semibold ${s.commentCount > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{s.commentCount}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{t("colPoint")}</p>
                          <p className={`text-sm font-semibold ${s.totalPoints > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{s.totalPoints}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="hidden overflow-x-auto lg:block"><Table>
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
          onClose={closeSelected}
          onChanged={refetchList}
        />
      )}
    </div>
  );
}
