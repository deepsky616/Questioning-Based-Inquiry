"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
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
