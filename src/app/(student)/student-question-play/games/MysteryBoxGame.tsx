"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MYSTERY_PRESENTATION } from "./mystery-box-presentation";
import { Button } from "@/components/ui/button";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";
import { getMysteryItem } from "@/lib/mystery-box-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";
import { GameHeader } from "./GameHeader";
import { GameLearningSummary } from "./GameLearningSummary";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";
import { useLearningSounds } from "@/lib/learning-sounds";
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

function localGuessBlockKey(
  history: readonly MysteryRunHistoryItem[],
  studentQuestionCount: number,
) {
  if (studentQuestionCount < 3) return "mysteryGuessNeedThreeStudentQuestions";
  const lastStudentQuestion = history.findLastIndex(
    (entry) => entry.actor === "STUDENT" && entry.kind === "QUESTION",
  );
  const lastStudentWrongGuess = history.findLastIndex(
    (entry) =>
      entry.actor === "STUDENT" &&
      entry.kind === "GUESS" &&
      !entry.correct,
  );
  return lastStudentWrongGuess >= lastStudentQuestion
    ? "mysteryGuessNeedQuestionAfterWrong"
    : null;
}

export default function MysteryBoxGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const mysteryLocale = locale === "en" ? "en" : "ko";
  const text = getQuestionGameText(locale);
  const { play: playSound } = useLearningSounds();
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
    if (submitted) {
      if (submitted.run.status !== "SETTLED") playSound("reveal");
      setQuestion("");
    }
  }

  async function handleGuessSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!run || inputBlocked || run.mysteryNextStep !== "STUDENT_ACTION") return;
    if (localGuessBlockKey(
      run.mysteryHistory ?? [],
      run.mysteryStudentQuestionCount ?? 0,
    )) return;
    const normalized = guess.trim();
    if (!normalized) return;
    const submitted = await submitMysteryGuess(normalized, mysteryLocale, run);
    if (submitted) {
      if (submitted.run.status !== "SETTLED") playSound("retry");
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
      if (submitted) {
        if (submitted.run.status !== "SETTLED") playSound("reveal");
        setQuestion("");
      }
      return;
    }
    if (uncertain?.action === "mystery-submit-guess") {
      const submitted = await submitMysteryGuess(
        uncertain.guess,
        uncertain.locale,
        run,
      );
      if (submitted) {
        if (submitted.run.status !== "SETTLED") playSound("retry");
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
          <LearningSoundToggle />
        </div>
        <section className="space-y-5 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="text-center">
            <div className="text-7xl" aria-hidden="true">📦</div>
            <h2 className="mt-3 text-xl font-black text-foreground">
              {isAI
                ? (t("solveItBeforeAi"))
                : (t("findTheHiddenObject"))}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isAI
                ? (t("youAndAiAlternateA"))
                : (t("askYesOrNoQuestions"))}
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
          subtitle={t("preparingTheBox")}
          onBack={handleBack}
          backDisabled={requestBlocked}
        />
        <section className="space-y-4 rounded-lg border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
          {pending === "create" ? (
            <>
              <div className="animate-bounce text-7xl" aria-hidden="true">📦</div>
              <p role="status" className="text-sm font-bold text-muted-foreground">
                {t("choosingAHiddenObject")}
              </p>
            </>
          ) : (
            <>
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
              >
                {error ?? (t("couldNotPrepareTheMystery"))}
              </div>
              <Button type="button" className="w-full font-bold" onClick={() => void startGame()}>
                {t("tryAgain")}
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
          {t("couldNotReadTheMystery")}
        </div>
        <Button type="button" className="w-full font-bold" onClick={restart}>
          {t("startOver")}
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
          {t("startANewGame")}
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
      ? (t("youFoundIt"))
      : aiSolved
        ? (t("aiFoundItFirst"))
        : (t("all20ActivitiesAreComplete"));
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader
          game={game}
          subtitle={t("mysterySolved")}
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
              {answerItem?.names[mysteryLocale] ?? (t("unknown"))}
            </p>
            {presentation && (
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {presentation.category[mysteryLocale]}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <StatBox
              label={t("totalActivities")}
              value={run.questionCount}
            />
            <StatBox
              label={t("yourQuestions")}
              value={run.mysteryStudentQuestionCount ?? 0}
            />
          </div>

          {result && <PointResult result={result} locale={locale} />}

          <GameLearningSummary
            mode={isAI ? "ai" : "solo"}
            completedActivities={run.mysteryActivityCount ?? run.questionCount}
            questions={(run.mysteryHistory ?? [])
              .filter((entry) => entry.actor === "STUDENT" && entry.kind === "QUESTION")
              .map((entry) => entry.text)}
            points={result?.awarded}
            accentColor={game.accentColor}
            embedded
          />

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
  const guessBlockKey = localGuessBlockKey(
    run.mysteryHistory ?? [],
    run.mysteryStudentQuestionCount ?? 0,
  );
  const subtitle = aiTurn
    ? (t("aiSTurn"))
    : (t("studentnameSTurn", { studentName: studentName }));
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
                ? (t("checkThisActivityAgain"))
                : (t("retryAiTurn"))}
            </Button>
          )}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-5">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-pink-300 bg-pink-50 text-6xl dark:border-pink-700 dark:bg-pink-950"
            aria-label={t("hiddenObject")}
          >
            📦
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-sm text-foreground">
              <span className="font-black text-foreground">
                {t("activityProgress")}
              </span>
              <span className="font-bold text-muted-foreground">
                {t("remainingLeft", { remaining: remaining })}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-pink-600 transition-[width] duration-300 dark:bg-pink-400"
                style={{ width: `${(run.questionCount / run.targetCount) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              {t("yourValidQuestionsMysterystudentquestion", { mysteryStudentQuestionCount: run.mysteryStudentQuestionCount ?? 0 })}
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
                ? (t("aiIsThinking"))
                : (t("aiSTurnIsReady"))}
            </p>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
          {!isGuessing ? (
            <form className="space-y-3" onSubmit={handleQuestionSubmit}>
              <label htmlFor="mystery-question" className="block text-sm font-black text-foreground">
                {t("askAYesOrNo")}
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
                placeholder={t("exampleIsItSomethingPeople")}
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="min-w-0 flex-1 font-bold"
                  disabled={inputBlocked || !question.trim()}
                >
                  {pending === "action"
                    ? (t("checking"))
                    : (t("ask"))}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 font-bold"
                  disabled={inputBlocked || guessBlockKey !== null}
                  onClick={() => setIsGuessing(true)}
                >
                  {t("makeAGuess")}
                </Button>
              </div>
              {guessBlockKey ? (
                <p className="text-xs font-semibold leading-5 text-amber-800 dark:text-amber-200">
                  {t(guessBlockKey)}
                </p>
              ) : null}
            </form>
          ) : (
            <form className="space-y-3" onSubmit={handleGuessSubmit}>
              <label htmlFor="mystery-guess" className="block text-sm font-black text-foreground">
                {t("whatIsInsideTheBox")}
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
                placeholder={t("writeTheObjectSName")}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="min-w-0 flex-1 font-bold"
                  disabled={inputBlocked || guessBlockKey !== null || !guess.trim()}
                >
                  {pending === "action"
                    ? (t("checking"))
                    : (t("submitGuess"))}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 font-bold"
                  disabled={inputBlocked}
                  onClick={() => setIsGuessing(false)}
                >
                  {t("keepAsking")}
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
  const t = useTranslations("gamePlay");
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
          ? (t("previewCompletedWithoutPoints"))
          : positive
            ? (t("awardedPointsEarned", { awarded: result.awarded }))
            : (t("theDailyPointLimitHas"))}
      </p>
      {!result.preview && result.cappedByLimit && (
        <p className="mt-1 text-xs">
          {t("theAwardWasLimitedBy")}
        </p>
      )}
      {!result.preview && result.dailyRemaining > 0 && (
        <p className="mt-1 text-xs">
          {t("dailyremainingPointsAreStillAvailable", { dailyRemaining: result.dailyRemaining })}
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
  const t = useTranslations("gamePlay");
  if (entries.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-foreground">
          {t("activityHistory")}
        </h2>
        <span className="text-xs font-semibold text-muted-foreground">
          {t("lengthActivities", { length: entries.length })}
        </span>
      </div>
      <ol className="mt-3 max-h-96 divide-y divide-border overflow-y-auto border-y border-border">
        {entries.map((entry) => {
          const actor = entry.actor === "AI" ? AI_NAME : studentName;
          const detail = entry.kind === "QUESTION"
            ? entry.answer === "yes"
              ? (t("yes"))
              : (t("no"))
            : entry.correct
              ? (t("correctGuess"))
              : (t("notTheAnswer"));
          return (
            <li key={entry.sequence} className="py-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="w-6 shrink-0 font-black text-pink-700 dark:text-pink-300">
                  {entry.sequence}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-foreground">
                    {actor} · {entry.kind === "QUESTION"
                      ? (t("question"))
                      : (t("guess"))}
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
