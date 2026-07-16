"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./GameHeader";
import { GameResultReview } from "./GameResultReview";
import {
  MEMORY_DIFFICULTY,
  MEMORY_FALLBACK_PAIRS,
  MEMORY_FALLBACK_PAIRS_EN,
  type MemoryDifficulty,
} from "@/lib/memory-game-data";
import { getMemoryDifficultyLabel, getQuestionGameText } from "@/lib/question-game-i18n";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";
import {
  useGameRun,
  type GameRunSnapshot,
  type MemoryRunCard,
  type UnconfirmedMemoryAction,
} from "./useGameRun";

interface Props {
  game: BuiltInGame;
  onBack: () => void;
  config: GameStartConfig;
}

const AI_NAME = "🤖 AI";
const AI_THINK_MS = 1_200;
const MISS_REVEAL_WAIT_MS = 1_900;
const CONTENT_KEY_PATTERN = /^memory-pair-(0[1-9]|1[0-9]|20)$/;

function pairForContentKey(contentKey: string, locale: string) {
  const match = contentKey.match(CONTENT_KEY_PATTERN);
  const index = match ? Number(match[1]) - 1 : -1;
  const source = locale === "en" ? MEMORY_FALLBACK_PAIRS_EN : MEMORY_FALLBACK_PAIRS;
  return source[index] ?? null;
}

function cardText(card: MemoryRunCard, locale: string) {
  if (!card.contentKey) return null;
  const pair = pairForContentKey(card.contentKey, locale);
  return card.type === "q" ? pair?.question ?? null : pair?.answer ?? null;
}

