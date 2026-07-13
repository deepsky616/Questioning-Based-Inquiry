"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useTheme } from "@/components/shared/theme-provider";
import { useTranslations, useLocale } from "next-intl";
import type { ReportRange, SeriesPoint, ReportTotals } from "@/lib/report-stats";
import type { QuestionTypeSummary } from "@/lib/stats-calc";
import { EmptyState } from "@/components/shared/EmptyState";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { AiLoadingProcess } from "@/components/shared/AiLoadingProcess";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";
import { formatDateTime } from "@/lib/datetime";
import { groupSessionsByMonth } from "@/lib/sessions";
import { getAnalysisFreshness } from "@/lib/report-analysis-freshness";
import { ReportClassificationGuide } from "@/components/reports/ReportClassificationGuide";
import { SummaryCard } from "@/components/reports/ReportSectionGrid";
import {
  getReportEditFieldKeys,
  REPORT_EDIT_FIELD_LABEL_KEYS,
  ReportClassificationDistributionChart,
  ReportClassificationTrendGrid,
  ReportHeaderControls,
  ReportSessionAnalysisToolbar,
  ReportStudentActivityTable,
  ReportTrendGrid,
} from "@/components/reports/ReportViewSections";

export interface PerStudentRow {
  id: string;
  name: string;
  studentNumber?: string | null;
  questions: number;
  likesGiven: number;
  comments: number;
}

export interface SessionMeta {
  id: string;
  date: string;
  subject: string;
  topic: string;
  analysis?: SessionAnalysisResult | null;
  currentQuestions?: number;
  currentComments?: number;
  currentLikes?: number;
}
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
  // 세션 집계(분석 시점 저장) — 있으면 분석 상단에 배지로 표시
  totalQuestions?: number;
  totalComments?: number;
  totalLikes?: number;
  analyzedAt?: string;
  analysisModel?: string;
}

type SessionTranslationFields = Partial<Record<keyof SessionAnalysisResult, string>>;

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
  /** 세션 분석 결과를 컴포넌트 remount(탭/뷰 전환)에도 유지하기 위한 캐시 키(예: "class:5|1", "student:abc"). */
  analysisCacheKey?: string;
  /** 분석/재분석 버튼 노출 여부. false면 저장된 결과만 보여준다(학생 본인 뷰=읽기 전용). 기본 true. */
  canAnalyze?: boolean;
  /** '전체 학생 일괄 분석'을 위한 콜백. cursor로 나눠 호출하고 진행 상태를 돌려준다. */
  bulkAnalyze?: (sessionIds: string[], cursor: number) => Promise<{ total: number; nextCursor: number; done: boolean; analyzedThisCall: number; error?: string }>;
  /** 일괄 분석 대상 세션 풀(학급 전체 세션). 주면 현재 기간 필터로 추려 일괄 분석에 사용(학생별 탭에서 학급 전체 세션 기준). 없으면 화면의 세션을 사용. */
  bulkSessions?: SessionMeta[];
  /** ReportView 자체 인쇄 버튼 노출 여부(교사 페이지는 별도 출력 버튼을 쓰므로 숨김). 기본 true. */
  showPrintButton?: boolean;
  /** 교사가 수정한 분석 결과를 저장하는 콜백. 주어지면 분석 블록에 '수정'이 나타난다. */
  onSaveAnalysis?: (sessionId: string, result: SessionAnalysisResult) => Promise<void>;
  /** 전체 학생 일괄 분석 완료 후 현재 화면을 갱신하기 위한 콜백(예: 선택 학생 리포트 재조회). */
  onBulkComplete?: () => void;
  // 추세 차트 부제(관점에 따라 다르게). 기본은 학생 본인 관점.
  participationLabel?: string;
  receptionLabel?: string;
}

