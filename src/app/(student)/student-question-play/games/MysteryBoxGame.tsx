"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";
import { getMysteryItem } from "@/lib/mystery-box-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";
import { GameHeader } from "./GameHeader";
import {
  useGameRun,
  type MysteryRunHistoryItem,
  type UnconfirmedMysteryAction,
} from "./useGameRun";

interface Props {
  game: BuiltInGame;
  onBack: () => void;
  config: GameStartConfig;
}

const AI_NAME = "🤖 AI";
const AI_THINK_MS = 1_000;

const MYSTERY_PRESENTATION: Record<
  string,
  { emoji: string; category: { ko: string; en: string } }
> = {
  apple: { emoji: "🍎", category: { ko: "과일", en: "fruit" } },
  puppy: { emoji: "🐶", category: { ko: "동물", en: "animal" } },
  book: { emoji: "📚", category: { ko: "물건", en: "object" } },
  car: { emoji: "🚗", category: { ko: "탈것", en: "vehicle" } },
  butterfly: { emoji: "🦋", category: { ko: "동물", en: "animal" } },
  piano: { emoji: "🎹", category: { ko: "악기", en: "instrument" } },
  sun: { emoji: "☀️", category: { ko: "우주", en: "space" } },
  strawberry: { emoji: "🍓", category: { ko: "과일", en: "fruit" } },
  rocket: { emoji: "🚀", category: { ko: "탈것", en: "vehicle" } },
  sunflower: { emoji: "🌻", category: { ko: "식물", en: "plant" } },
  snowman: { emoji: "⛄", category: { ko: "만든 것", en: "made object" } },
  dragon: { emoji: "🐉", category: { ko: "상상 속 생물", en: "imaginary creature" } },
};