export default function MemoryGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const isAI = config.mode === "ai";
  const studentName = config.players[0]?.trim() || text.me;
  const [phase, setPhase] = useState<"setup" | "starting" | "play">("setup");
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<MemoryDifficulty>("normal");
  const autoAiKeyRef = useRef<string | null>(null);
  const autoResolveKeyRef = useRef<string | null>(null);
  const lastStudentCardRef = useRef<string | null>(null);
  const {
    run,
    result,
    pending,
    error,
    conflict,
    unconfirmedMemoryAction,
    start,
    flipMemoryCard,
    runMemoryAiTurn,
    resolveMemoryMiss,
    reset,
    clearError,
  } = useGameRun();

  const requestBlocked = pending !== null || unconfirmedMemoryAction !== null;
  const inputBlocked = requestBlocked || Boolean(conflict);

  useEffect(() => {
    if (
      phase !== "play" ||
      !run ||
      run.memoryNextStep !== "AI_TURN" ||
      pending !== null ||
      conflict ||
      error ||
      unconfirmedMemoryAction
    ) return;
    const key = `${run.id}:${run.version}:memory-ai-turn`;
    if (autoAiKeyRef.current === key) return;
    const timer = setTimeout(() => {
      autoAiKeyRef.current = key;
      void runMemoryAiTurn(run);
    }, AI_THINK_MS);
    return () => clearTimeout(timer);
  }, [conflict, error, pending, phase, run, runMemoryAiTurn, unconfirmedMemoryAction]);

  useEffect(() => {
    const reveal = run?.memoryMissReveal;
    if (
      phase !== "play" ||
      !run ||
      run.memoryNextStep !== "RESOLVE_MISS" ||
      !reveal ||
      pending !== null ||
      conflict ||
      error ||
      unconfirmedMemoryAction
    ) return;
    const key = `${run.id}:${run.version}:${reveal.id}`;
    if (autoResolveKeyRef.current === key) return;
    const timer = setTimeout(() => {
      autoResolveKeyRef.current = key;
      void resolveMemoryMiss(reveal.id, run);
    }, MISS_REVEAL_WAIT_MS);
    return () => clearTimeout(timer);
  }, [conflict, error, pending, phase, resolveMemoryMiss, run, unconfirmedMemoryAction]);

  async function startGame(difficulty: MemoryDifficulty) {
    setSelectedDifficulty(difficulty);
    setPhase("starting");
    clearError();
    const created = await start(
      "memory",
      isAI ? "ai" : "solo",
      "",
      locale,
      { difficulty },
    );
    if (created) {
      autoAiKeyRef.current = null;
      autoResolveKeyRef.current = null;
      lastStudentCardRef.current = null;
      setPhase("play");
    }
  }

  function restart() {
    reset();
    autoAiKeyRef.current = null;
    autoResolveKeyRef.current = null;
    lastStudentCardRef.current = null;
    setPhase("setup");
  }

  function handleBack() {
    if (requestBlocked) return;
    reset();
    onBack();
  }

  function handleStudentCard(card: MemoryRunCard) {
    if (!run || inputBlocked || card.state !== "HIDDEN") return;
    const expectedType = run.memoryNextStep === "STUDENT_QUESTION"
      ? "q"
      : run.memoryNextStep === "STUDENT_ANSWER"
        ? "a"
        : null;
    if (card.type !== expectedType) return;
    lastStudentCardRef.current = card.id;
    void flipMemoryCard(card.id, run);
  }

  function retryMemoryAction() {
    if (!run || pending !== null || conflict) return;
    const uncertain = unconfirmedMemoryAction;
    if (uncertain?.action === "memory-flip-card") {
      void flipMemoryCard(uncertain.cardId, run);
      return;
    }
    if (uncertain?.action === "memory-ai-turn") {
      void runMemoryAiTurn(run);
      return;
    }
    if (uncertain?.action === "memory-resolve-miss") {
      void resolveMemoryMiss(uncertain.revealId, run);
      return;
    }
    if (run.memoryNextStep === "AI_TURN") {
      void runMemoryAiTurn(run);
      return;
    }
    if (run.memoryNextStep === "RESOLVE_MISS" && run.memoryMissReveal) {
      void resolveMemoryMiss(run.memoryMissReveal.id, run);
      return;
    }
    const cardId = lastStudentCardRef.current;
    const card = cardId
      ? [...(run.memoryQuestionCards ?? []), ...(run.memoryAnswerCards ?? [])]
        .find((candidate) => candidate.id === cardId)
      : null;
    if (card?.state === "HIDDEN") void flipMemoryCard(card.id, run);
  }

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader
          game={game}
          subtitle={isAI ? text.aiModeSubtitle : text.soloModeSubtitle}
          onBack={handleBack}
        />
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="font-black text-foreground">{text.memoryChooseDifficulty}</h2>
          {isAI && (
            <div className="flex flex-wrap gap-2">
              {[studentName, AI_NAME].map((name, index) => (
                <span
                  key={name}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground"
                >
                  {index + 1}. {name}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MEMORY_DIFFICULTY) as MemoryDifficulty[]).map((difficulty) => {
              const config = MEMORY_DIFFICULTY[difficulty];
              const maximum = QUESTION_GAME_RULES.memory.targets[
                isAI ? "ai" : "solo"
              ][difficulty];
              return (
                <button
                  key={difficulty}
                  type="button"
                  onClick={() => void startGame(difficulty)}
                  className="rounded-lg border-2 border-border bg-background p-3 text-foreground transition-colors hover:border-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-sm font-black">
                    {getMemoryDifficultyLabel(locale, difficulty)}
                  </p>
                  <p className="mt-1 text-2xl font-black text-violet-700 dark:text-violet-300">
                    {config.cards}{locale === "en" ? ` ${text.card}` : text.card}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {locale === "en" ? `${maximum} attempts` : `최대 ${maximum}회`}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "starting") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader
          game={game}
          subtitle={text.memoryGeneratingCards}
          onBack={handleBack}
          backDisabled={requestBlocked}
        />
        <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
          {pending === "create" ? (
            <>
              <div className="mb-3 text-6xl animate-bounce">🃏</div>
              <p role="status" className="text-sm font-bold text-muted-foreground">
                {text.preparing}
              </p>
            </>
          ) : (
            <>
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
              >
                {error ?? (locale === "en"
                  ? "Could not prepare the cards."
                  : "카드를 준비하지 못했습니다.")}
              </div>
              <Button
                type="button"
                className="w-full font-bold"
                onClick={() => void startGame(selectedDifficulty)}
              >
                {locale === "en" ? "Try again" : "다시 시작하기"}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!run || run.gameId !== "memory") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader game={game} subtitle={text.memoryGeneratingCards} onBack={handleBack} />
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          {locale === "en" ? "Could not read the game." : "카드 짝 찾기 실행을 읽지 못했습니다."}
        </div>
        <Button type="button" className="w-full" onClick={restart}>
          {locale === "en" ? "Start over" : "새로 시작하기"}
        </Button>
      </div>
    );
  }

  if (conflict) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader game={game} subtitle={text.memoryChooseDifficulty} onBack={handleBack} />
        <div role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {conflict}
        </div>
        <Button type="button" className="w-full font-bold" onClick={restart}>
          {locale === "en" ? "Start a new game" : "새 실행 시작하기"}
        </Button>
      </div>
    );
  }

  if (run.status === "SETTLED" && run.memoryNextStep === "COMPLETE") {
    const reviewEntries = (run.memoryReview ?? []).flatMap(({ contentKey }) => {
      const pair = pairForContentKey(contentKey, locale);
      return pair ? [{ q: pair.question, a: pair.answer }] : [];
    });
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <GameHeader
          game={game}
          subtitle={locale === "en" ? "Complete!" : "완성!"}
          onBack={handleBack}
          backDisabled={requestBlocked}
        />
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="text-center">
            <div className="text-6xl">🏆</div>
            <h2 className="mt-2 text-2xl font-black text-foreground">{text.memoryDone}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {getMemoryDifficultyLabel(locale, run.memoryDifficulty ?? selectedDifficulty)} · {text.attempts(run.questionCount)}
            </p>
          </div>
          <div className="space-y-2">
            <ScoreRow name={studentName} score={run.studentMatchCount ?? 0} />
            {isAI && <ScoreRow name={AI_NAME} score={run.aiMatchCount ?? 0} />}
          </div>
          {result && (
            <div
              role="status"
              className={`rounded-lg border p-3 text-sm ${
                result.awarded > 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
              }`}
            >
              <p className="font-bold">
                {result.preview
                  ? (locale === "en"
                      ? "Preview completed without points."
                      : "미리보기로 완료되어 포인트는 지급되지 않아요.")
                  : result.awarded > 0
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
          )}
        </div>
        <GameResultReview
          title={text.memoryPairsTitle}
          accentColor={game.accentColor}
          entries={reviewEntries}
          qPrefix="💧"
          aPrefix="⭐"
        />
        <Button
          type="button"
          className="w-full py-4 font-black text-white"
          style={{ background: game.gradientCss }}
          onClick={restart}
        >
          {text.retry}
        </Button>
      </div>
    );
  }

  const difficulty = run.memoryDifficulty ?? selectedDifficulty;
  const pairCount = MEMORY_DIFFICULTY[difficulty].pairs;
  const columns = pairCount <= 6 ? 3 : 5;
  const questionCards = run.memoryQuestionCards ?? [];
  const answerCards = run.memoryAnswerCards ?? [];
  const remainingCards = [...questionCards, ...answerCards]
    .filter((card) => card.state !== "TAKEN").length;
  const currentName = run.memoryNextStep === "AI_TURN" ||
      (run.memoryNextStep === "RESOLVE_MISS" && run.memoryMissReveal?.actor === "AI")
    ? AI_NAME
    : studentName;
  const subtitle = `${text.turnOf(currentName)} · ${text.remainingCards(remainingCards)} · ${
    locale === "en"
      ? `Attempts ${run.questionCount}/${run.targetCount}`
      : `시도 ${run.questionCount}/${run.targetCount}`
  }`;
  const canRetry = Boolean(
    unconfirmedMemoryAction ||
    run.memoryNextStep === "AI_TURN" ||
    run.memoryNextStep === "RESOLVE_MISS" ||
    run.memoryNextStep === "STUDENT_QUESTION" ||
    run.memoryNextStep === "STUDENT_ANSWER",
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <GameHeader
        game={game}
        subtitle={subtitle}
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
              onClick={retryMemoryAction}
            >
              {locale === "en" ? "Retry this turn" : "이 차례 다시 확인하기"}
            </Button>
          )}
        </div>
      )}

      {isAI && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <ScoreChip
            name={studentName}
            score={run.studentMatchCount ?? 0}
            active={currentName === studentName}
          />
          <ScoreChip
            name={AI_NAME}
            score={run.aiMatchCount ?? 0}
            active={currentName === AI_NAME}
          />
        </div>
      )}

      {run.memoryNextStep === "AI_TURN" && (
        <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-3 text-center text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100">
          <div className="flex items-center justify-center gap-2">
            {pending === "ai" && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
            <p className="text-sm font-bold">{text.aiChoosingCard}</p>
          </div>
        </div>
      )}

      {run.memoryNextStep === "RESOLVE_MISS" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center text-sm font-bold text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {locale === "en"
            ? "The cards do not match. They will turn back over shortly."
            : "짝이 달라요. 잠시 확인한 뒤 카드를 다시 덮습니다."}
        </div>
      )}

      <MemoryCardSection
        title={text.questionCard}
        cards={questionCards}
        columns={columns}
        locale={locale}
        disabled={inputBlocked || run.memoryNextStep !== "STUDENT_QUESTION"}
        onCard={handleStudentCard}
      />
      <MemoryCardSection
        title={text.answerCard}
        cards={answerCards}
        columns={columns}
        locale={locale}
        disabled={inputBlocked || run.memoryNextStep !== "STUDENT_ANSWER"}
        onCard={handleStudentCard}
      />

      <p className="text-center text-xs font-semibold text-muted-foreground">
        {run.memoryNextStep === "STUDENT_QUESTION" && text.pickQuestionCard}
        {run.memoryNextStep === "STUDENT_ANSWER" && text.pickAnswerCard}
        {run.memoryNextStep === "AI_TURN" && text.aiFlippingCard}
        {run.memoryNextStep === "RESOLVE_MISS" && text.checkingPair}
      </p>
    </div>
  );
}

