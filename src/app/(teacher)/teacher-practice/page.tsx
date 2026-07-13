"use client";

// 교사용 질문 연습 — 학생과 같은 연습(탭1)에 더해, 교사 전용으로
// 문항 은행 열람·복사(탭2)와 담당 학급 학생의 연습 현황(탭3)을 제공한다.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Copy, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionLearningSummary } from "@/components/shared/QuestionLearningSummary";
import { QuestionPracticeView } from "@/components/shared/QuestionPracticeView";
import { PracticeBankManager, type PracticeDraft } from "@/components/teacher/PracticeBankManager";
import {
  PRACTICE_QUIZ_BANK,
  PRACTICE_TRANSFORM_BANK,
  PRACTICE_CREATE_TOPICS,
  type Cognitive,
  type Closure,
} from "@/lib/question-practice-data";
import {
  localizePracticeCreateTopic,
  localizePracticeQuizItem,
  localizePracticeTransformItem,
} from "@/lib/question-practice-localization";
import { PRACTICE_POINTS, PRACTICE_DAILY_CAP } from "@/lib/practice-points";
import {
  parsePracticeSelection,
  practiceSelectionSearch,
} from "@/lib/practice-selection";
import type {
  AccuracyMetric,
  PracticeDiagnostic,
  PracticeFocus,
} from "@/lib/practice-diagnostics";

type TeacherPracticeTab = "try" | "bank" | "stats";

interface PracticeStatRow extends PracticeDiagnostic {
  id: string;
  name: string;
  grade?: string | null;
  className?: string | null;
  studentNumber?: string | null;
  todayPoints: number;
  weekPoints: number;
  quizCount: number;
  transformCount: number;
  createCount: number;
  capped: boolean;
}

interface PracticeStatsResponse {
  summary: PracticeDiagnostic;
  students: PracticeStatRow[];
}

type PracticeFocusFilter = "all" | PracticeFocus;
type CopyStatus = "success" | "error" | null;

const PRACTICE_FOCUSES: PracticeFocus[] = [
  "closed",
  "open",
  "factual",
  "conceptual",
  "controversial",
];
const PRACTICE_STATS_GRID_COLUMNS =
  "md:grid-cols-[minmax(10rem,1.4fr)_minmax(3.75rem,0.55fr)_minmax(4rem,0.6fr)_minmax(4.25rem,0.65fr)_minmax(4.25rem,0.65fr)_minmax(4rem,0.6fr)_minmax(13rem,2fr)]";

function teacherViewFrom(params: Pick<URLSearchParams, "get">): TeacherPracticeTab {
  const view = params.get("view");
  return view === "bank" || view === "stats" ? view : "try";
}

export default function TeacherPracticePage() {
  return (
    <Suspense fallback={null}>
      <TeacherPracticeContent />
    </Suspense>
  );
}

