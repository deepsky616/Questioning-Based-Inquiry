"use client";

// 질문 연습 공용 뷰 — 학생(/student-practice)과 교사(/teacher-practice)가 함께 사용한다.
// 포인트 지급 여부는 서버(/api/points/practice)가 역할로 판단하므로 뷰는 동일하다.
// 질문 연습 — 학생이 스스로 질문 유형(닫힌/열린, 사실적/개념적/논쟁적)을
// 구분하고, 바꾸고, 만들어 보며 반복 연습하는 페이지.
// 근거: 교육부 「질문기반 탐구수업」·「학생 질문 중심의 교과 수업 모델」
//  - 분류는 정답 맞히기가 아니라 근거를 생각하는 활동 → 모든 문항에 해설 제공
//  - 닫힌→열린, 사실적→개념적→논쟁적 전환·생성 연습 → AI 분류로 즉시 피드백
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { writePracticeDraft } from "@/lib/practice-draft";
import {
  PRACTICE_QUIZ_BANK,
  PRACTICE_TRANSFORM_BANK,
  PRACTICE_CREATE_TOPICS,
  drawFromDeck,
  type Closure,
  type Cognitive,
  type TransformTarget,
  type PracticeQuizItem,
  type PracticeTransformItem,
  type PracticeCreateTopic,
} from "@/lib/question-practice-data";
import {
  focusedPracticeQuizBank,
  type PracticeSelection,
} from "@/lib/practice-selection";

// /api/practice/bank 응답 — 담당 교사가 만든 커스텀 문항(내장 은행에 병합)
interface CustomBank {
  quiz: PracticeQuizItem[];
  transform: PracticeTransformItem[];
  create: PracticeCreateTopic[];
}

const MAX_QUESTION_LENGTH = 200;

interface ClassifyResult {
  closure: Closure;
  cognitive: Cognitive;
  reasoning?: string;
  feedback?: string;
  improvedExample?: string;
}

// /api/points/practice 응답 — 판정·지급 모두 서버가 결정한다
interface AwardInfo {
  awarded: number;
  capped?: boolean;
  alreadyAwarded?: boolean;
}

interface PracticeCheckResponse extends AwardInfo {
  classification: ClassifyResult;
  achieved: boolean;
}

type QuizMode = "closure" | "cognitive";
type PracticeTab = "quiz" | "transform" | "create";

const CLOSURE_CHOICES: Closure[] = ["closed", "open"];
const COGNITIVE_CHOICES: Cognitive[] = ["factual", "conceptual", "controversial"];
const TARGET_CHOICES: TransformTarget[] = ["open", "conceptual", "controversial"];

interface QuestionPracticeViewProps {
  audience: "student" | "teacher";
  studentId?: string;
  initialSelection?: PracticeSelection;
}