export default function MysteryBoxGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const mysteryLocale = locale === "en" ? "en" : "ko";
  const text = getQuestionGameText(locale);
  const isAI = config.mode === "ai";
  const studentName = config.players[0]?.trim() || text.me;
  const [phase, setPhase] = useState<"setup" | "starting" | "play">("setup");
  const [question, setQuestion] = useState("");
  const [guess, setGuess] = useState("");
  const [isGuessing, setIsGuessing] = useState(false);
  const autoAiKeyRef = useRef<string | null>(null);
  const {
    run,
    result,
    pending,
    error,
    conflict,
    unconfirmedMysteryAction,
    start,
    submitMysteryQuestion,
    submitMysteryGuess,
    runMysteryAiTurn,
    reset,
    clearError,
  } = useGameRun();

  const requestBlocked = pending !== null || unconfirmedMysteryAction !== null;
  const inputBlocked = requestBlocked || Boolean(conflict);

  useEffect(() => {
    if (
      phase !== "play" ||
      !run ||
      run.gameId !== "mystery-box" ||
      run.mysteryNextStep !== "AI_TURN" ||
      pending !== null ||
      error ||
      conflict ||
      unconfirmedMysteryAction
    ) return;
    const key = `${run.id}:${run.version}:mystery-ai-turn`;
    if (autoAiKeyRef.current === key) return;
    const timer = setTimeout(() => {
      autoAiKeyRef.current = key;
      void runMysteryAiTurn(run);
    }, AI_THINK_MS);
    return () => clearTimeout(timer);
  }, [
    conflict,
    error,
    pending,
    phase,
    run,
    runMysteryAiTurn,
    unconfirmedMysteryAction,
  ]);

  async function startGame() {
    clearError();
    setPhase("starting");
    const created = await start(
      "mystery-box",
      isAI ? "ai" : "solo",
      "",
      mysteryLocale,
    );
    if (!created) return;
    autoAiKeyRef.current = null;
    setQuestion("");
    setGuess("");
    setIsGuessing(false);
    setPhase("play");
  }

  function restart() {
    reset();
    autoAiKeyRef.current = null;
    setQuestion("");
    setGuess("");
    setIsGuessing(false);
    setPhase("setup");
  }

  function handleBack() {
    if (requestBlocked) return;
    reset();
    onBack();
  }

  async function handleQuestionSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!run || inputBlocked || run.mysteryNextStep !== "STUDENT_ACTION") return;
    const normalized = question.trim();
    if (!normalized) return;
    const submitted = await submitMysteryQuestion(normalized, mysteryLocale, run);
    if (submitted) setQuestion("");
  }

  async function handleGuessSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!run || inputBlocked || run.mysteryNextStep !== "STUDENT_ACTION") return;
    const normalized = guess.trim();
    if (!normalized) return;
    const submitted = await submitMysteryGuess(normalized, mysteryLocale, run);
    if (submitted) {
      setGuess("");
      setIsGuessing(false);
    }
  }

  async function retryMysteryAction() {
    if (!run || pending !== null || conflict) return;
    const uncertain = unconfirmedMysteryAction;
    clearError();
    if (uncertain?.action === "mystery-submit-question") {
      const submitted = await submitMysteryQuestion(
        uncertain.question,
        uncertain.locale,
        run,
      );
      if (submitted) setQuestion("");
      return;
    }
    if (uncertain?.action === "mystery-submit-guess") {
      const submitted = await submitMysteryGuess(
        uncertain.guess,
        uncertain.locale,
        run,
      );
      if (submitted) {
        setGuess("");
        setIsGuessing(false);
      }
      return;
    }
    if (
      uncertain?.action === "mystery-ai-turn" ||
      run.mysteryNextStep === "AI_TURN"
    ) {
      await runMysteryAiTurn(run);
    }
  }

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="game-shared-header flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {text.backToList}
          </button>
          <div
            className="flex flex-1 items-center gap-4 rounded-2xl px-6 py-4 text-white"
            style={{ background: game.gradientCss }}
          >
            <span className="text-4xl">{game.emoji}</span>
            <div>
              <h1 className="text-xl font-black">{game.title}</h1>
              <p className="text-sm text-white">
                {isAI ? text.mysteryAiSubtitle : text.mysterySoloSubtitle}
              </p>
            </div>
          </div>
        </div>
        <section className="space-y-5 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="text-center">
            <div className="text-7xl" aria-hidden="true">📦</div>
            <h2 className="mt-3 text-xl font-black text-foreground">
              {isAI
                ? (locale === "en" ? "Solve it before AI" : "인공지능보다 먼저 맞혀 보세요")
                : (locale === "en" ? "Find the hidden object" : "상자 속 물건을 찾아보세요")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isAI
                ? (locale === "en"
                    ? "You and AI alternate. A question or a guess counts as one activity."
                    : "질문과 추측을 합쳐 인공지능과 한 번씩 번갈아 진행해요.")
                : (locale === "en"
                    ? "Ask yes-or-no questions or make a guess within 20 activities."
                    : "예 또는 아니오로 답할 수 있는 질문과 추측을 합쳐 20회 안에 맞혀요.")}
            </p>
          </div>
          {isAI && (
            <div className="flex justify-center gap-2">
              {[studentName, AI_NAME].map((name, index) => (
                <span
                  key={name}
                  className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-foreground"
                >
                  {index + 1}. {name}
                </span>
              ))}
            </div>
          )}
          <Button
            type="button"
            className="w-full py-5 font-black text-white"
            style={{ background: "linear-gradient(135deg, #9D174D, #9F1239)" }}
            onClick={() => void startGame()}
          >
            {text.start}
          </Button>
        </section>
      </div>
    );
  }

  if (phase === "starting") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader
          game={game}
          subtitle={locale === "en" ? "Preparing the box" : "상자를 준비하고 있어요"}
          onBack={handleBack}
          backDisabled={requestBlocked}
        />
        <section className="space-y-4 rounded-lg border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
          {pending === "create" ? (
            <>
              <div className="animate-bounce text-7xl" aria-hidden="true">📦</div>
              <p role="status" className="text-sm font-bold text-muted-foreground">
                {locale === "en" ? "Choosing a hidden object..." : "비밀 물건을 고르고 있어요..."}
              </p>
            </>
          ) : (
            <>
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
              >
                {error ?? (locale === "en"
                  ? "Could not prepare the mystery box."
                  : "미스터리 박스를 준비하지 못했습니다.")}
              </div>
              <Button type="button" className="w-full font-bold" onClick={() => void startGame()}>
                {locale === "en" ? "Try again" : "다시 시작하기"}
              </Button>
            </>
          )}
        </section>
      </div>
    );
  }

  if (!run || run.gameId !== "mystery-box") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader game={game} subtitle={game.description} onBack={handleBack} />
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
        >
          {locale === "en"
            ? "Could not read the mystery box game."
            : "미스터리 박스 실행을 읽지 못했습니다."}
        </div>
        <Button type="button" className="w-full font-bold" onClick={restart}>
          {locale === "en" ? "Start over" : "새로 시작하기"}
        </Button>
      </div>
    );
  }

  if (conflict) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader game={game} subtitle={game.description} onBack={handleBack} />
        <div
          role="alert"
          className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {conflict}
        </div>
        <Button type="button" className="w-full font-bold" onClick={restart}>
          {locale === "en" ? "Start a new game" : "새 실행 시작하기"}
        </Button>
      </div>
    );
  }

  if (run.status === "SETTLED" && run.mysteryNextStep === "COMPLETE") {
    const answerItem = run.mysteryAnswerItemId
      ? getMysteryItem(run.mysteryAnswerItemId)
      : null;
    const presentation = run.mysteryAnswerItemId
      ? MYSTERY_PRESENTATION[run.mysteryAnswerItemId]
      : null;
    const studentSolved = run.mysteryEndReason === "SOLVED" &&
      run.mysteryWinner === "STUDENT";
    const aiSolved = run.mysteryEndReason === "SOLVED" && run.mysteryWinner === "AI";
    const title = studentSolved
      ? (locale === "en" ? "You found it!" : "정답을 맞혔어요!")
      : aiSolved
        ? (locale === "en" ? "AI found it first" : "인공지능이 먼저 맞혔어요")
        : (locale === "en" ? "All 20 activities are complete" : "20회 활동을 모두 마쳤어요");
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader
          game={game}
          subtitle={locale === "en" ? "Mystery solved" : "미스터리 박스 완료"}
          onBack={handleBack}
          backDisabled={requestBlocked}
        />
        <section className="space-y-5 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="text-center">
            <div className="text-7xl" aria-hidden="true">
              {presentation?.emoji ?? "📦"}
            </div>
            <h2 className="mt-3 text-2xl font-black text-foreground">{title}</h2>
            <p className="mt-3 text-3xl font-black text-foreground">
              {answerItem?.names[mysteryLocale] ?? (locale === "en" ? "Unknown" : "확인할 수 없음")}
            </p>
            {presentation && (
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {presentation.category[mysteryLocale]}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <StatBox
              label={locale === "en" ? "Total activities" : "전체 활동"}
              value={run.questionCount}
            />
            <StatBox
              label={locale === "en" ? "Your questions" : "내 질문"}
              value={run.mysteryStudentQuestionCount ?? 0}
            />
          </div>

          {result && <PointResult result={result} locale={locale} />}

          <MysteryHistory
            entries={run.mysteryHistory ?? []}
            studentName={studentName}
            locale={locale}
          />

          <Button
            type="button"
            className="w-full py-5 font-black text-white"
            style={{ background: "linear-gradient(135deg, #9D174D, #9F1239)" }}
            onClick={restart}
          >
            {text.retry}
          </Button>
        </section>
      </div>
    );
  }

  const remaining = Math.max(0, run.targetCount - run.questionCount);
  const aiTurn = run.mysteryNextStep === "AI_TURN";
  const subtitle = aiTurn
    ? (locale === "en" ? "AI's turn" : "인공지능 차례")
    : (locale === "en" ? `${studentName}'s turn` : `${studentName} 차례`);
  const canRetry = Boolean(unconfirmedMysteryAction || aiTurn);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <GameHeader
        game={game}
        subtitle={`${subtitle} · ${run.questionCount}/${run.targetCount}`}
        onBack={handleBack}
        backDisabled={requestBlocked}
      />

      {error && (
        <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <p role="alert">{error}</p>
          {canRetry && (
            <Button
              type="button"
              variant="outline"
              className="w-full font-bold"
              disabled={pending !== null}
              onClick={() => void retryMysteryAction()}
            >
              {unconfirmedMysteryAction
                ? (locale === "en" ? "Check this activity again" : "이 활동 다시 확인하기")
                : (locale === "en" ? "Retry AI turn" : "인공지능 차례 다시 시도하기")}
            </Button>
          )}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-5">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-pink-300 bg-pink-50 text-6xl dark:border-pink-700 dark:bg-pink-950"
            aria-label={locale === "en" ? "Hidden object" : "비밀 물건"}
          >
            📦
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-sm text-foreground">
              <span className="font-black text-foreground">
                {locale === "en" ? "Activity progress" : "활동 진행"}
              </span>
              <span className="font-bold text-muted-foreground">
                {locale === "en" ? `${remaining} left` : `${remaining}회 남음`}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-pink-600 transition-[width] duration-300 dark:bg-pink-400"
                style={{ width: `${(run.questionCount / run.targetCount) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              {locale === "en"
                ? `Your valid questions: ${run.mysteryStudentQuestionCount ?? 0}`
                : `내가 작성한 유효 질문 ${run.mysteryStudentQuestionCount ?? 0}개`}
            </p>
          </div>
        </div>
      </section>

      {aiTurn ? (
        <section className="rounded-lg border border-indigo-300 bg-indigo-50 p-5 text-center text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100">
          <div className="flex items-center justify-center gap-2">
            {pending === "ai" && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
            <p role="status" className="text-sm font-bold">
              {pending === "ai"
                ? (locale === "en" ? "AI is thinking..." : "인공지능이 생각하고 있어요...")
                : (locale === "en" ? "AI's turn is ready." : "인공지능 차례를 준비했어요.")}
            </p>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
          {!isGuessing ? (
            <form className="space-y-3" onSubmit={handleQuestionSubmit}>
              <label htmlFor="mystery-question" className="block text-sm font-black text-foreground">
                {locale === "en" ? "Ask a yes-or-no question" : "예 또는 아니오 질문하기"}
              </label>
              <textarea
                id="mystery-question"
                value={question}
                maxLength={QUESTION_GAME_LIMITS.question}
                disabled={inputBlocked}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (error && !unconfirmedMysteryAction) clearError();
                }}
                rows={3}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                placeholder={locale === "en"
                  ? "Example: Is it something people made?"
                  : "예: 사람이 만든 것인가요?"}
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="min-w-0 flex-1 font-bold"
                  disabled={inputBlocked || !question.trim()}
                >
                  {pending === "action"
                    ? (locale === "en" ? "Checking..." : "확인 중...")
                    : (locale === "en" ? "Ask" : "질문하기")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 font-bold"
                  disabled={inputBlocked}
                  onClick={() => setIsGuessing(true)}
                >
                  {locale === "en" ? "Make a guess" : "정답 추측"}
                </Button>
              </div>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={handleGuessSubmit}>
              <label htmlFor="mystery-guess" className="block text-sm font-black text-foreground">
                {locale === "en" ? "What is inside the box?" : "상자 속 물건은 무엇인가요?"}
              </label>
              <input
                id="mystery-guess"
                value={guess}
                maxLength={QUESTION_GAME_LIMITS.shortWord}
                disabled={inputBlocked}
                onChange={(event) => {
                  setGuess(event.target.value);
                  if (error && !unconfirmedMysteryAction) clearError();
                }}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                placeholder={locale === "en" ? "Write the object's name" : "물건 이름을 입력하세요"}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="min-w-0 flex-1 font-bold"
                  disabled={inputBlocked || !guess.trim()}
                >
                  {pending === "action"
                    ? (locale === "en" ? "Checking..." : "확인 중...")
                    : (locale === "en" ? "Submit guess" : "정답 제출")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 font-bold"
                  disabled={inputBlocked}
                  onClick={() => setIsGuessing(false)}
                >
                  {locale === "en" ? "Keep asking" : "질문 계속하기"}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      <MysteryHistory
        entries={run.mysteryHistory ?? []}
        studentName={studentName}
        locale={locale}
      />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}

function PointResult({
  result,
  locale,
}: {
  result: {
    awarded: number;
    dailyRemaining: number;
    cappedByLimit: boolean;
    preview: boolean;
  };
  locale: string;
}) {
  const positive = result.awarded > 0;
  return (
    <div
      role="status"
      className={`rounded-lg border p-3 text-sm ${positive
        ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
        : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      }`}
    >
      <p className="font-bold">
        {result.preview
          ? (locale === "en"
              ? "Preview completed without points."
              : "미리보기로 완료되어 포인트는 지급되지 않아요.")
          : positive
            ? (locale === "en"
                ? `+${result.awarded} points earned!`
                : `+${result.awarded}점 적립!`)
            : (locale === "en"
                ? "The daily point limit has been reached."
                : "오늘 받을 수 있는 질문놀이 포인트를 모두 받았어요.")}
      </p>
      {!result.preview && result.cappedByLimit && (
        <p className="mt-1 text-xs">
          {locale === "en"
            ? "The award was limited by today's point cap."
            : "오늘 포인트 상한에 맞춰 일부만 적립됐어요."}
        </p>
      )}
      {!result.preview && result.dailyRemaining > 0 && (
        <p className="mt-1 text-xs">
          {locale === "en"
            ? `${result.dailyRemaining} points are still available today.`
            : `오늘 ${result.dailyRemaining}점 더 받을 수 있어요.`}
        </p>
      )}
    </div>
  );
}

function MysteryHistory({
  entries,
  studentName,
  locale,
}: {
  entries: MysteryRunHistoryItem[];
  studentName: string;
  locale: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-foreground">
          {locale === "en" ? "Activity history" : "활동 기록"}
        </h2>
        <span className="text-xs font-semibold text-muted-foreground">
          {locale === "en" ? `${entries.length} activities` : `${entries.length}개`}
        </span>
      </div>
      <ol className="mt-3 max-h-96 divide-y divide-border overflow-y-auto border-y border-border">
        {entries.map((entry) => {
          const actor = entry.actor === "AI" ? AI_NAME : studentName;
          const detail = entry.kind === "QUESTION"
            ? entry.answer === "yes"
              ? (locale === "en" ? "Yes" : "예")
              : (locale === "en" ? "No" : "아니오")
            : entry.correct
              ? (locale === "en" ? "Correct guess" : "정답")
              : (locale === "en" ? "Not the answer" : "정답이 아님");
          return (
            <li key={entry.sequence} className="py-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="w-6 shrink-0 font-black text-pink-700 dark:text-pink-300">
                  {entry.sequence}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-foreground">
                    {actor} · {entry.kind === "QUESTION"
                      ? (locale === "en" ? "Question" : "질문")
                      : (locale === "en" ? "Guess" : "추측")}
                  </p>
                  <p className="mt-1 break-words text-foreground">{entry.text}</p>
                  <p className={`mt-1 font-bold ${
                    entry.kind === "GUESS" && entry.correct
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground"
                  }`}>
                    {detail}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
