"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/shared/theme-provider";
import type { ReportRange, SeriesPoint, ReportTotals } from "@/lib/report-stats";
import type { QuestionTypeSummary } from "@/lib/stats-calc";
import { EmptyState } from "@/components/shared/EmptyState";

export interface PerStudentRow {
  id: string;
  name: string;
  studentNumber?: string | null;
  questions: number;
  likesGiven: number;
  comments: number;
}

export interface SessionMeta { id: string; date: string; subject: string; topic: string }
export interface SessionAnalysisResult {
  summary?: string;
  insights?: string;
  commentInsights?: string;
  engagementInsights?: string;
  relevanceInsights?: string;
  // 교사 전체 세션
  balanceInsights?: string;
  bestQuestion?: string;
  nextQuestions?: string;
  // 학생 본인
  growthInsights?: string;
  rewriteExample?: string;
}

export interface ReportViewProps {
  scope: "student" | "class";
  title: string;
  subtitle?: string;
  totals: ReportTotals;
  weekly: SeriesPoint[];
  monthly: SeriesPoint[];
  classification: QuestionTypeSummary;
  perStudent?: PerStudentRow[];
  sessions?: SessionMeta[];
  analyzeSession?: (sessionId: string) => Promise<SessionAnalysisResult | null>;
  // 추세 차트 부제(관점에 따라 다르게). 기본은 학생 본인 관점.
  participationLabel?: string;
  receptionLabel?: string;
}