export function QuestionPracticeView({ audience, studentId, initialSelection }: QuestionPracticeViewProps) {
  const t = useTranslations("practice");
  const tCls = useTranslations("classification");
  const router = useRouter();
  const [tab, setTab] = useState<PracticeTab>(initialSelection?.tab ?? "quiz");

  const typeLabel = (target: TransformTarget) =>
    target === "open" ? tCls("open.label") : target === "conceptual" ? tCls("conceptual.label") : tCls("controversial.label");

  // ── 교사 커스텀 문항 병합 — 담당 교사가 저장하면 내장 은행에 합쳐져 출제된다 ──
  const { data: customBank } = useQuery<CustomBank>({
    queryKey: ["practice-custom-bank"],
    queryFn: async () => {
      const r = await fetch("/api/practice/bank");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 60_000,
    retry: 1,
  });
  const quizBank = useMemo(
    () => (customBank?.quiz?.length ? [...PRACTICE_QUIZ_BANK, ...customBank.quiz] : PRACTICE_QUIZ_BANK),
    [customBank],
  );
  const transformBank = useMemo(
    () => (customBank?.transform?.length ? [...PRACTICE_TRANSFORM_BANK, ...customBank.transform] : PRACTICE_TRANSFORM_BANK),
    [customBank],
  );
  const createBank = useMemo(
    () => (customBank?.create?.length ? [...PRACTICE_CREATE_TOPICS, ...customBank.create] : PRACTICE_CREATE_TOPICS),
    [customBank],
  );
  const customIds = useMemo(
    () =>
      new Set(
        [...(customBank?.quiz ?? []), ...(customBank?.transform ?? []), ...(customBank?.create ?? [])].map((i) => i.id),
      ),
    [customBank],
  );

  // "교사 출제" 배지 — 커스텀 문항임을 표시
  const renderCustomBadge = (id: string) =>
    customIds.has(id) ? (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        {t("teacherItemBadge")}
      </span>
    ) : null;

  // ── 모드 1: 분류 연습 ──
  const [quizMode, setQuizMode] = useState<QuizMode>(initialSelection?.quizMode ?? "closure");
  const [focus, setFocus] = useState(initialSelection?.focus ?? null);
  const focusedQuizBank = useMemo(
    () => focusedPracticeQuizBank(quizBank, quizMode, focus),
    [focus, quizBank, quizMode],
  );
  // 셔플백 출제 — 은행을 한 바퀴 다 돌기 전에는 같은 문항이 다시 나오지 않는다
  const [quizDeck, setQuizDeck] = useState(() =>
    drawFromDeck(
      focusedPracticeQuizBank(
        PRACTICE_QUIZ_BANK,
        initialSelection?.quizMode ?? "closure",
        initialSelection?.focus ?? null,
      ),
      [],
    ),
  );
  const quizItem = quizDeck.item;
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [quizStats, setQuizStats] = useState({ correct: 0, total: 0 });

  const quizCorrectValue = quizMode === "closure" ? quizItem.closure : quizItem.cognitive;
  const [quizAward, setQuizAward] = useState<AwardInfo | null>(null);
  const quizRequestRef = useRef(0);
  const invalidateQuiz = useCallback(() => {
    quizRequestRef.current += 1;
    setQuizAward(null);
  }, []);
  const nextQuiz = () => {
    invalidateQuiz();
    setQuizDeck((d) => drawFromDeck(focusedQuizBank, d.remaining, d.item.id));
    setQuizAnswer(null);
  };
  const answerQuiz = (value: string) => {
    if (quizAnswer) return;
    const requestId = ++quizRequestRef.current;
    setQuizAnswer(value);
    const correct = value === quizCorrectValue;
    setQuizStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    // 오답도 항상 전송 — 서버가 재검증해 정답이면 지급하고, 시도(정답·오답)를
    // 기록해 문항별 정답률 통계의 재료로 쓴다
    fetch("/api/points/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "quiz", itemId: quizItem.id, quizType: quizMode, answer: value }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (quizRequestRef.current === requestId && data?.correct) setQuizAward(data);
      })
      .catch(() => {});
  };

  // ── 모드 2·3 공용: AI 판정 + 포인트 ──
  const [input, setInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<PracticeCheckResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkRequestRef = useRef(0);

  const invalidateCheck = useCallback(() => {
    checkRequestRef.current += 1;
    setIsChecking(false);
    setCheckResult(null);
    setCheckError(null);
  }, []);

  const resetCheck = useCallback(() => {
    setInput("");
    invalidateCheck();
  }, [invalidateCheck]);

  // ── 모드 2: 질문 바꾸기 ──
  const [transformDeck, setTransformDeck] = useState(() => drawFromDeck(PRACTICE_TRANSFORM_BANK, []));
  // AI가 실시간 출제한 문제(있으면 은행 문항 대신 사용, 실패 시 은행이 폴백)
  const [aiTransform, setAiTransform] = useState<{ source: string; target: TransformTarget; hint: string; example: string } | null>(null);
  const transformItem = aiTransform ?? transformDeck.item;
  const [showHint, setShowHint] = useState(false);
  const nextTransform = () => {
    setAiTransform(null);
    setTransformDeck((d) => drawFromDeck(transformBank, d.remaining, d.item.id));
    setShowHint(false);
    resetCheck();
  };

  // ── 모드 3: 질문 만들기 ──
  const [createDeck, setCreateDeck] = useState(() => drawFromDeck(PRACTICE_CREATE_TOPICS, []));
  const [aiTopic, setAiTopic] = useState<{ title: string; passage: string } | null>(null);
  const createTopic = aiTopic ?? createDeck.item;
  const [createTarget, setCreateTarget] = useState<TransformTarget>("conceptual");
  const nextCreateTopic = () => {
    setAiTopic(null);
    setCreateDeck((d) => drawFromDeck(createBank, d.remaining, d.item.id));
    resetCheck();
  };

  // ── AI 실시간 출제 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const initialSelectionKeyRef = useRef(
    `${initialSelection?.tab ?? "quiz"}:${initialSelection?.quizMode ?? "closure"}:${initialSelection?.focus ?? ""}`,
  );
  useEffect(() => {
    const nextTab = initialSelection?.tab ?? "quiz";
    const nextQuizMode = initialSelection?.quizMode ?? "closure";
    const nextFocus = nextTab === "quiz" ? initialSelection?.focus ?? null : null;
    const nextKey = `${nextTab}:${nextQuizMode}:${nextFocus ?? ""}`;
    if (initialSelectionKeyRef.current === nextKey) return;
    initialSelectionKeyRef.current = nextKey;

    setTab(nextTab);
    setQuizMode(nextQuizMode);
    setFocus(nextFocus);
    setQuizDeck(drawFromDeck(focusedPracticeQuizBank(quizBank, nextQuizMode, nextFocus), []));
    setQuizAnswer(null);
    invalidateQuiz();
    invalidateCheck();
    setShowHint(false);
    setGenError(null);
  }, [
    initialSelection?.focus,
    initialSelection?.quizMode,
    initialSelection?.tab,
    invalidateCheck,
    invalidateQuiz,
    quizBank,
  ]);

  // 커스텀 문항이 도착하면 진행 중인 셔플백에 즉시 합류시킨다
  // (다음 사이클까지 기다리면 "저장했는데 안 나온다"는 혼란이 생긴다)
  const customApplied = useRef(false);
  useEffect(() => {
    if (!customBank || customApplied.current) return;
    customApplied.current = true;
    if (customBank.quiz?.length) {
      setQuizDeck((d) => ({ ...d, remaining: [...d.remaining, ...customBank.quiz.map((i) => i.id)] }));
    }
    if (customBank.transform?.length) {
      setTransformDeck((d) => ({ ...d, remaining: [...d.remaining, ...customBank.transform.map((i) => i.id)] }));
    }
    if (customBank.create?.length) {
      setCreateDeck((d) => ({ ...d, remaining: [...d.remaining, ...customBank.create.map((i) => i.id)] }));
    }
  }, [customBank]);

  const generateAiProblem = async (mode: "transform" | "create") => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("generateFailed"));
      if (mode === "transform") {
        setAiTransform(data);
        setShowHint(false);
      } else {
        setAiTopic(data);
      }
      resetCheck();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : t("generateFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const runCheck = async () => {
    const content = input.trim();
    if (!content || isChecking) return;
    const requestId = ++checkRequestRef.current;
    setIsChecking(true);
    setCheckError(null);
    setCheckResult(null);
    // AI 출제 문항은 은행에 없으므로 원문(source/passage)을 함께 보내 서버가 판정·지급한다
    const payload =
      tab === "transform"
        ? aiTransform
          ? { mode: "transform-ai", source: aiTransform.source, target: aiTransform.target, content }
          : { mode: "transform", itemId: transformDeck.item.id, content }
        : aiTopic
          ? { mode: "create-ai", passage: aiTopic.passage, target: createTarget, content }
          : { mode: "create", topicId: createDeck.item.id, target: createTarget, content };
    try {
      const res = await fetch("/api/points/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (checkRequestRef.current !== requestId) return;
      if (!res.ok) throw new Error(data.error || t("aiError"));
      setCheckResult(data);
    } catch (err) {
      if (checkRequestRef.current !== requestId) return;
      setCheckError(err instanceof Error ? err.message : t("aiError"));
    } finally {
      if (checkRequestRef.current === requestId) setIsChecking(false);
    }
  };

  const activeTarget: TransformTarget = tab === "transform" ? transformItem.target : createTarget;
  const achieved = checkResult?.achieved ?? false;

  const useQuestionInClass = () => {
    if (audience !== "student" || !studentId) return;
    const saved = writePracticeDraft(window.sessionStorage, studentId, {
      content: input,
      mode: tab === "transform" ? "transform" : "create",
      target: activeTarget,
    });
    if (!saved) {
      setCheckError(t("draftSaveFailed"));
      return;
    }
    router.push("/student-ask?draft=practice");
  };

  const switchTab = (next: PracticeTab) => {
    setTab(next);
    resetCheck();
    setShowHint(false);
    setGenError(null);
  };

  const switchQuizMode = (next: QuizMode) => {
    setQuizMode(next);
    setFocus(null);
    setQuizDeck(drawFromDeck(focusedPracticeQuizBank(quizBank, next, null), []));
    setQuizAnswer(null);
    invalidateQuiz();
    invalidateCheck();
  };

  // 지급 결과 배지 (퀴즈·바꾸기·만들기 공용)
  const renderAwardBadge = (award: AwardInfo | null) => {
    if (!award) return null;
    if (award.awarded > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-bold text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">
          {t("pointsEarned", { points: award.awarded })}
        </span>
      );
    }
    if (award.alreadyAwarded) {
      return <span className="text-xs text-muted-foreground">{t("alreadyAwarded")}</span>;
    }
    if (award.capped) {
      return <span className="text-xs text-muted-foreground">{t("dailyCapReached")}</span>;
    }
    return null;
  };

  // AI 판정 결과 카드 (바꾸기·만들기 공용)
  const renderCheckResult = () => {
    if (!checkResult) return null;
    const cls = checkResult.classification;
    return (
      <div className={`rounded-lg border p-4 space-y-2 ${achieved ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
        <p className={`flex flex-wrap items-center gap-2 font-semibold ${achieved ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
          {achieved ? t("achieved", { type: typeLabel(activeTarget) }) : t("notAchieved", { type: typeLabel(activeTarget) })}
          {renderAwardBadge(checkResult)}
        </p>
        <p className="text-sm text-foreground">
          {t("aiJudged", { closure: tCls(`${cls.closure}.label`), cognitive: tCls(`${cls.cognitive}.label`) })}
        </p>
        {cls.reasoning && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{t("aiReasonLabel")}:</span> {cls.reasoning}
          </p>
        )}
        {cls.feedback && <p className="text-sm text-muted-foreground">{cls.feedback}</p>}
        {!achieved && cls.improvedExample && (
          <p className="text-sm text-indigo-700 dark:text-indigo-300">
            <span className="font-medium">{t("aiExampleLabel")}:</span> {cls.improvedExample}
          </p>
        )}
      </div>
    );
  };

  const renderInputArea = (placeholder: string) => (
    <div className="space-y-3">
      <Textarea
        value={input}
        onChange={(e) => {
          setInput(e.target.value.slice(0, MAX_QUESTION_LENGTH));
          invalidateCheck();
        }}
        placeholder={placeholder}
        rows={3}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{input.length}/{MAX_QUESTION_LENGTH}</span>
        <Button onClick={runCheck} disabled={isChecking || !input.trim()} variant="gradient" className="h-11 px-6">
          {isChecking ? t("checking") : t("checkBtn")}
        </Button>
      </div>
      {checkError && <p className="text-sm text-red-600">{checkError}</p>}
      {renderCheckResult()}
      {achieved && audience === "student" && studentId && (
        <Button onClick={useQuestionInClass} variant="outline" className="h-11 w-full sm:w-auto">
          {t("useQuestionInClass")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 연습 모드 탭 */}
      <div className="flex gap-2" role="tablist" aria-label={t("title")}>
        {(["quiz", "transform", "create"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {t(`tab_${key}`)}
          </button>
        ))}
      </div>

      {/* 모드 1: 분류 연습 */}
      {tab === "quiz" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(["closure", "cognitive"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchQuizMode(m)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                      quizMode === m ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-muted-foreground"
                    }`}
                  >
                    {t(`quizMode_${m}`)}
                  </button>
                ))}
                {focus && (
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    {t("focusActive", { type: tCls(`${focus}.label`) })}
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {t("score", { correct: quizStats.correct, total: quizStats.total })}
              </span>
            </div>

            <div className="rounded-xl bg-muted/40 p-5">
              <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                {t("quizPrompt")}
                {renderCustomBadge(quizItem.id)}
              </p>
              <p className="text-lg font-medium text-foreground">{quizItem.content}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(quizMode === "closure" ? CLOSURE_CHOICES : COGNITIVE_CHOICES).map((choice) => {
                const isPicked = quizAnswer === choice;
                const isCorrect = choice === quizCorrectValue;
                const decided = quizAnswer !== null;
                return (
                  <Button
                    key={choice}
                    variant="outline"
                    disabled={decided}
                    onClick={() => answerQuiz(choice)}
                    className={`h-11 flex-1 min-w-[130px] ${
                      decided && isCorrect ? "border-green-400 bg-green-50 text-green-700 disabled:opacity-100 dark:bg-green-950/40 dark:text-green-300"
                      : decided && isPicked ? "border-red-300 bg-red-50 text-red-600 disabled:opacity-100 dark:bg-red-950/40 dark:text-red-300"
                      : ""
                    }`}
                  >
                    {tCls(`${choice}.label`)}
                  </Button>
                );
              })}
            </div>

            {quizAnswer && (
              <div className={`rounded-lg border p-4 space-y-1.5 ${quizAnswer === quizCorrectValue ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}>
                <p className={`flex flex-wrap items-center gap-2 font-semibold ${quizAnswer === quizCorrectValue ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {quizAnswer === quizCorrectValue ? t("quizCorrect") : t("quizWrong", { answer: tCls(`${quizCorrectValue}.label`) })}
                  {quizAnswer === quizCorrectValue && renderAwardBadge(quizAward)}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("quizWhy")}:</span> {quizItem.explanation}
                </p>
                <div className="pt-2">
                  <Button onClick={nextQuiz} variant="gradient" className="h-11 w-full sm:w-auto sm:px-8">
                    {t("nextQuestion")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 모드 2: 질문 바꾸기 */}
      {tab === "transform" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">{t("transformIntro")}</p>
            <div className="rounded-xl bg-muted/40 p-5 space-y-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("transformSourceLabel")}
                {aiTransform && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                    {t("aiGeneratedBadge")}
                  </span>
                )}
                {!aiTransform && renderCustomBadge(transformDeck.item.id)}
              </p>
              <p className="text-lg font-medium text-foreground">{transformItem.source}</p>
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                {t("transformTarget", { type: typeLabel(transformItem.target) })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowHint((v) => !v)}
                className="text-sm text-indigo-600 underline-offset-2 hover:underline"
              >
                {showHint ? t("hideHint") : t("showHint")}
              </button>
              <Button variant="outline" size="sm" onClick={nextTransform}>{t("newProblem")}</Button>
              <Button variant="outline" size="sm" onClick={() => generateAiProblem("transform")} disabled={isGenerating}>
                {isGenerating ? t("aiGenerating") : t("aiNewProblem")}
              </Button>
            </div>
            {genError && <p className="text-sm text-red-600">{genError}</p>}
            {showHint && <p className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">💡 {transformItem.hint}</p>}

            {renderInputArea(t("transformPlaceholder"))}

            {checkResult && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{t("bankExampleLabel")}:</span> {transformItem.example}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 모드 3: 질문 만들기 */}
      {tab === "create" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">{t("createIntro")}</p>
            <div className="rounded-xl bg-muted/40 p-5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  📖 {createTopic.title}
                  {aiTopic && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      {t("aiGeneratedBadge")}
                    </span>
                  )}
                  {!aiTopic && renderCustomBadge(createDeck.item.id)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={nextCreateTopic}>{t("newTopic")}</Button>
                  <Button variant="outline" size="sm" onClick={() => generateAiProblem("create")} disabled={isGenerating}>
                    {isGenerating ? t("aiGenerating") : t("aiNewTopic")}
                  </Button>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{createTopic.passage}</p>
            </div>
            {genError && <p className="text-sm text-red-600">{genError}</p>}

            <div>
              <p className="text-sm font-medium mb-2">{t("createTargetLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {TARGET_CHOICES.map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => {
                      setCreateTarget(target);
                      invalidateCheck();
                    }}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                      createTarget === target ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" : "text-muted-foreground"
                    }`}
                  >
                    {typeLabel(target)}
                  </button>
                ))}
              </div>
            </div>

            {renderInputArea(t("createPlaceholder", { type: typeLabel(createTarget) }))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