function MemoryCardSection({
  title,
  cards,
  columns,
  locale,
  disabled,
  onCard,
}: {
  title: string;
  cards: MemoryRunCard[];
  columns: number;
  locale: string;
  disabled: boolean;
  onCard: (card: MemoryRunCard) => void;
}) {
  const type = cards[0]?.type ?? (title.includes("대답") ? "a" : "q");
  const question = type === "q";
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm">
      <p className={`mb-2 text-xs font-black ${
        question
          ? "text-blue-700 dark:text-blue-300"
          : "text-amber-700 dark:text-amber-300"
      }`}>
        {title}
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cards.map((card, index) => {
          const visible = card.state !== "HIDDEN";
          const taken = card.state === "TAKEN";
          const content = cardText(card, locale);
          const hiddenLabel = locale === "en"
            ? `${question ? "Question" : "Answer"} card ${index + 1}`
            : `${question ? "질문" : "대답"} 카드 ${index + 1}`;
          return (
            <button
              key={card.id}
              type="button"
              aria-label={visible ? undefined : hiddenLabel}
              onClick={() => onCard(card)}
              disabled={disabled || visible}
              className={`flex aspect-[3/4] items-center justify-center overflow-y-auto rounded-lg border-2 p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                question
                  ? taken
                    ? "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100"
                    : visible
                      ? "border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
                      : "border-blue-900 bg-blue-700 text-white dark:border-blue-300 dark:bg-blue-600"
                  : taken
                    ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                    : visible
                      ? "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50"
                      : "border-amber-700 bg-amber-400 text-slate-950 dark:border-amber-300 dark:bg-amber-300 dark:text-slate-950"
              } ${disabled || visible ? "cursor-default" : "cursor-pointer"}`}
            >
              {visible ? (
                <AutoFitText text={content ?? "?"} />
              ) : (
                <span className="text-3xl" aria-hidden="true">{question ? "❓" : "❗"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreChip({ name, score, active }: { name: string; score: number; active: boolean }) {
  return (
    <div className={`flex flex-shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs ${
      active
        ? "bg-violet-700 text-white dark:bg-violet-300 dark:text-violet-950"
        : "bg-muted text-foreground"
    }`}>
      <span className="font-bold">{name}</span>
      <span className="font-black">{score}</span>
    </div>
  );
}

function ScoreRow({ name, score }: { name: string; score: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-foreground">
      <span className="flex-1 font-bold">{name}</span>
      <span className="font-black text-violet-700 dark:text-violet-300">{score}</span>
    </div>
  );
}

function AutoFitText({ text, max = 20, min = 9 }: { text: string; max?: number; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const element = ref.current;
      const parent = element?.parentElement;
      if (!element || !parent) return;
      const style = getComputedStyle(parent);
      const maxWidth = parent.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const maxHeight = parent.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      let size = max;
      element.style.fontSize = `${size}px`;
      while (size > min && (element.scrollHeight > maxHeight || element.scrollWidth > maxWidth)) {
        size -= 1;
        element.style.fontSize = `${size}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [max, min, text]);

  return (
    <span ref={ref} className="block w-full break-keep font-semibold" style={{ lineHeight: 1.15 }}>
      {text}
    </span>
  );
}