const METRICS: { key: keyof SeriesPoint; label: string; color: string }[] = [
  { key: "questions", label: "질문 작성", color: "#6366f1" },
  { key: "likesGiven", label: "좋아요 누름", color: "#f43f5e" },
  { key: "comments", label: "댓글 작성", color: "#10b981" },
];
const RECEIVED: { key: keyof SeriesPoint; label: string; color: string }[] = [
  { key: "likesReceived", label: "받은 좋아요", color: "#f59e0b" },
  { key: "commentsReceived", label: "받은 댓글", color: "#8b5cf6" },
];
// 분류 추세(누적 막대) — 분류1/분류2를 기간별로 쌓는다. 색은 분류 통계 카드와 동일.
const CLOSURE_TREND: { key: keyof SeriesPoint; label: string; color: string }[] = [
  { key: "closed", label: "폐쇄형", color: "#3b82f6" },
  { key: "open", label: "개방형", color: "#10b981" },
];
const COGNITIVE_TREND: { key: keyof SeriesPoint; label: string; color: string }[] = [
  { key: "factual", label: "사실적", color: "#94a3b8" },
  { key: "conceptual", label: "개념적", color: "#a855f7" },
  { key: "controversial", label: "논쟁적", color: "#f97316" },
];

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function mondayOf(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
/** 세션 날짜를 주/월 기간 키·라벨로 변환 */
function sessionPeriod(dateStr: string, mode: ReportRange): { key: string; label: string } {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { key: "기타", label: "기타" };
  if (mode === "month") {
    return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월` };
  }
  const m = mondayOf(d);
  const end = new Date(m); end.setDate(end.getDate() + 6);
  return {
    key: `${m.getFullYear()}-${pad2(m.getMonth() + 1)}-${pad2(m.getDate())}`,
    label: `${m.getMonth() + 1}/${m.getDate()}~${end.getMonth() + 1}/${end.getDate()} 주`,
  };
}

export function ReportView({
  scope, title, subtitle, totals, weekly, monthly, classification, perStudent, sessions, analyzeSession,
  participationLabel = "내가 만든 활동", receptionLabel = "내 질문이 받은 반응",
}: ReportViewProps) {
  const [range, setRange] = useState<ReportRange>("week");
  const series = range === "week" ? weekly : monthly;

  // 차트 색은 테마에 맞춰(다크 모드에서 그리드·축 라벨·툴팁 가독성 확보)
  const { theme } = useTheme();
  const dark = theme === "dark";
  const chart = {
    grid: dark ? "#374151" : "#e5e7eb",
    tick: dark ? "#9ca3af" : "#6b7280",
  };
  const tooltipStyle = {
    backgroundColor: dark ? "#1f2937" : "#ffffff",
    border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
    borderRadius: 8,
    color: dark ? "#e5e7eb" : "#111827",
    fontSize: 12,
  } as const;
  const tooltipText = dark ? "#e5e7eb" : "#111827";

  const classData = [
    { name: "폐쇄형", value: classification.closure.closed, fill: "#3b82f6" },
    { name: "개방형", value: classification.closure.open, fill: "#10b981" },
    { name: "사실적", value: classification.cognitive.factual, fill: "#94a3b8" },
    { name: "개념적", value: classification.cognitive.conceptual, fill: "#a855f7" },
    { name: "논쟁적", value: classification.cognitive.controversial, fill: "#f97316" },
  ];

  // ── 수업세션별 AI 분석 (기간 필터 + 전체 분석) ──
  const allSessions = useMemo(() => sessions ?? [], [sessions]);
  const [sessRange, setSessRange] = useState<ReportRange>("week");
  const [period, setPeriod] = useState<string>("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [res, setRes] = useState<Record<string, SessionAnalysisResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [analyzingAll, setAnalyzingAll] = useState(false);

  // 기간 목록(세션이 있는 주/월) — 최신순
  const periods = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSessions) {
      const p = sessionPeriod(s.date, sessRange);
      if (!map.has(p.key)) map.set(p.key, p.label);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [allSessions, sessRange]);

  // 주별/월별 전환 시 최신 기간을 기본 선택
  useEffect(() => {
    if (periods.length > 0 && !periods.some(([k]) => k === period)) setPeriod(periods[0][0]);
  }, [periods, period]);

  const filteredSessions = allSessions.filter((s) => sessionPeriod(s.date, sessRange).key === period);

  const analyzeOne = async (id: string) => {
    if (!analyzeSession || res[id] || busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true })); setErrs((e) => ({ ...e, [id]: "" }));
    try {
      const r = await analyzeSession(id);
      if (r) setRes((p) => ({ ...p, [id]: r })); else setErrs((e) => ({ ...e, [id]: "분석 결과가 없어요" }));
    } catch (e) {
      setErrs((x) => ({ ...x, [id]: e instanceof Error ? e.message : "분석 실패" }));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };
  const toggleSession = (id: string) => {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
    if (!res[id]) analyzeOne(id);
  };
  const analyzeAll = async () => {
    if (!analyzeSession) return;
    setAnalyzingAll(true);
    for (const s of filteredSessions) {
      setOpen((o) => ({ ...o, [s.id]: true }));
      if (res[s.id]) continue;
      setBusy((b) => ({ ...b, [s.id]: true })); setErrs((e) => ({ ...e, [s.id]: "" }));
      try {
        const r = await analyzeSession(s.id);
        if (r) setRes((p) => ({ ...p, [s.id]: r }));
      } catch (e) {
        setErrs((x) => ({ ...x, [s.id]: e instanceof Error ? e.message : "분석 실패" }));
      } finally {
        setBusy((b) => ({ ...b, [s.id]: false }));
      }
    }
    setAnalyzingAll(false);
  };

  return (
    <div className="report-print space-y-6">
      {/* 헤더 + 조작(인쇄 시 숨김) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">기준: {new Date().toLocaleDateString("ko-KR")} · 주별 최근 12주 / 월별 최근 6개월</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setRange("week")}
              className={`px-3 py-1.5 text-xs font-medium ${range === "week" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >주별</button>
            <button
              onClick={() => setRange("month")}
              className={`px-3 py-1.5 text-xs font-medium border-l ${range === "month" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >월별</button>
          </div>
          <Button size="sm" onClick={() => window.print()} className="font-semibold">🖨️ 인쇄 · PDF 저장</Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="질문 작성" value={totals.questions} color="#6366f1" />
        <SummaryCard label="좋아요 누름" value={totals.likesGiven} color="#f43f5e" />
        <SummaryCard label="댓글 작성" value={totals.comments} color="#10b981" />
        <SummaryCard label="받은 좋아요" value={totals.likesReceived} color="#f59e0b" />
        <SummaryCard label="받은 댓글" value={totals.commentsReceived} color="#8b5cf6" />
      </div>

      {/* 참여 추세 */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">📈 참여 추세 ({range === "week" ? "주별" : "월별"}) · {participationLabel}</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {METRICS.map((m) => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 호응 추세 */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">💛 호응 추세 ({range === "week" ? "주별" : "월별"}) · {receptionLabel}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {RECEIVED.map((m) => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 분류 안내 (분류 차트 공통 참조) — 색 점은 차트 색과 동일 */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">📚 질문 분류 안내</p>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">분류1 · 질문의 형태</p>
            <ul className="space-y-1 text-xs text-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#3b82f6" }} />
                <span><b className="font-semibold">폐쇄형</b> <span className="text-muted-foreground">정답이 하나로 정해진 질문</span></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#10b981" }} />
                <span><b className="font-semibold">개방형</b> <span className="text-muted-foreground">여러 답이 나올 수 있는 질문</span></span>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">분류2 · 생각의 깊이</p>
            <ul className="space-y-1 text-xs text-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#94a3b8" }} />
                <span><b className="font-semibold">사실적</b> <span className="text-muted-foreground">사실이나 정보를 확인하는 질문</span></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#a855f7" }} />
                <span><b className="font-semibold">개념적</b> <span className="text-muted-foreground">원리와 이유를 생각하는 질문</span></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#f97316" }} />
                <span><b className="font-semibold">논쟁적</b> <span className="text-muted-foreground">내 생각·판단이 필요한 질문</span></span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 질문 분류 분포 */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">📊 질문 분류 분포 · 총 {classification.total}개</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={classData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="name" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Bar dataKey="value" name="질문 수" radius={[4, 4, 0, 0]}>
              {classData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 분류1 추세 (폐쇄형/개방형 누적 막대) */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">📊 분류1 추세 ({range === "week" ? "주별" : "월별"}) · 폐쇄형 / 개방형</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {CLOSURE_TREND.map((m) => (
              <Bar key={m.key} dataKey={m.key} name={m.label} stackId="closure" fill={m.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 분류2 추세 (사실/개념/논쟁 누적 막대) */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">📊 분류2 추세 ({range === "week" ? "주별" : "월별"}) · 사실 / 개념 / 논쟁</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {COGNITIVE_TREND.map((m) => (
              <Bar key={m.key} dataKey={m.key} name={m.label} stackId="cognitive" fill={m.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 수업세션별 AI 분석 (기간 필터 + 전체 분석) */}
      {allSessions.length > 0 && analyzeSession && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-1 text-sm font-bold text-foreground">🤖 수업세션별 AI 분석</p>
          <p className="mb-3 text-xs text-muted-foreground">
            주별/월별 기간을 고르면 그 기간의 수업세션만 보여요. 세션을 펼치면 개별 분석, ‘전체 분석’은 그 기간 세션을 한꺼번에 분석해요
          </p>

          {/* 주별/월별 기간 선택 + 그 기간 일괄 분석 */}
          <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
            <span className="text-xs font-semibold text-foreground">전체 분석</span>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setSessRange("week")}
                className={`px-3 py-1.5 text-xs font-medium ${sessRange === "week" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >주별</button>
              <button
                onClick={() => setSessRange("month")}
                className={`px-3 py-1.5 text-xs font-medium border-l ${sessRange === "month" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >월별</button>
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
            >
              {periods.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Button size="sm" disabled={analyzingAll || filteredSessions.length === 0} onClick={analyzeAll} className="font-semibold">
              {analyzingAll ? "분석 중..." : `📋 전체 분석 (${filteredSessions.length}개)`}
            </Button>
          </div>

          {/* 수업세션별 개별 분석 목록(선택한 주/월의 세션만 표시) */}
          {filteredSessions.length === 0 ? (
            <EmptyState icon="🗓️" title="이 기간에 진행한 수업세션이 없어요" />
          ) : (
          <div className="space-y-2">
            {filteredSessions.map((s) => {
              const r = res[s.id];
              const label = `${s.date} · ${s.subject}${s.topic ? ` - ${s.topic}` : ""}`;
              const blocks: [string, string | undefined][] = [
                ["📌 요약", r?.summary],
                ["⚖️ 질문 유형 균형", r?.balanceInsights],
                ["⭐ 베스트 질문", r?.bestQuestion],
                ["📈 지난 세션 대비 성장", r?.growthInsights],
                ["✍️ 더 좋은 질문으로", r?.rewriteExample],
                ["❤️ 좋아요·참여", r?.engagementInsights],
                ["💬 댓글", r?.commentInsights],
                ["🎯 주제 연관성·성의", r?.relevanceInsights],
                ["➡️ 다음 수업 발문", r?.nextQuestions],
                ["🧭 제안", r?.insights],
              ];
              return (
                <div key={s.id} className="rounded-lg border bg-background">
                  <button onClick={() => toggleSession(s.id)} className="no-print flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                    <span className="truncate text-sm font-medium text-foreground">{label}</span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-600">🤖 {open[s.id] ? "▾" : "▸"}</span>
                  </button>
                  {open[s.id] && (
                    <div className="border-t px-3 py-2 text-sm">
                      {busy[s.id] ? (
                        <p className="text-muted-foreground">🤖 분석하는 중...</p>
                      ) : errs[s.id] ? (
                        <p className="text-red-600">{errs[s.id]}</p>
                      ) : r ? (
                        <div className="space-y-2">
                          {blocks.filter(([, v]) => v).map(([h, v]) => (
                            <div key={h}>
                              <p className="text-xs font-semibold text-foreground">{h}</p>
                              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{v}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* 학생별 표(교사용) */}
      {scope === "class" && perStudent && perStudent.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-sm font-bold text-foreground">👥 학생별 활동 · 총 {perStudent.length}명</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">번호</th>
                  <th className="px-2 py-2 text-left">이름</th>
                  <th className="px-2 py-2 text-right">질문</th>
                  <th className="px-2 py-2 text-right">좋아요</th>
                  <th className="px-2 py-2 text-right">댓글</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perStudent.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-2 text-muted-foreground">{s.studentNumber || "-"}</td>
                    <td className="px-2 py-2 font-medium text-foreground">{s.name}</td>
                    <td className="px-2 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">{s.questions}</td>
                    <td className="px-2 py-2 text-right font-semibold text-rose-500 dark:text-rose-400">{s.likesGiven}</td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{s.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
