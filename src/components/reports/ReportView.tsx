"use client";

import { useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import type { ReportRange, SeriesPoint, ReportTotals } from "@/lib/report-stats";
import type { QuestionTypeSummary } from "@/lib/stats-calc";

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

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SessionAnalysisRow({
  session, analyze,
}: { session: SessionMeta; analyze: (id: string) => Promise<SessionAnalysisResult | null> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SessionAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = `${session.date} · ${session.subject}${session.topic ? ` - ${session.topic}` : ""}`;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (result || loading) return;
    setLoading(true); setError(null);
    try {
      const r = await analyze(session.id);
      if (r) setResult(r); else setError("분석 결과가 없어요");
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했어요");
    } finally {
      setLoading(false);
    }
  };

  const blocks: [string, string | undefined][] = [
    ["📌 요약", result?.summary],
    ["🧭 제안", result?.insights],
    ["❤️ 좋아요·참여", result?.engagementInsights],
    ["💬 댓글", result?.commentInsights],
    ["🎯 주제 연관성·성의", result?.relevanceInsights],
  ];

  return (
    <div className="rounded-lg border bg-background">
      <button onClick={toggle} className="no-print flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-xs font-semibold text-emerald-600">🤖 AI 분석 {open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t px-3 py-2 text-sm">
          {loading ? (
            <p className="text-muted-foreground">🤖 분석하는 중...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : result ? (
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
}

export function ReportView({ scope, title, subtitle, totals, weekly, monthly, classification, perStudent, sessions, analyzeSession }: ReportViewProps) {
  const [range, setRange] = useState<ReportRange>("week");
  const series = range === "week" ? weekly : monthly;

  const classData = [
    { name: "폐쇄형", value: classification.closure.closed, fill: "#3b82f6" },
    { name: "개방형", value: classification.closure.open, fill: "#10b981" },
    { name: "사실적", value: classification.cognitive.factual, fill: "#94a3b8" },
    { name: "개념적", value: classification.cognitive.conceptual, fill: "#a855f7" },
    { name: "논쟁적", value: classification.cognitive.controversial, fill: "#f97316" },
  ];

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
        <p className="mb-3 text-sm font-bold text-foreground">📈 참여 추세 ({range === "week" ? "주별" : "월별"}) · 내가 만든 활동</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {METRICS.map((m) => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 호응 추세 */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">💛 호응 추세 ({range === "week" ? "주별" : "월별"}) · 내 질문이 받은 반응</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {RECEIVED.map((m) => (
              <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 질문 분류 분포 */}
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">📊 질문 분류 분포 · 총 {classification.total}개</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={classData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" name="질문 수" radius={[4, 4, 0, 0]}>
              {classData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 수업세션별 AI 분석 */}
      {sessions && sessions.length > 0 && analyzeSession && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-1 text-sm font-bold text-foreground">🤖 수업세션별 AI 분석</p>
          <p className="mb-3 text-xs text-muted-foreground">
            {scope === "student"
              ? "세션을 펼치면 내 질문·좋아요·댓글 활동을 AI가 분석해 줘요"
              : "세션을 펼치면 학급의 질문·좋아요·댓글을 AI가 분석해 줘요"}
          </p>
          <div className="space-y-2">
            {sessions.map((s) => (
              <SessionAnalysisRow key={s.id} session={s} analyze={analyzeSession} />
            ))}
          </div>
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
