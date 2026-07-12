"use client";

// 교사용 질문 연습 — 학생과 같은 연습(탭1)에 더해, 교사 전용으로
// 문항 은행 열람·복사(탭2)와 담당 학급 학생의 연습 현황(탭3)을 제공한다.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { PRACTICE_POINTS, PRACTICE_DAILY_CAP } from "@/lib/practice-points";

type TeacherPracticeTab = "try" | "bank" | "stats";

interface PracticeStatRow {
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
}

export default function TeacherPracticePage() {
  const t = useTranslations("practice");
  const tCls = useTranslations("classification");
  const [tab, setTab] = useState<TeacherPracticeTab>("try");

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
  );

  // ── 탭 3: 학생 연습 현황 ──
  const { data: stats, isLoading: statsLoading, refetch } = useQuery<{ students: PracticeStatRow[] }>({
    queryKey: ["teacher-practice-stats"],
    queryFn: async () => {
      const r = await fetch("/api/teacher/practice-stats");
      if (!r.ok) throw new Error("연습 현황을 불러오지 못했습니다");
      return r.json();
    },
    enabled: tab === "stats",
    refetchOnWindowFocus: true,
  });

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
            onClick={() => setTab(key)}
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
          <QuestionPracticeView />
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
              <h3 className="font-semibold">{t("bankTransformTitle", { count: PRACTICE_TRANSFORM_BANK.length })}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {PRACTICE_TRANSFORM_BANK.map((item) => (
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
              <h3 className="font-semibold">{t("bankCreateTitle", { count: PRACTICE_CREATE_TOPICS.length })}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {PRACTICE_CREATE_TOPICS.map((topic) => (
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

      {/* 탭 3: 학생 연습 현황 — PointLog(PRACTICE) 집계 */}
      {tab === "stats" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("statsIntro", { cap: PRACTICE_DAILY_CAP })}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>{t("statsRefresh")}</Button>
            </div>
            {statsLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("statsLoading")}</p>
            ) : !stats?.students.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("statsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("statsColStudent")}</TableHead>
                      <TableHead className="text-center">{t("statsColToday")}</TableHead>
                      <TableHead className="text-center">{t("statsColWeek")}</TableHead>
                      <TableHead className="text-center">{t("statsColQuiz")}</TableHead>
                      <TableHead className="text-center">{t("statsColTransform")}</TableHead>
                      <TableHead className="text-center">{t("statsColCreate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.students.map((s) => (
                      <TableRow key={s.id} className={s.weekPoints === 0 ? "opacity-60" : ""}>
                        <TableCell className="font-medium">
                          {[s.grade && `${s.grade}학년`, s.className && `${s.className}반`, s.studentNumber && `${s.studentNumber}번`]
                            .filter(Boolean)
                            .join(" ")}{" "}
                          {s.name}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {s.todayPoints > 0 ? `${s.todayPoints}P` : "-"}
                        </TableCell>
                        <TableCell className="text-center">{s.weekPoints > 0 ? `${s.weekPoints}P` : "-"}</TableCell>
                        <TableCell className="text-center">{s.quizCount || "-"}</TableCell>
                        <TableCell className="text-center">{s.transformCount || "-"}</TableCell>
                        <TableCell className="text-center">{s.createCount || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
