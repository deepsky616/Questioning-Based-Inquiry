"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { AiLoadingProcess } from "@/components/shared/AiLoadingProcess";
import type { ReportRange, SeriesPoint } from "@/lib/report-stats";

interface ChartTheme {
  grid: string;
  tick: string;
}

interface TrendMetric {
  key: keyof SeriesPoint;
  color: string;
}

interface ClassificationTrendMetric extends TrendMetric {
  labelKey: string;
}

type TooltipStyle = {
  readonly backgroundColor: string;
  readonly border: string;
  readonly borderRadius: number;
  readonly color: string;
  readonly fontSize: number;
};

interface ReportHeaderControlsProps {
  title: string;
  subtitle?: string;
  basisNote: string;
  range: ReportRange;
  period: string;
  periods: [string, string][];
  showPrintButton: boolean;
  labels: {
    week: string;
    month: string;
    print: string;
  };
  onRangeChange: (range: ReportRange) => void;
  onPeriodChange: (period: string) => void;
}

export function ReportHeaderControls({
  title,
  subtitle,
  basisNote,
  range,
  period,
  periods,
  showPrintButton,
  labels,
  onRangeChange,
  onPeriodChange,
}: ReportHeaderControlsProps) {
  return (
    <div className="report-readable-header flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">{basisNote}</p>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border">
          <button
            onClick={() => onRangeChange("week")}
            className={`px-3 py-1.5 text-xs font-medium ${range === "week" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {labels.week}
          </button>
          <button
            onClick={() => onRangeChange("month")}
            className={`border-l px-3 py-1.5 text-xs font-medium ${range === "month" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {labels.month}
          </button>
        </div>
        <select
          value={period}
          onChange={(event) => onPeriodChange(event.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          {periods.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {showPrintButton && (
          <Button size="sm" onClick={() => window.print()} className="font-semibold">
            {labels.print}
          </Button>
        )}
      </div>
    </div>
  );
}

interface ReportTrendGridProps {
  series: SeriesPoint[];
  selectedPoint: SeriesPoint | null;
  participationTitle: string;
  receptionTitle: string;
  metrics: TrendMetric[];
  receivedMetrics: TrendMetric[];
  metricName: (key: string) => string;
  chart: ChartTheme;
  tooltipStyle: TooltipStyle;
  tooltipText: string;
}

export function ReportTrendGrid({
  series,
  selectedPoint,
  participationTitle,
  receptionTitle,
  metrics,
  receivedMetrics,
  metricName,
  chart,
  tooltipStyle,
  tooltipText,
}: ReportTrendGridProps) {
  return (
    <div className="report-readable-grid grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">{participationTitle}</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {metrics.map((metric) => (
              <Line key={metric.key} type="monotone" dataKey={metric.key} name={metricName(metric.key)} stroke={metric.color} strokeWidth={2} dot={{ r: 2 }} />
            ))}
            {selectedPoint && <ReferenceLine x={selectedPoint.label} stroke="#6366f1" strokeDasharray="4 3" />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">{receptionTitle}</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {receivedMetrics.map((metric) => (
              <Line key={metric.key} type="monotone" dataKey={metric.key} name={metricName(metric.key)} stroke={metric.color} strokeWidth={2} dot={{ r: 2 }} />
            ))}
            {selectedPoint && <ReferenceLine x={selectedPoint.label} stroke="#6366f1" strokeDasharray="4 3" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface ReportClassificationTrendGridProps {
  series: SeriesPoint[];
  closureTitle: string;
  cognitiveTitle: string;
  closureTrend: ClassificationTrendMetric[];
  cognitiveTrend: ClassificationTrendMetric[];
  classificationLabel: (labelKey: string) => string;
  chart: ChartTheme;
  tooltipStyle: TooltipStyle;
  tooltipText: string;
}

export function ReportClassificationTrendGrid({
  series,
  closureTitle,
  cognitiveTitle,
  closureTrend,
  cognitiveTrend,
  classificationLabel,
  chart,
  tooltipStyle,
  tooltipText,
}: ReportClassificationTrendGridProps) {
  return (
    <div className="report-readable-grid grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">{closureTitle}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {closureTrend.map((metric) => (
              <Bar key={metric.key} dataKey={metric.key} name={classificationLabel(metric.labelKey)} stackId="closure" fill={metric.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-bold text-foreground">{cognitiveTitle}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="label" stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {cognitiveTrend.map((metric) => (
              <Bar key={metric.key} dataKey={metric.key} name={classificationLabel(metric.labelKey)} stackId="cognitive" fill={metric.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface ClassificationDistributionDatum {
  name: string;
  value: number;
  fill: string;
}

interface ReportClassificationDistributionChartProps {
  title: string;
  data: ClassificationDistributionDatum[];
  chart: ChartTheme;
  tooltipStyle: TooltipStyle;
  tooltipText: string;
  questionCountName: string;
  renderTick: (props: { x?: number; y?: number; payload?: { value?: string } }) => ReactElement<SVGElement>;
}

export function ReportClassificationDistributionChart({
  title,
  data,
  chart,
  tooltipStyle,
  tooltipText,
  questionCountName,
  renderTick,
}: ReportClassificationDistributionChartProps) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-bold text-foreground">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 16, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
          <XAxis dataKey="name" stroke={chart.grid} interval={0} tick={renderTick} />
          <YAxis allowDecimals={false} stroke={chart.grid} tick={{ fontSize: 11, fill: chart.tick }} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipText }} itemStyle={{ color: tooltipText }} cursor={{ fill: chart.grid, opacity: 0.25 }} />
          <Bar dataKey="value" name={questionCountName} radius={[4, 4, 0, 0]}>
            {data.map((datum, index) => <Cell key={index} fill={datum.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface StudentActivityRow {
  id: string;
  name: string;
  studentNumber?: string | null;
  questions: number;
  likesGiven: number;
  comments: number;
}

interface ReportStudentActivityTableProps {
  title: string;
  rows: StudentActivityRow[];
  labels: {
    no: string;
    name: string;
    question: string;
    likes: string;
    comment: string;
  };
}

export function ReportStudentActivityTable({ title, rows, labels }: ReportStudentActivityTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-bold text-foreground">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">{labels.no}</th>
              <th className="px-2 py-2 text-left">{labels.name}</th>
              <th className="px-2 py-2 text-right">{labels.question}</th>
              <th className="px-2 py-2 text-right">{labels.likes}</th>
              <th className="px-2 py-2 text-right">{labels.comment}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-2 text-muted-foreground">{row.studentNumber || "-"}</td>
                <td className="px-2 py-2 font-medium text-foreground">{row.name}</td>
                <td className="px-2 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">{row.questions}</td>
                <td className="px-2 py-2 text-right font-semibold text-rose-500 dark:text-rose-400">{row.likesGiven}</td>
                <td className="px-2 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{row.comments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ReportSessionAnalysisToolbarProps {
  title: string;
  description: string;
  analyzeAllLabel: string;
  canAnalyze: boolean;
  analyzingAll: boolean;
  filteredSessionCount: number;
  scope: "student" | "class";
  bulkEnabled: boolean;
  bulkRunning: boolean;
  bulkPeriodCount: number;
  bulkProcessed: number;
  bulkTotal: number;
  bulkNote?: string;
  sessionBatch: { processed: number; total: number };
  labels: {
    analyzing: string;
    analyzeAllStudent: (count: number) => string;
    analyzeAllClass: (count: number) => string;
    bulkAnalyze: string;
    bulkHint: string;
    bulkRunning: (processed: number, total: number) => string;
    bulkStop: string;
    analyzeAllRunning: (processed: number, total: number) => string;
  };
  onAnalyzeAll: () => void;
  onBulkAnalyze: () => void;
  onBulkStop: () => void;
}

export function ReportSessionAnalysisToolbar({
  title,
  description,
  analyzeAllLabel,
  canAnalyze,
  analyzingAll,
  filteredSessionCount,
  scope,
  bulkEnabled,
  bulkRunning,
  bulkPeriodCount,
  bulkProcessed,
  bulkTotal,
  bulkNote,
  sessionBatch,
  labels,
  onAnalyzeAll,
  onBulkAnalyze,
  onBulkStop,
}: ReportSessionAnalysisToolbarProps) {
  return (
    <>
      <p className="mb-1 text-sm font-bold text-foreground">{title}</p>
      {description && <p className="mb-3 text-xs text-muted-foreground">{description}</p>}
      {canAnalyze && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <span className="text-xs font-semibold text-foreground">{analyzeAllLabel}</span>
          <Button size="sm" disabled={analyzingAll || filteredSessionCount === 0} onClick={onAnalyzeAll} className="font-semibold">
            {analyzingAll
              ? labels.analyzing
              : scope === "student"
                ? labels.analyzeAllStudent(filteredSessionCount)
                : labels.analyzeAllClass(filteredSessionCount)}
          </Button>
          {bulkEnabled && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkRunning || bulkPeriodCount === 0}
              onClick={onBulkAnalyze}
              className="font-semibold"
              title={labels.bulkHint}
            >
              {bulkRunning ? labels.bulkRunning(bulkProcessed, bulkTotal) : labels.bulkAnalyze}
            </Button>
            {bulkRunning && (
              <button onClick={onBulkStop} className="text-xs font-medium text-red-600 hover:text-red-800">
                {labels.bulkStop}
              </button>
            )}
          </>
          )}
        </div>
      )}
      {canAnalyze && bulkEnabled && bulkNote && !bulkRunning && (
        <p className="no-print -mt-1 text-xs text-muted-foreground">{bulkNote}</p>
      )}
      {analyzingAll && (
        <AiLoadingProcess
          kind="sessionAnalysis"
          detail={labels.analyzeAllRunning(sessionBatch.processed, sessionBatch.total)}
          className="no-print mb-3"
        />
      )}
      {bulkRunning && (
        <AiLoadingProcess
          kind="bulkSessionAnalysis"
          compact
          detail={labels.bulkRunning(bulkProcessed, bulkTotal)}
          className="no-print mb-3"
        />
      )}
    </>
  );
}

export type ReportAnalysisFieldKey =
  | "summary"
  | "balanceInsights"
  | "bestQuestion"
  | "engagementInsights"
  | "commentInsights"
  | "relevanceInsights"
  | "nextQuestions"
  | "insights"
  | "growthInsights"
  | "rewriteExample";

export const REPORT_EDIT_FIELD_LABEL_KEYS: Record<ReportAnalysisFieldKey, string> = {
  summary: "secSummary",
  balanceInsights: "secBalance",
  bestQuestion: "secBest",
  engagementInsights: "secEngagement",
  commentInsights: "secComment",
  relevanceInsights: "secRelevance",
  nextQuestions: "secNext",
  insights: "secSuggest",
  growthInsights: "secGrowth",
  rewriteExample: "secRewrite",
};

export function getReportEditFieldKeys(scope: "student" | "class"): ReportAnalysisFieldKey[] {
  return scope === "class"
    ? ["summary", "balanceInsights", "bestQuestion", "engagementInsights", "commentInsights", "relevanceInsights", "nextQuestions", "insights"]
    : ["summary", "growthInsights", "rewriteExample", "relevanceInsights", "insights"];
}