const METRICS: { key: keyof SeriesPoint; color: string }[] = [
  { key: "questions", color: "#6366f1" },
  { key: "likesGiven", color: "#f43f5e" },
  { key: "comments", color: "#10b981" },
];
const RECEIVED: { key: keyof SeriesPoint; color: string }[] = [
  { key: "likesReceived", color: "#f59e0b" },
  { key: "commentsReceived", color: "#8b5cf6" },
];
// 분류 추세(누적 막대) — 분류1/분류2를 기간별로 쌓는다. 라벨은 classification 카탈로그(key)로 해석.
const CLOSURE_TREND: { key: keyof SeriesPoint; labelKey: string; color: string }[] = [
  { key: "closed", labelKey: "closed", color: "#3b82f6" },
  { key: "open", labelKey: "open", color: "#10b981" },
];
const COGNITIVE_TREND: { key: keyof SeriesPoint; labelKey: string; color: string }[] = [
  { key: "factual", labelKey: "factual", color: "#94a3b8" },
  { key: "conceptual", labelKey: "conceptual", color: "#a855f7" },
  { key: "controversial", labelKey: "controversial", color: "#f97316" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
function mondayOf(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
/** 세션 날짜를 주/월 기간 키·라벨로 변환 */
function sessionPeriod(dateStr: string, mode: ReportRange, locale: string, otherLabel: string, weekSuffix: string): { key: string; label: string } {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { key: "기타", label: otherLabel };
  if (mode === "month") {
    return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: d.toLocaleDateString(locale, { year: "numeric", month: "long" }) };
  }
  const m = mondayOf(d);
  const end = new Date(m); end.setDate(end.getDate() + 6);
  return {
    key: `${m.getFullYear()}-${pad2(m.getMonth() + 1)}-${pad2(m.getDate())}`,
    label: `${m.getMonth() + 1}/${m.getDate()}~${end.getMonth() + 1}/${end.getDate()}${weekSuffix}`,
  };
}

export function ReportView({
  scope, title, subtitle, totals, weekly, monthly, classification, perStudent, sessions, analyzeSession, analysisCacheKey,
  participationLabel, receptionLabel, canAnalyze = true, bulkAnalyze, bulkSessions, showPrintButton = true, onSaveAnalysis, onBulkComplete,
}: ReportViewProps) {
  const { toast } = useToast();
  const [range, setRange] = useState<ReportRange>("week");
  const series = range === "week" ? weekly : monthly;
  const tCls = useTranslations("classification");
  const t = useTranslations("report");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const pLabel = participationLabel ?? t("defaultParticipation");
  const rLabel = receptionLabel ?? t("defaultReception");
  const metricName = (k: string) => t(`metric_${k}`);

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
  // ── 수업 세션별 분석 (기간 필터 + 전체 분석) ──
  const allSessions = useMemo(() => sessions ?? [], [sessions]);
  const sessionText = useSessionMetaTranslation(allSessions);
  // period="ALL"이면 전체, 그 외엔 특정 주/월 키. 상단 토글(range)과 함께 상단에서 선택한다.
  const [period, setPeriod] = useState<string>("ALL");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [res, setRes] = useState<Record<string, SessionAnalysisResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [sessionBatch, setSessionBatch] = useState<{ running: boolean; processed: number; total: number }>({ running: false, processed: 0, total: 0 });
  // 전체 학생 일괄 분석(학급 보기)
  const [bulk, setBulk] = useState<{ running: boolean; processed: number; total: number; analyzed: number; note?: string }>({ running: false, processed: 0, total: 0, analyzed: 0 });
  const bulkStop = useRef(false);
  // 교사 분석 수정
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SessionAnalysisResult>({});
  const [savingEdit, setSavingEdit] = useState(false);
  // 분석 결과 번역(ko 외 로케일에서 세션별 원문/번역 전환)
  const tT = useTranslations("translate");
  const canTranslate = locale !== "ko";
  const [trFields, setTrFields] = useState<Record<string, SessionTranslationFields>>({});
  const [trShown, setTrShown] = useState<Record<string, boolean>>({});
  const [trBusy, setTrBusy] = useState<Record<string, boolean>>({});
  // 재분석·수정으로 원문이 바뀌면 이전 번역을 버린다(서버 캐시는 해시로 자동 무효화)
  const dropTranslation = (id: string) => {
    setTrFields((p) => { const n = { ...p }; delete n[id]; return n; });
    setTrShown((p) => ({ ...p, [id]: false }));
  };
  const toggleTranslate = async (id: string) => {
    if (trShown[id]) {
      setTrShown((p) => ({ ...p, [id]: false }));
      return;
    }
    if (trFields[id]) {
      setTrShown((p) => ({ ...p, [id]: true }));
      return;
    }
    const r = res[id];
    if (!r || trBusy[id]) return;
    setTrBusy((p) => ({ ...p, [id]: true }));
    try {
      const fields: Record<string, string> = {};
      for (const key of getReportEditFieldKeys(scope)) {
        const value = r[key];
        if (typeof value === "string" && value.trim()) fields[key] = value;
      }
      const body = {
        sessionId: id,
        cacheKey: analysisCacheKey ?? "class",
        fields,
      };
      const resp = await fetch("/api/reports/session-analysis/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(typeof data?.error === "string" ? data.error : tT("translateFailed"));
      setTrFields((p) => ({ ...p, [id]: data.fields ?? {} }));
      setTrShown((p) => ({ ...p, [id]: true }));
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : tT("translateFailed") });
    } finally {
      setTrBusy((p) => ({ ...p, [id]: false }));
    }
  };
  const editFields: { key: keyof SessionAnalysisResult; label: string }[] = getReportEditFieldKeys(scope)
    .map((key) => ({ key, label: t(REPORT_EDIT_FIELD_LABEL_KEYS[key]) }));
  const startEdit = (id: string) => { setOpen((o) => ({ ...o, [id]: true })); setEditing(id); setEditDraft({ ...res[id] }); };
  const cancelEdit = () => { setEditing(null); setEditDraft({}); };
  const saveEdit = async (id: string) => {
    if (!onSaveAnalysis) return;
    setSavingEdit(true);
    try {
      await onSaveAnalysis(id, editDraft);
      setRes((p) => ({ ...p, [id]: editDraft }));
      queryClient.setQueryData(analysisKey(id), editDraft);
      dropTranslation(id); // 원문이 바뀌었으니 이전 번역 폐기
      setEditing(null); setEditDraft({});
      toast({ description: t("editSaved") });
    } catch (e) {
      setErrs((x) => ({ ...x, [id]: e instanceof Error ? e.message : t("analysisFailed") }));
      toast({ variant: "destructive", description: t("analysisFailed") });
    } finally {
      setSavingEdit(false);
    }
  };

  // 기간 목록(세션이 있는 주/월) — 최신순. 맨 앞에 '전체'(ALL)
  const periods = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSessions) {
      const p = sessionPeriod(s.date, range, locale, t("other"), t("weekSuffix"));
      if (!map.has(p.key)) map.set(p.key, p.label);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return [["ALL", t("allPeriods")] as [string, string], ...sorted];
  }, [allSessions, range, locale, t]);

  // 주별↔월별 전환 등으로 현재 선택 키가 사라지면 '전체'로 되돌린다(전체는 항상 유효).
  useEffect(() => {
    if (period !== "ALL" && !periods.some(([k]) => k === period)) setPeriod("ALL");
  }, [periods, period]);

  const inPeriod = (date: string) => period === "ALL" || sessionPeriod(date, range, locale, t("other"), t("weekSuffix")).key === period;
  const filteredSessions = allSessions.filter((s) => inPeriod(s.date));
  const filteredSessionMonthGroups = groupSessionsByMonth(filteredSessions);
  // 일괄 분석 대상(학급 전체 세션 풀이 있으면 그것을 현재 기간으로 추림) 수
  const bulkPeriodCount = (bulkSessions ?? allSessions).filter((s) => inPeriod(s.date)).length;

  // 선택 기간에 맞춘 요약·분류(전체면 전체 집계, 특정 기간이면 그 기간의 추세 데이터로 산출)
  const selectedPoint = period === "ALL" ? null : series.find((p) => p.key === period) ?? null;
  const viewTotals: ReportTotals = selectedPoint
    ? { questions: selectedPoint.questions, likesGiven: selectedPoint.likesGiven, comments: selectedPoint.comments, likesReceived: selectedPoint.likesReceived, commentsReceived: selectedPoint.commentsReceived }
    : totals;
  const viewClassification: QuestionTypeSummary = selectedPoint
    ? {
        total: selectedPoint.closed + selectedPoint.open,
        closure: { closed: selectedPoint.closed, open: selectedPoint.open },
        cognitive: { factual: selectedPoint.factual, conceptual: selectedPoint.conceptual, controversial: selectedPoint.controversial },
      }
    : classification;
  const classData = [
    { name: tCls("closed.label"), value: viewClassification.closure.closed, fill: "#3b82f6" },
    { name: tCls("open.label"), value: viewClassification.closure.open, fill: "#10b981" },
    { name: tCls("factual.label"), value: viewClassification.cognitive.factual, fill: "#94a3b8" },
    { name: tCls("conceptual.label"), value: viewClassification.cognitive.conceptual, fill: "#a855f7" },
    { name: tCls("controversial.label"), value: viewClassification.cognitive.controversial, fill: "#f97316" },
  ];

  // 분석 결과를 QueryClient에 캐시해 탭/뷰 전환(remount)에도 유지한다.
  const analysisKey = (id: string) => ["session-analysis", analysisCacheKey ?? "default", id] as const;

  // 마운트/세션 변경 시 기존 분석 결과를 복원(재분석 방지).
  // 우선순위: 서버 영속값(다른 기기/브라우저) → 메모리 캐시(같은 세션에서 방금 분석한 최신값) 순으로 덮어씀.
  useEffect(() => {
    const restored: Record<string, SessionAnalysisResult> = {};
    for (const s of allSessions) {
      if (s.analysis) restored[s.id] = s.analysis;
      const cached = queryClient.getQueryData<SessionAnalysisResult>(analysisKey(s.id));
      if (cached) restored[s.id] = cached;
    }
    if (Object.keys(restored).length > 0) setRes((p) => ({ ...restored, ...p }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSessions, analysisCacheKey]);

  // force=true면 캐시를 무시하고 다시 분석한다.
  const analyzeOne = async (id: string, force = false) => {
    if (!analyzeSession || busy[id]) return;
    if (!force && res[id]) return;
    setBusy((b) => ({ ...b, [id]: true })); setErrs((e) => ({ ...e, [id]: "" }));
    try {
      const r = await analyzeSession(id);
      if (r) {
        setRes((p) => ({ ...p, [id]: r }));
        queryClient.setQueryData(analysisKey(id), r);
        dropTranslation(id); // 원문이 바뀌었으니 이전 번역 폐기
        toast({ description: t("analysisDone") });
      } else setErrs((e) => ({ ...e, [id]: t("noAnalysisResult") }));
    } catch (e) {
      setErrs((x) => ({ ...x, [id]: e instanceof Error ? e.message : t("analysisFailed") }));
      toast({ variant: "destructive", description: t("analysisFailed") });
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };
  // 펼치기만 하고 자동 분석하지 않는다(첫 분석도 버튼으로 시작).
  const toggleSession = (id: string) => {
    setOpen((o) => ({ ...o, [id]: !o[id] }));
  };
  // 분석 버튼: 펼친 뒤 분석 실행(이미 결과가 있으면 강제 재분석).
  const runAnalysis = (id: string) => {
    setOpen((o) => ({ ...o, [id]: true }));
    analyzeOne(id, !!res[id]);
  };
  const analyzeAll = async () => {
    if (!analyzeSession) return;
    setAnalyzingAll(true);
    const targets = filteredSessions.filter((s) => !res[s.id]);
    setSessionBatch({ running: true, processed: 0, total: targets.length });
    let analyzedCount = 0, failed = false;
    setOpen((o) => filteredSessions.reduce((next, s) => ({ ...next, [s.id]: true }), o));
    for (const s of targets) {
      setBusy((b) => ({ ...b, [s.id]: true })); setErrs((e) => ({ ...e, [s.id]: "" }));
      try {
        const r = await analyzeSession(s.id);
        if (r) {
          setRes((p) => ({ ...p, [s.id]: r }));
          queryClient.setQueryData(analysisKey(s.id), r);
          analyzedCount++;
        }
      } catch (e) {
        failed = true;
        setErrs((x) => ({ ...x, [s.id]: e instanceof Error ? e.message : t("analysisFailed") }));
      } finally {
        setBusy((b) => ({ ...b, [s.id]: false }));
        setSessionBatch((p) => ({ ...p, processed: Math.min(p.processed + 1, p.total) }));
      }
    }
    setAnalyzingAll(false);
    setSessionBatch((p) => ({ ...p, running: false }));
    if (failed) toast({ variant: "destructive", description: t("analysisFailed") });
    else toast({ description: t("analysisAllDone", { count: analyzedCount }) });
  };

  // 전체 학생 일괄 분석: 현재 기간의 세션들 × 반 전체 학생을 나눠서 분석(서버가 cursor로 진행).
  // 대상 세션은 bulkSessions(학급 전체)가 있으면 그것을 현재 기간으로 추려 쓰고, 없으면 화면의 세션을 쓴다.
  const runBulkAnalyze = async () => {
    if (!bulkAnalyze) return;
    const pool = bulkSessions ?? allSessions;
    const ids = pool.filter((s) => inPeriod(s.date)).map((s) => s.id);
    if (ids.length === 0) return;
    bulkStop.current = false;
    setBulk({ running: true, processed: 0, total: 0, analyzed: 0 });
    let cursor = 0, total = 0, analyzed = 0, hadError = false;
    try {
      for (;;) {
        const r = await bulkAnalyze(ids, cursor);
        total = r.total; cursor = r.nextCursor; analyzed += r.analyzedThisCall;
        if (r.error) hadError = true;
        if (r.done) {
          const msg = t("bulkDone", { count: analyzed }) + (hadError ? " · " + t("bulkSomeFailed") : "");
          setBulk({ running: false, processed: total, total, analyzed, note: msg });
          toast({ variant: hadError ? "destructive" : undefined, description: msg });
          onBulkComplete?.();
          return;
        }
        if (bulkStop.current) {
          const msg = t("bulkStopped", { count: analyzed });
          setBulk({ running: false, processed: cursor, total, analyzed, note: msg });
          toast({ description: msg });
          onBulkComplete?.();
          return;
        }
        setBulk({ running: true, processed: cursor, total, analyzed });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("bulkFailed");
      setBulk({ running: false, processed: cursor, total, analyzed, note: msg });
      toast({ variant: "destructive", description: msg });
    }
  };

  // 분류 분포 막대그래프 X축: '사실적 질문'처럼 긴 라벨은 띄어쓰기에서 두 줄로 표시(SVG라 CSS 줄바꿈 불가)
  const renderClassTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) => {
    const parts = String(payload?.value ?? "").split(" ");
    return (
      <text x={x} y={y} dy={12} textAnchor="middle" fontSize={11} fill={chart.tick}>
        {parts.length > 1
          ? parts.map((p, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>{p}</tspan>)
          : parts[0]}
      </text>
    );
  };

  return (
    <div className="report-print space-y-6">
      <ReportHeaderControls
        title={title}
        subtitle={subtitle}
        basisNote={t("basisNote", { date: new Date().toLocaleDateString(locale) })}
        range={range}
        period={period}
        periods={periods}
        showPrintButton={showPrintButton}
        labels={{ week: t("week"), month: t("month"), print: t("print") }}
        onRangeChange={setRange}
        onPeriodChange={setPeriod}
      />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label={t("metric_questions")} value={viewTotals.questions} color="#6366f1" />
        <SummaryCard label={t("metric_likesGiven")} value={viewTotals.likesGiven} color="#f43f5e" />
        <SummaryCard label={t("metric_comments")} value={viewTotals.comments} color="#10b981" />
        <SummaryCard label={t("metric_likesReceived")} value={viewTotals.likesReceived} color="#f59e0b" />
        <SummaryCard label={t("metric_commentsReceived")} value={viewTotals.commentsReceived} color="#8b5cf6" />
      </div>

      <ReportTrendGrid
        series={series}
        selectedPoint={selectedPoint}
        participationTitle={t("participationTrend", { period: range === "week" ? t("week") : t("month"), label: pLabel })}
        receptionTitle={t("receptionTrend", { period: range === "week" ? t("week") : t("month"), label: rLabel })}
        metrics={METRICS}
        receivedMetrics={RECEIVED}
        metricName={metricName}
        chart={chart}
        tooltipStyle={tooltipStyle}
        tooltipText={tooltipText}
      />

      {/* 분류 안내 (분류 차트 공통 참조) — 색 점은 차트 색과 동일 */}
      <ReportClassificationGuide />

      <ReportClassificationDistributionChart
        title={t("distTitle", { count: viewClassification.total })}
        data={classData}
        chart={chart}
        tooltipStyle={tooltipStyle}
        tooltipText={tooltipText}
        questionCountName={t("questionCountName")}
        renderTick={renderClassTick}
      />

      <ReportClassificationTrendGrid
        series={series}
        closureTitle={t("closureTrend", { cat: tCls("category1"), period: range === "week" ? t("week") : t("month"), kinds: tCls("closure") })}
        cognitiveTitle={t("cognitiveTrend", { cat: tCls("category2"), period: range === "week" ? t("week") : t("month"), kinds: tCls("cognitive") })}
        closureTrend={CLOSURE_TREND}
        cognitiveTrend={COGNITIVE_TREND}
        classificationLabel={(labelKey) => tCls(`${labelKey}.label`)}
        chart={chart}
        tooltipStyle={tooltipStyle}
        tooltipText={tooltipText}
      />

      {/* 수업 세션별 분석 (기간 필터 + 전체 분석) */}
      {allSessions.length > 0 && analyzeSession && (
        <div className="report-analysis-panel rounded-xl border bg-card p-4">
          <ReportSessionAnalysisToolbar
            title={t("aiSessionTitle")}
            description={canAnalyze ? t("aiSessionDesc") : ""}
            analyzeAllLabel={t("analyzeAll")}
            canAnalyze={canAnalyze}
            analyzingAll={analyzingAll}
            filteredSessionCount={filteredSessions.length}
            scope={scope}
            bulkEnabled={Boolean(bulkAnalyze)}
            bulkRunning={bulk.running}
            bulkPeriodCount={bulkPeriodCount}
            bulkProcessed={bulk.processed}
            bulkTotal={bulk.total}
            bulkNote={bulk.note}
            sessionBatch={sessionBatch}
            labels={{
              analyzing: t("analyzing"),
              analyzeAllStudent: (count) => t("analyzeAllStudentBtn", { count }),
              analyzeAllClass: (count) => t("analyzeAllBtn", { count }),
              bulkAnalyze: t("bulkAnalyzeBtn"),
              bulkHint: t("bulkAnalyzeHint"),
              bulkRunning: (processed, total) => t("bulkRunning", { processed, total }),
              bulkStop: t("bulkStop"),
              analyzeAllRunning: (processed, total) => t("analyzeAllRunning", { processed, total }),
            }}
            onAnalyzeAll={analyzeAll}
            onBulkAnalyze={runBulkAnalyze}
            onBulkStop={() => { bulkStop.current = true; }}
          />

          {/* 수업 세션별 개별 분석 목록(선택한 주/월의 세션만 표시) */}
          {filteredSessions.length === 0 ? (
            <EmptyState icon="🗓️" title={t("noSessionsInPeriod")} />
          ) : (
          <div className="space-y-4">
            {filteredSessionMonthGroups.map((group) => (
              <section key={group.key} className="space-y-2">
                <p className="border-b pb-1 text-xs font-semibold text-muted-foreground">{group.label} <span className="font-normal">({group.sessions.length})</span></p>
                {group.sessions.map((s) => {
                  const r = res[s.id];
                  const rv = r && trShown[s.id] ? { ...r, ...trFields[s.id] } : r;
                  const freshness = r ? getAnalysisFreshness(s, r) : null;
                  const label = sessionText.compactLabel(s);
                  const blocks: [string, string | undefined][] = [
                    [t("secSummary"), rv?.summary], [t("secBalance"), rv?.balanceInsights], [t("secBest"), rv?.bestQuestion],
                    [t("secGrowth"), rv?.growthInsights], [t("secRewrite"), rv?.rewriteExample], [t("secEngagement"), rv?.engagementInsights],
                    [t("secComment"), rv?.commentInsights], [t("secRelevance"), rv?.relevanceInsights], [t("secNext"), rv?.nextQuestions], [t("secSuggest"), rv?.insights],
                  ];
                  return (
                    <div key={s.id} className="rounded-lg border bg-background">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button onClick={() => toggleSession(s.id)} aria-expanded={!!open[s.id]} className="no-print flex min-w-0 flex-1 items-center gap-2 text-left">
                      <CollapseChevron open={!!open[s.id]} className="shrink-0" />
                      <span className="truncate text-sm font-medium text-foreground">{label}</span>
                      {freshness?.hasNewActivity && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                          {t("analysisRefreshRecommended")}
                        </span>
                      )}
                    </button>
                    {editing === s.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(s.id)}
                          disabled={savingEdit}
                          className="no-print shrink-0 rounded-md border border-indigo-500 bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {t("editSave")}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="no-print shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                        >
                          {t("editCancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        {canTranslate && r && !busy[s.id] && (
                          <button
                            onClick={() => toggleTranslate(s.id)}
                            disabled={trBusy[s.id]}
                            className="no-print shrink-0 rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-60"
                          >
                            {trBusy[s.id] ? tT("translating") : trShown[s.id] ? tT("showOriginal") : `🌐 ${tT("translate")}`}
                          </button>
                        )}
                        {canAnalyze && onSaveAnalysis && r && !busy[s.id] && (
                          <button
                            onClick={() => startEdit(s.id)}
                            className="no-print shrink-0 rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                          >
                            {t("editAnalysis")}
                          </button>
                        )}
                        {canAnalyze && (
                          <button
                            onClick={() => runAnalysis(s.id)}
                            disabled={busy[s.id]}
                            className={`no-print shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                              r
                                ? "border-border text-muted-foreground hover:bg-muted"
                                : "border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                            }`}
                          >
                            {busy[s.id]
                              ? t("analyzing")
                              : r && freshness?.hasNewActivity
                                ? t("reanalyzeRecommended")
                                : r ? t("reanalyze") : t("analyzeSessionBtn")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {open[s.id] && (
                    <div className="border-t px-3 py-2 text-sm">
                      {busy[s.id] ? (
                        <AiLoadingProcess kind="sessionAnalysis" compact />
                      ) : errs[s.id] ? (
                        <p className="text-red-600">{errs[s.id]}</p>
                      ) : editing === s.id ? (
                        <div className="space-y-2">
                          {editFields.map(({ key, label }) => (
                            <div key={key}>
                              <label className="text-xs font-semibold text-foreground">{label}</label>
                              <textarea
                                value={editDraft[key] ?? ""}
                                onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value }))}
                                rows={2}
                                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm leading-6 text-foreground"
                              />
                            </div>
                          ))}
                        </div>
                      ) : r ? (
                        <div className="space-y-2">
                          {/* 세션 집계 배지 — 질문조회 탭 분석과 동일한 형식 */}
                          {typeof rv?.totalQuestions === "number" && (
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statQuestions", { count: rv.totalQuestions ?? 0 })}</span>
                              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statLikes", { count: rv.totalLikes ?? 0 })}</span>
                              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statComments", { count: rv.totalComments ?? 0 })}</span>
                            </div>
                          )}
                          {freshness?.hasCurrentCounts && (
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                {t("currentBasis", { questions: s.currentQuestions ?? 0, likes: s.currentLikes ?? 0, comments: s.currentComments ?? 0 })}
                              </span>
                              {freshness.hasNewActivity && (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                                  {t("analysisStale", { questions: freshness.newQuestions, likes: freshness.newLikes, comments: freshness.newComments })}
                                </span>
                              )}
                            </div>
                          )}
                          {(rv?.analyzedAt || rv?.analysisModel) && (
                            <div className="flex flex-wrap gap-2 text-xs">
                              {rv.analyzedAt && (
                                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
                                  {t("analysisTime", { time: formatDateTime(rv.analyzedAt) })}
                                </span>
                              )}
                              {rv.analysisModel && (
                                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
                                  {t("analysisModel", { model: rv.analysisModel })}
                                </span>
                              )}
                            </div>
                          )}
                          {blocks.filter(([, v]) => v).map(([h, v]) => (
                            <div key={h}>
                              <p className="text-xs font-semibold text-foreground">{h}</p>
                              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{v}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{canAnalyze ? t("notAnalyzedYet") : t("notAnalyzedYetReadonly")}</p>
                      )}
                    </div>
                  )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          )}
        </div>
      )}

      {scope === "class" && perStudent && perStudent.length > 0 && (
        <ReportStudentActivityTable
          title={t("studentActivity", { count: perStudent.length })}
          rows={perStudent}
          labels={{
            no: t("colNo"),
            name: t("colName"),
            question: t("colQuestion"),
            likes: t("colLikes"),
            comment: t("colComment"),
          }}
        />
      )}
    </div>
  );
}