function TeacherPracticeContent() {
  const locale = useLocale();
  const t = useTranslations("practice");
  const tCls = useTranslations("classification");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSelection = parsePracticeSelection(searchParams);
  const requestedView = teacherViewFrom(searchParams);
  const requestedFocus: PracticeFocusFilter =
    requestedView === "stats" && initialSelection.tab === "quiz" && initialSelection.focus
      ? initialSelection.focus
      : "all";
  const [tab, setTab] = useState<TeacherPracticeTab>(requestedView);

  const switchTeacherView = (nextView: TeacherPracticeTab) => {
    setTab(nextView);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("view", nextView);
    router.replace(`/teacher-practice?${nextParams.toString()}`, { scroll: false });
  };

  useEffect(() => {
    setTab(requestedView);
  }, [requestedView]);

  // ── 탭 2: 문항 은행 필터 ──
  // 내장 문항 "복사해서 편집" — 사본 초안을 내 문항 폼으로 넘긴다(원본은 보존)
  const [prefill, setPrefill] = useState<{ key: number; draft: PracticeDraft } | null>(null);
  const copyToEdit = (draft: PracticeDraft) =>
    setPrefill((p) => ({ key: (p?.key ?? 0) + 1, draft }));
  const [filterCognitive, setFilterCognitive] = useState<"all" | Cognitive>("all");
  const [filterClosure, setFilterClosure] = useState<"all" | Closure>("all");
  const filteredQuiz = PRACTICE_QUIZ_BANK.filter(
    (q) =>
      (filterCognitive === "all" || q.cognitive === filterCognitive) &&
      (filterClosure === "all" || q.closure === filterClosure),
  ).map((q) => localizePracticeQuizItem(q, locale));
  const localizedTransformBank = PRACTICE_TRANSFORM_BANK.map((item) => localizePracticeTransformItem(item, locale));
  const localizedCreateTopics = PRACTICE_CREATE_TOPICS.map((topic) => localizePracticeCreateTopic(topic, locale));

  // ── 탭 3: 학생 연습 현황 ──
  const [focusFilter, setFocusFilter] = useState<PracticeFocusFilter>(requestedFocus);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  useEffect(() => {
    setFocusFilter(requestedFocus);
    setCopyStatus(null);
  }, [requestedFocus]);

  const statsQuery = useQuery<PracticeStatsResponse>({
    queryKey: ["teacher-practice-stats"],
    queryFn: async () => {
      const r = await fetch("/api/teacher/practice-stats");
      if (!r.ok) throw new Error("연습 현황을 불러오지 못했습니다");
      return r.json();
    },
    enabled: tab === "stats",
    refetchOnWindowFocus: true,
  });

  const selectedFocus = focusFilter === "all" ? null : focusFilter;
  const selectedQuizMode =
    selectedFocus === "closed" || selectedFocus === "open" ? "closure" : "cognitive";
  const selectedSearch = selectedFocus
    ? practiceSelectionSearch({
        tab: "quiz",
        quizMode: selectedQuizMode,
        focus: selectedFocus,
      })
    : null;
  const previewHref = selectedSearch
    ? `/teacher-practice?view=try&${selectedSearch}`
    : null;
  const studentHref = selectedSearch ? `/student-practice?${selectedSearch}` : null;

  const copyStudentHref = async () => {
    if (!studentHref) return;
    setCopyStatus(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(new URL(studentHref, window.location.origin).toString());
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  };

  const selectFocus = (focus: PracticeFocusFilter) => {
    setFocusFilter(focus);
    setCopyStatus(null);
  };

  const metricText = (metric: AccuracyMetric) =>
    metric.attempts === 0 ? t("statsNoSample") : `${metric.accuracy}%`;

  const recommendationText = (diagnostic: PracticeDiagnostic) => {
    if (diagnostic.recommendation.kind === "collect") {
      return t("statsRecommendationCollect");
    }
    if (diagnostic.recommendation.kind === "advance") {
      return t("statsRecommendationAdvance");
    }
    const focus = diagnostic.recommendation.focus;
    const type = tCls(`${focus}.label`);
    return diagnostic.types[focus].attempts < 3
      ? t("statsRecommendationSample", { type })
      : t("statsRecommendationWeakest", { type });
  };

  const cognitiveChip = (value: "all" | Cognitive, label: string) => (
    <button
      key={`cog-${value}`}
      type="button"
      onClick={() => setFilterCognitive(value)}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        filterCognitive === value ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );

  const closureChip = (value: "all" | Closure, label: string) => (
    <button
      key={`clo-${value}`}
      type="button"
      onClick={() => setFilterClosure(value)}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        filterClosure === value ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("teacherSubtitle")} />

      <div className="flex gap-2" role="tablist" aria-label={t("title")}>
        {(["try", "bank", "stats"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTeacherView(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {t(`teacherTab_${key}`)}
          </button>
        ))}
      </div>

      {/* 탭 1: 직접 해보기 — 학생과 동일한 뷰(교사는 서버가 포인트를 지급하지 않음) */}
      {tab === "try" && (
        <div className="space-y-4">
          <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
            {t("teacherPointNotice", {
              quiz: PRACTICE_POINTS.QUIZ_CORRECT,
              target: PRACTICE_POINTS.TARGET_ACHIEVED,
              cap: PRACTICE_DAILY_CAP,
            })}
          </p>
          <QuestionLearningSummary detailsHref="/teacher-question-learning" />
          <QuestionPracticeView audience="teacher" initialSelection={initialSelection} />
        </div>
      )}

      {/* 탭 2: 문항 은행 — 내 문항 관리(추가·수정) + 내장 문항 열람·복사 (정답·해설이 보이므로 교사 전용) */}
      {tab === "bank" && (
        <div className="space-y-6">
          <PracticeBankManager prefill={prefill} />

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">{t("bankQuizTitle", { count: filteredQuiz.length })}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {cognitiveChip("all", t("bankFilterAll"))}
                  {(["factual", "conceptual", "controversial"] as const).map((v) => cognitiveChip(v, tCls(`${v}.label`)))}
                  <span className="mx-1 text-muted-foreground">·</span>
                  {closureChip("all", t("bankFilterAll"))}
                  {(["closed", "open"] as const).map((v) => closureChip(v, tCls(`${v}.label`)))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("bankColQuestion")}</TableHead>
                      <TableHead className="w-28">{t("bankColType")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("bankColExplanation")}</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuiz.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="align-top font-medium">{q.content}</TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {tCls(`${q.cognitive}.label`)}
                          <br />
                          {tCls(`${q.closure}.label`)}
                        </TableCell>
                        <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">{q.explanation}</TableCell>
                        <TableCell className="align-top">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToEdit({ mode: "quiz", content: q.content, closure: q.closure, cognitive: q.cognitive, explanation: q.explanation })}
                          >
                            {t("addToMineBtn")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold">{t("bankTransformTitle", { count: localizedTransformBank.length })}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {localizedTransformBank.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-sm space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{item.source}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => copyToEdit({ mode: "transform", source: item.source, target: item.target, hint: item.hint, example: item.example })}
                      >
                        {t("addToMineBtn")}
                      </Button>
                    </div>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300">
                      {t("transformTarget", { type: item.target === "open" ? tCls("open.label") : item.target === "conceptual" ? tCls("conceptual.label") : tCls("controversial.label") })}
                    </p>
                    <p className="text-xs text-muted-foreground">💡 {item.hint}</p>
                    <p className="text-xs text-muted-foreground">{t("bankExampleLabel")}: {item.example}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold">{t("bankCreateTitle", { count: localizedCreateTopics.length })}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {localizedCreateTopics.map((topic) => (
                  <div key={topic.id} className="rounded-lg border p-3 text-sm space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">📖 {topic.title}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => copyToEdit({ mode: "create", title: topic.title, passage: topic.passage })}
                      >
                        {t("addToMineBtn")}
                      </Button>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{topic.passage}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("bankAiHint")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 탭 3: 최근 진단과 기존 포인트 집계를 함께 보는 담당 학급 현황 */}
      {tab === "stats" && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("statsIntro", { cap: PRACTICE_DAILY_CAP })}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => statsQuery.refetch()}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {t("statsRefresh")}
              </Button>
            </div>

            {statsQuery.isError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
              >
                <span>{t("statsLoadFailed")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => statsQuery.refetch()}
                >
                  {tc("retry")}
                </Button>
              </div>
            ) : statsQuery.isLoading ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                {t("statsLoading")}
              </p>
            ) : !statsQuery.data?.students.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("statsEmpty")}</p>
            ) : (
              <div className="space-y-5">
                <section
                  aria-labelledby="practice-class-summary-title"
                  className="border-y bg-muted/20 px-4 py-4"
                >
                  <h2 id="practice-class-summary-title" className="text-sm font-bold text-foreground">
                    {t("statsClassSummary")}
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("statsActivityAttempts")}</dt>
                      <dd className="mt-0.5 text-lg font-bold text-foreground">
                        {statsQuery.data.summary.activityAttempts}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("statsDiagnosticAttempts")}</dt>
                      <dd className="mt-0.5 text-lg font-bold text-foreground">
                        {statsQuery.data.summary.diagnosticAttempts}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("statsClassAccuracy")}</dt>
                      <dd className="mt-0.5 text-lg font-bold text-foreground">
                        {metricText(statsQuery.data.summary.overall)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("statsRecommendation")}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                        {recommendationText(statsQuery.data.summary)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t pt-4">
                    <h3 className="text-xs font-bold text-foreground">
                      {t("statsTypeMetrics")}
                    </h3>
                    <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {PRACTICE_FOCUSES.map((focus) => (
                        <div key={focus} className="min-w-0 border-l-2 border-emerald-300 pl-2">
                          <dt className="text-xs text-muted-foreground">
                            {tCls(`${focus}.label`)}
                          </dt>
                          <dd className="mt-1 text-sm font-semibold text-foreground">
                            {metricText(statsQuery.data.summary.types[focus])}
                          </dd>
                          <dd className="text-xs text-muted-foreground">
                            {t("statsAttemptCount", {
                              count: statsQuery.data.summary.types[focus].attempts,
                            })}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </section>

                <div
                  role="group"
                  aria-label={t("statsFocusFilter")}
                  className="flex flex-wrap gap-1.5"
                >
                  <button
                    type="button"
                    aria-pressed={focusFilter === "all"}
                    onClick={() => selectFocus("all")}
                    className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium ${
                      focusFilter === "all"
                        ? "border-foreground bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t("statsFilterAll")}
                  </button>
                  {PRACTICE_FOCUSES.map((focus) => (
                    <button
                      key={focus}
                      type="button"
                      aria-pressed={focusFilter === focus}
                      onClick={() => selectFocus(focus)}
                      className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-medium ${
                        focusFilter === focus
                          ? "border-foreground bg-foreground text-background"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {tCls(`${focus}.label`)}
                    </button>
                  ))}
                </div>

                {selectedFocus && statsQuery.data.summary.types[selectedFocus].attempts === 0 && (
                  <section className="border-y border-amber-200 bg-amber-50/70 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/25">
                    <p className="text-sm font-semibold text-foreground">
                      {t("statsNoSampleTitle", { type: tCls(`${selectedFocus}.label`) })}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href={previewHref ?? "/teacher-practice?view=try"}>
                          {t("statsPreviewBuiltIn")}
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={copyStudentHref}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        {t("statsCopyStudentLink")}
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/teacher-practice?view=bank">{t("statsManageBank")}</Link>
                      </Button>
                    </div>
                    {copyStatus === "success" && (
                      <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                        {t("statsCopySuccess")}
                      </p>
                    )}
                    {copyStatus === "error" && (
                      <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
                        {t("statsCopyFailed")}
                      </p>
                    )}
                  </section>
                )}

                <div
                  role="table"
                  aria-label={t("statsStudentTableLabel")}
                  className="overflow-hidden border-y md:border-x"
                >
                  <div role="rowgroup" className="hidden bg-muted/40 md:block">
                    <div
                      role="row"
                      className={`grid items-center ${PRACTICE_STATS_GRID_COLUMNS}`}
                    >
                      <div role="columnheader" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                        {t("statsColStudent")}
                      </div>
                      {[
                        t("statsColToday"),
                        t("statsColWeek"),
                        t("statsActivityAttempts"),
                        t("statsDiagnosticAttempts"),
                        t("statsColAccuracy"),
                        selectedFocus
                          ? t("statsSelectedType", { type: tCls(`${selectedFocus}.label`) })
                          : t("statsRecommendation"),
                      ].map((label, index) => (
                        <div
                          key={label}
                          role="columnheader"
                          className={`px-2 py-2 text-xs font-medium text-muted-foreground ${
                            index === 5 ? "text-left" : "text-center"
                          }`}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div role="rowgroup">
                    {statsQuery.data.students.map((student) => {
                      const isExpanded = expandedStudentId === student.id;
                      const selectedMetric = selectedFocus
                        ? student.types[selectedFocus]
                        : student.overall;
                      const studentContext = [
                        student.grade && t("statsGrade", { grade: student.grade }),
                        student.className && t("statsClass", { className: student.className }),
                        student.studentNumber && t("statsNumber", { number: student.studentNumber }),
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <div
                          key={student.id}
                          role="presentation"
                          className="border-t first:border-t-0"
                        >
                          <div
                            role="row"
                            className={`grid grid-cols-2 gap-x-4 gap-y-3 px-3 py-3 md:items-center md:gap-0 md:px-0 md:py-0 ${PRACTICE_STATS_GRID_COLUMNS}`}
                          >
                            <div role="rowheader" className="col-span-2 min-w-0 md:col-span-1 md:px-3 md:py-3">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={`practice-student-${student.id}`}
                                onClick={() =>
                                  setExpandedStudentId((current) =>
                                    current === student.id ? null : student.id,
                                  )
                                }
                                className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-medium text-foreground hover:underline"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate">{student.name}</span>
                                  {studentContext && (
                                    <span className="block truncate text-xs font-normal text-muted-foreground">
                                      {studentContext}
                                    </span>
                                  )}
                                </span>
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                            {[
                              { label: t("statsColToday"), value: student.todayPoints ? `${student.todayPoints}P` : "-" },
                              { label: t("statsColWeek"), value: student.weekPoints ? `${student.weekPoints}P` : "-" },
                              { label: t("statsActivityAttempts"), value: student.activityAttempts },
                              { label: t("statsDiagnosticAttempts"), value: student.diagnosticAttempts },
                              { label: t("statsColAccuracy"), value: metricText(student.overall) },
                              {
                                label: selectedFocus
                                  ? t("statsSelectedType", { type: tCls(`${selectedFocus}.label`) })
                                  : t("statsRecommendation"),
                                value: selectedFocus
                                  ? metricText(selectedMetric)
                                  : recommendationText(student),
                              },
                            ].map(({ label, value }, index) => (
                              <div
                                key={label}
                                role="cell"
                                className={`flex min-w-0 items-baseline justify-between gap-2 text-sm md:block md:px-2 md:py-3 ${
                                  index === 5 ? "md:text-left" : "md:text-center"
                                }`}
                              >
                                <span className="text-xs text-muted-foreground md:hidden">{label}</span>
                                <span className="min-w-0 font-medium text-foreground md:text-xs">
                                  {value}
                                </span>
                              </div>
                            ))}
                          </div>

                          {isExpanded && (
                            <section
                              id={`practice-student-${student.id}`}
                              role="row"
                              aria-label={t("statsStudentDetails", { student: student.name })}
                              className="border-t bg-muted/20 px-4 py-4"
                            >
                              <div role="cell" aria-colspan={7}>
                                <div className="grid gap-5 lg:grid-cols-2">
                                  <div>
                                    <h3 className="text-sm font-bold text-foreground">
                                      {t("statsModeMetrics")}
                                    </h3>
                                    <dl className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
                                      {([
                                        ["quiz", t("statsModeQuiz"), student.quizCount],
                                        ["transform", t("statsModeTransform"), student.transformCount],
                                        ["create", t("statsModeCreate"), student.createCount],
                                      ] as const).map(([mode, label, successCount]) => (
                                        <div key={mode} className="border-l-2 border-indigo-300 pl-2">
                                          <dt className="text-xs text-muted-foreground">{label}</dt>
                                          <dd className="mt-1 text-sm font-semibold text-foreground">
                                            {metricText(student.modes[mode])}
                                          </dd>
                                          <dd className="text-xs text-muted-foreground">
                                            {t("statsAttemptCount", {
                                              count: student.modes[mode].attempts,
                                            })}
                                          </dd>
                                          <dd className="text-xs text-muted-foreground">
                                            {t("statsSuccessCount", { count: successCount })}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                  <div>
                                    <h3 className="text-sm font-bold text-foreground">
                                      {t("statsTypeMetrics")}
                                    </h3>
                                    <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                      {PRACTICE_FOCUSES.map((focus) => (
                                        <div key={focus} className="border-l-2 border-emerald-300 pl-2">
                                          <dt className="text-xs text-muted-foreground">
                                            {tCls(`${focus}.label`)}
                                          </dt>
                                          <dd className="mt-1 text-sm font-semibold text-foreground">
                                            {metricText(student.types[focus])}
                                          </dd>
                                          <dd className="text-xs text-muted-foreground">
                                            {t("statsAttemptCount", {
                                              count: student.types[focus].attempts,
                                            })}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                </div>
                                {student.capped && (
                                  <p className="mt-3 text-xs text-muted-foreground">{t("statsCapped")}</p>
                                )}
                              </div>
                            </section>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
