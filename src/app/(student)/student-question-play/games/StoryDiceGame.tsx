"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./GameHeader";
import {
  STORY_DICE_EMOJI, STORY_DICE_COLOR,
  getWordEmoji, getStoryDiceWordText,
  StoryDiceWords, DiceCategory,
} from "@/lib/story-dice-data";
import {
  getQuestionGameText,
  getStoryDiceCategoryLabel,
  isQuestionFormForLocale,
} from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS, QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";
import { useGameRun, type GameRunSnapshot } from "./useGameRun";

interface ChainItem { type: "story" | "question" | "answer"; text: string; author: string; isAI?: boolean }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

function countCompletedPairs(chain: ChainItem[]): number {
  return chain.reduce((count, item, index) => (
    item.type === "answer" && chain[index - 1]?.type === "question"
      ? count + 1
      : count
  ), 0);
}

export default function StoryDiceGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode !== "solo";
  const targetPairs = QUESTION_GAME_RULES["story-dice"].targets[isAI ? "ai" : "solo"].count;

  const myName = players[0]?.trim() || text.me;
  const aiName = "🤖 AI";

  const [phase, setPhase] = useState<"loading" | "rolling" | "story" | "qa" | "done">("loading");
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [input, setInput] = useState("");
  const [rolling, setRolling] = useState<{ protagonist: string; place: string; event: string } | null>(null);
  const [animTick, setAnimTick] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const aiQuestionRequestRef = useRef(0);
  const aiQuestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    run,
    result: runResult,
    pending: runPending,
    error: runError,
    conflict: runConflict,
    unconfirmedQuestion,
    start: startRun,
    rollStoryDice: rollStoryDiceRun,
    submitStoryDiceStory,
    submitStoryDiceQuestion,
    submitStoryDiceAiTurn,
    submitStoryDiceAnswer,
    reset: resetRun,
    clearError: clearRunError,
  } = useGameRun();
  const words: StoryDiceWords | null = run?.storyWordPool ?? null;
  const rolled = run?.storyRolledWords ?? null;
  const aiLoading = runPending === "ai";
  const runBusy = runPending !== null;
  const backBlocked = runBusy || unconfirmedQuestion !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      aiQuestionRequestRef.current += 1;
      if (aiQuestionTimerRef.current) clearTimeout(aiQuestionTimerRef.current);
      if (rollTimerRef.current) clearInterval(rollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    resetRun();
    setPhase("loading");
    setChain([]);
    setInput("");
    setRolling(null);
    setLocalError(null);
    void startRun(game.id, isAI ? "ai" : "solo", "", locale).then((created) => {
      if (mountedRef.current && created) setPhase("rolling");
    });
  }, [game.id, isAI, locale, resetRun, startRun]);

  async function rollDice() {
    if (!words || !run || rolling || runBusy || runConflict) return;
    clearRunError();
    setLocalError(null);
    setRolling({ protagonist: "?", place: "?", event: "?" });
    const saved = await rollStoryDiceRun(run);
    const final = saved?.storyRolledWords;
    if (!saved || !final) {
      setRolling(null);
      return;
    }
    let count = 0;
    rollTimerRef.current = setInterval(() => {
      setAnimTick((t) => t + 1);
      setRolling({
        protagonist: words.protagonist[count % words.protagonist.length] ?? "?",
        place: words.place[(count + 2) % words.place.length] ?? "?",
        event: words.event[(count + 4) % words.event.length] ?? "?",
      });
      count++;
      if (count >= 14) {
        if (rollTimerRef.current) clearInterval(rollTimerRef.current);
        rollTimerRef.current = null;
        setRolling(null);
        setPhase("story");
      }
    }, 100);
  }

  function scheduleAIQuestion(currentChain: ChainItem[], activeRun: GameRunSnapshot) {
    const requestId = ++aiQuestionRequestRef.current;
    if (aiQuestionTimerRef.current) clearTimeout(aiQuestionTimerRef.current);
    aiQuestionTimerRef.current = setTimeout(() => {
      aiQuestionTimerRef.current = null;
      void askAIQuestion(currentChain, requestId, activeRun);
    }, 400);
  }

  function cancelAIQuestion() {
    aiQuestionRequestRef.current += 1;
    if (aiQuestionTimerRef.current) clearTimeout(aiQuestionTimerRef.current);
    aiQuestionTimerRef.current = null;
  }

  function handleBack() {
    if (backBlocked) return;
    cancelAIQuestion();
    if (rollTimerRef.current) clearInterval(rollTimerRef.current);
    rollTimerRef.current = null;
    resetRun();
    onBack();
  }

  async function submitStory() {
    const trimmed = (unconfirmedQuestion ?? input).trim();
    if (!trimmed || !run || runBusy || runConflict) return;
    clearRunError();
    setLocalError(null);
    const saved = await submitStoryDiceStory(trimmed, locale, run);
    if (!saved) return;
    const newChain: ChainItem[] = [{ type: "story", text: trimmed, author: myName }];
    setChain(newChain);
    setInput("");
    setPhase("qa");
    if (isAI && saved.run.storyDiceNextStep === "AI_QUESTION") {
      scheduleAIQuestion(newChain, saved.run);
    }
  }

  async function askAIQuestion(
    currentChain: ChainItem[],
    requestId: number,
    activeRun: GameRunSnapshot,
  ) {
    const story = currentChain.find((item) => item.type === "story")?.text ?? "";
    const previousAnswer = [...currentChain]
      .reverse()
      .find((item) => item.type === "answer")?.text ?? "";
    const saved = await submitStoryDiceAiTurn(story, previousAnswer, locale, activeRun);
    if (requestId !== aiQuestionRequestRef.current) return;
    if (!saved) return;
    const question = saved.output;
    const newItem: ChainItem = { type: "question", text: question, author: aiName, isAI: true };
    setChain((c) => [...c, newItem]);
  }

  async function submitQuestion() {
    const trimmed = (unconfirmedQuestion ?? input).trim();
    if (!trimmed || !run || runBusy || runConflict) return;
    if (!isQuestionFormForLocale(trimmed, locale)) {
      setLocalError(locale === "en"
        ? "Write the sentence as a question."
        : "질문하는 문장으로 작성해 주세요.");
      return;
    }
    clearRunError();
    setLocalError(null);
    const saved = await submitStoryDiceQuestion(trimmed, locale, run);
    if (!saved) return;
    const item: ChainItem = { type: "question", text: trimmed, author: myName };
    const newChain = [...chain, item];
    setChain(newChain);
    setInput("");
  }

  async function submitAnswer() {
    const trimmed = (unconfirmedQuestion ?? input).trim();
    if (!trimmed || !run || runBusy || runConflict) return;
    clearRunError();
    setLocalError(null);
    const saved = await submitStoryDiceAnswer(trimmed, locale, run);
    if (!saved) return;
    const item: ChainItem = { type: "answer", text: trimmed, author: myName };
    const newChain = [...chain, item];
    setChain(newChain);
    setInput("");
    if (saved.run.status === "SETTLED" || countCompletedPairs(newChain) >= targetPairs) {
      cancelAIQuestion();
      setPhase("done");
      return;
    }
    if (isAI && saved.run.storyDiceNextStep === "AI_QUESTION") {
      scheduleAIQuestion(newChain, saved.run);
    }
  }

  async function retryStart() {
    clearRunError();
    setLocalError(null);
    const created = await startRun(game.id, isAI ? "ai" : "solo", "", locale);
    if (mountedRef.current && created) setPhase("rolling");
  }

  function retryAIQuestion() {
    if (!run || run.storyDiceNextStep !== "AI_QUESTION" || runBusy || runConflict) return;
    clearRunError();
    const requestId = ++aiQuestionRequestRef.current;
    void askAIQuestion(chain, requestId, run);
  }

  /* ── 결과 ── */
  if (phase === "done") {
    const myQs = chain.filter((c) => c.type === "question" && !c.isAI).length;
    const myAs = chain.filter((c) => c.type === "answer" && !c.isAI).length;
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader
          game={game}
          subtitle={text.storyCompleteSubtitle}
          onBack={handleBack}
          backDisabled={backBlocked}
        />
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-8 flex flex-col items-center gap-3">
          <div className="text-6xl">📖</div>
          <h2 className="text-2xl font-black text-foreground">{text.storyDoneTitle}</h2>
          <p className="text-muted-foreground text-sm">{text.storyStats(myQs, myAs, chain.length)}</p>
          {runResult && (
            <div role="status" className={`w-full rounded-xl border px-4 py-3 text-sm ${
              runResult.awarded > 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
            }`}>
              <p className="font-bold">
                {runResult.preview
                  ? (locale === "en" ? "Preview completed without points." : "미리보기로 완료되어 포인트는 지급되지 않아요.")
                  : runResult.awarded > 0
                    ? (locale === "en" ? `+${runResult.awarded} points earned!` : `+${runResult.awarded}점 적립!`)
                    : (locale === "en" ? "The daily point limit has been reached." : "오늘 받을 수 있는 질문놀이 포인트를 모두 받았어요.")}
              </p>
              {!runResult.preview && runResult.dailyRemaining > 0 && (
                <p className="mt-1 text-xs">
                  {locale === "en"
                    ? `${runResult.dailyRemaining} points are still available today.`
                    : `오늘 ${runResult.dailyRemaining}점 더 받을 수 있어요.`}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-3 max-h-80 overflow-y-auto">
          <h3 className="font-black text-foreground">{text.completedStory}</h3>
          {chain.map((c, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-base">{c.type === "story" ? "📖" : c.type === "question" ? "?" : "💬"}</span>
              <div>
                <p className="text-xs text-muted-foreground">{c.author}</p>
                <p className="text-foreground text-sm">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={handleBack}>
          {text.goOtherGame}
        </Button>
      </div>
    );
  }

  /* ── 단어 준비 중 ── */
  if (phase === "loading" || !words) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader
          game={game}
          subtitle={text.storyWordsLoading}
          onBack={handleBack}
          backDisabled={backBlocked}
        />
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-10 text-center space-y-3">
          {runPending === "create" ? (
            <>
              <div className="text-6xl animate-bounce">🎲</div>
              <p className="text-muted-foreground text-sm">{text.loading}</p>
            </>
          ) : (
            <>
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
                {runError ?? (locale === "en" ? "Could not prepare the story dice." : "이야기 주사위를 준비하지 못했습니다.")}
              </div>
              <Button type="button" variant="outline" className="w-full font-bold" onClick={() => void retryStart()}>
                {locale === "en" ? "Try again" : "다시 시작하기"}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const nextAction: "question" | "answer" =
    run?.storyDiceNextStep === "STUDENT_ANSWER" ? "answer" : "question";
  const inputDisabled = run?.storyDiceNextStep === "AI_QUESTION";
  const inputPlaceholder =
    nextAction === "question"
      ? text.storyQuestionPlaceholder
      : text.storyAnswerPlaceholder;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <GameHeader
        game={game}
        subtitle={isAI ? text.storyWithAi : text.storyTogether}
        onBack={handleBack}
        backDisabled={backBlocked}
      />

      {runConflict && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {runConflict}
        </div>
      )}
      {!runConflict && (runError || localError) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
          {localError ?? runError}
        </div>
      )}

      {/* 단어 풀 */}
      <div className="bg-card text-foreground rounded-2xl border border-border shadow-sm p-4 space-y-3">
        <h3 className="text-xs font-black text-foreground">{text.storyWordPool}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(["protagonist", "place", "event"] as DiceCategory[]).map((cat) => (
            <div key={cat} className="rounded-xl p-2 border"
              style={{ borderColor: STORY_DICE_COLOR[cat] + "40", background: STORY_DICE_COLOR[cat] + "08" }}>
              <p className="text-xs font-bold text-center mb-1 text-foreground">
                {STORY_DICE_EMOJI[cat]} {getStoryDiceCategoryLabel(locale, cat)}
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {words[cat].map((w) => (
                  <span key={w} className="text-[11px] bg-background border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                    {getWordEmoji(w, cat, words?.emojis)} {getStoryDiceWordText(words, w, locale)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 주사위 결과 */}
      {(rolled || rolling) && (
        <div className="bg-secondary text-foreground rounded-2xl border-2 border-border p-4 grid grid-cols-3 gap-3">
          {(["protagonist", "place", "event"] as DiceCategory[]).map((cat) => {
            const value = rolling ? rolling[cat] : rolled![cat];
            const visibleValue = value === "?"
              ? value
              : getStoryDiceWordText(words, value, locale);
            return (
              <div key={cat} className="text-center">
                <p className="text-xs font-bold mb-1 text-foreground">
                  {STORY_DICE_EMOJI[cat]} {getStoryDiceCategoryLabel(locale, cat)}
                </p>
                <div className="rounded-2xl py-3 text-white shadow-md flex flex-col items-center gap-0.5"
                  style={{
                    background: STORY_DICE_COLOR[cat],
                    transform: rolling ? `rotate(${animTick * 5}deg)` : "none",
                    transition: "transform 0.1s",
                  }}>
                  <span className="text-3xl leading-none">
                    {value === "?" ? "🎲" : getWordEmoji(value, cat, words?.emojis)}
                  </span>
                  <span className="text-lg font-black">{visibleValue}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 단계별 UI */}
      {phase === "rolling" && (
        <Button className="w-full py-4 text-lg font-black text-white rounded-2xl"
          style={{ background: "linear-gradient(135deg, #C2410C, #B91C1C)" }}
          onClick={() => void rollDice()} disabled={!!rolling || runBusy || Boolean(runConflict)}>
          {rolling || runPending === "action" ? text.diceRolling : text.storyRoll3}
        </Button>
      )}

      {phase === "story" && rolled && (
        <div className="bg-card text-foreground rounded-2xl border border-border shadow-sm p-5 space-y-3">
          <p className="text-sm font-bold text-foreground">{text.storyMakeSentence}</p>
          <textarea
            className="w-full bg-background text-foreground border-2 border-input rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
            placeholder={text.storyPlaceholder(
              getStoryDiceWordText(words, rolled.protagonist, locale),
              getStoryDiceWordText(words, rolled.place, locale),
              getStoryDiceWordText(words, rolled.event, locale),
            )}
            value={unconfirmedQuestion ?? input}
            maxLength={QUESTION_GAME_LIMITS.story}
            readOnly={runBusy || unconfirmedQuestion !== null}
            aria-readonly={runBusy || unconfirmedQuestion !== null}
            onChange={(e) => {
              if (!runBusy && unconfirmedQuestion === null) {
                setInput(e.target.value);
                setLocalError(null);
                clearRunError();
              }
            }}
            autoFocus />
          <Button className="w-full font-bold text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #C2410C, #B91C1C)" }}
            disabled={!(unconfirmedQuestion ?? input).trim() || runBusy || Boolean(runConflict)}
            onClick={() => void submitStory()}>
            {runPending === "action"
              ? text.loading
              : unconfirmedQuestion
                ? (locale === "en" ? "Retry save" : "다시 저장하기")
                : text.storyStart}
          </Button>
        </div>
      )}

      {phase === "qa" && (
        <>
          <div className="bg-card text-foreground rounded-2xl border border-border shadow-sm p-4 space-y-2 max-h-72 overflow-y-auto">
            {chain.map((c, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                  style={{ background: c.type === "story" ? "#B45309" : c.isAI ? "#4338CA" : "#B91C1C" }}>
                  {c.type === "story" ? "📖" : c.type === "question" ? "?" : "💬"}
                </div>
                <div className={`flex-1 rounded-xl bg-secondary px-3 py-2 text-sm text-foreground ${
                  i === chain.length - 1
                    ? "border-2 border-orange-400"
                    : "border border-transparent"
                }`}>
                  <p className="mb-0.5 text-[11px] font-bold text-foreground">
                    {c.author} ({c.type === "story" ? text.story : c.type === "question" ? text.question : text.answer})
                  </p>
                  {c.text}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 text-sm pl-9 py-1">
                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                {text.aiThinking}
              </div>
            )}
          </div>

          {!inputDisabled && (
            <div className="bg-card text-foreground rounded-2xl border border-border shadow-sm p-4 space-y-3">
              <textarea
                className="w-full bg-background text-foreground border-2 border-input rounded-xl p-3 text-sm resize-none focus:outline-none h-20 disabled:bg-secondary disabled:text-secondary-foreground"
                placeholder={inputPlaceholder}
                value={unconfirmedQuestion ?? input}
                maxLength={nextAction === "question" ? QUESTION_GAME_LIMITS.question : QUESTION_GAME_LIMITS.answer}
                readOnly={runBusy || unconfirmedQuestion !== null}
                aria-readonly={runBusy || unconfirmedQuestion !== null}
                onChange={(e) => {
                  if (!runBusy && unconfirmedQuestion === null) {
                    setInput(e.target.value);
                    setLocalError(null);
                    clearRunError();
                  }
                }}
                autoFocus />
              <Button className="w-full font-bold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg, #C2410C, #B91C1C)" }}
                disabled={!(unconfirmedQuestion ?? input).trim() || runBusy || Boolean(runConflict)}
                onClick={() => void (nextAction === "question" ? submitQuestion() : submitAnswer())}>
                {runPending === "action"
                  ? text.loading
                  : unconfirmedQuestion
                    ? (locale === "en" ? "Retry save" : "다시 저장하기")
                    : nextAction === "question"
                      ? text.storySubmitQuestion
                      : text.storySubmitAnswer}
              </Button>
            </div>
          )}

          {isAI && inputDisabled && !aiLoading && (
            <div className="bg-secondary border border-border rounded-xl p-3 text-center text-secondary-foreground text-sm space-y-2">
              <p>{text.storyAiWillAsk}</p>
              {runError && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold"
                  disabled={runBusy || Boolean(runConflict)}
                  onClick={retryAIQuestion}
                >
                  {locale === "en" ? "Retry AI question" : "인공지능 질문 다시 만들기"}
                </Button>
              )}
            </div>
          )}

        </>
      )}

      {!isMulti && phase === "qa" && (
        <p className="text-xs text-muted-foreground text-center">
          {text.storySoloHint}
        </p>
      )}
    </div>
  );
}
