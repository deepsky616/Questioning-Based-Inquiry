"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { useGameRun, type GameRunSnapshot } from "./useGameRun";
import { getQuestionDiceTypes, getQuestionGameText } from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS, QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

interface RoundEntry { player: string; face: number; type: string; question: string; isAI?: boolean; aiFeedback?: string }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function DiceGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const diceTypes = getQuestionDiceTypes(locale);
  const { mode, players } = config;
  const isMulti = mode !== "solo";
  const isAI = mode === "ai";
  const localTargetQuestions = QUESTION_GAME_RULES.dice.targets[isAI ? "ai" : "solo"].count;

  const [phase, setPhase] = useState<"idle" | "rolling" | "result" | "ai-turn" | "done">("idle");
  const [currentFace, setCurrentFace] = useState(1);
  const [displayFace, setDisplayFace] = useState(1);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<RoundEntry[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [aiQuestion, setAiQuestion] = useState("");
  const [feedback, setFeedback] = useState("");

  const { ask, loading: aiLoading } = useAIPlay();
  const {
    run,
    result: runResult,
    pending: runPending,
    error: runError,
    conflict: runConflict,
    unconfirmedQuestion,
    unconfirmedDiceAction,
    start: startRun,
    rollDice,
    submitDiceQuestion,
    submitDiceAiTurn,
    reset: resetRun,
    clearError: clearRunError,
  } = useGameRun();
  const aiRequestRef = useRef(0);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPlayer = players[currentPlayerIdx] ?? text.me;
  const isAITurn = isAI && currentPlayerIdx === 1;
  const targetQuestions = run?.targetCount ?? localTargetQuestions;
  const studentQuestionCount = run?.questionCount
    ?? history.filter((entry) => !entry.isAI).length;
  const runBusy = runPending !== null;
  const serverAiLoading = runPending === "ai";
  const questionNeedsConfirmation = unconfirmedQuestion !== null;
  const interactionBusy = runBusy || runConflict !== null;
  const backBlocked = runBusy || questionNeedsConfirmation || unconfirmedDiceAction;

  function handleBack() {
    if (backBlocked) return;
    aiRequestRef.current += 1;
    if (rollTimerRef.current) clearInterval(rollTimerRef.current);
    rollTimerRef.current = null;
    resetRun();
    onBack();
  }

  useEffect(() => () => {
    aiRequestRef.current += 1;
    if (rollTimerRef.current) clearInterval(rollTimerRef.current);
  }, []);

  async function recordAiQuestion(activeRun: GameRunSnapshot) {
    const recorded = await submitDiceAiTurn(locale, activeRun);
    if (!recorded) return;
    const face = activeRun.pendingRoll?.face;
    if (!face) return;
    const type = diceTypes[face - 1];
    setAiQuestion(recorded.output);
    setHistory((entries) => [{
      player: players[1] ?? "AI",
      face,
      type: type.type,
      question: recorded.output,
      isAI: true,
    }, ...entries]);
    setCurrentPlayerIdx(0);
    setPhase("idle");
  }

  async function roll() {
    if (phase !== "idle" || rollTimerRef.current || interactionBusy) return;
    clearRunError();
    const activeRun = run ?? await startRun(
      game.id,
      isAI ? "ai" : "solo",
      "",
      locale,
    );
    if (!activeRun) return;
    const rolledRun = await rollDice(activeRun);
    const final = rolledRun?.pendingRoll?.face;
    if (!rolledRun || !final) return;

    const rolledByAi = rolledRun.pendingRoll?.actor === "AI";
    setPhase("rolling");
    setQuestion("");
    if (rolledByAi) setAiQuestion("");
    setFeedback("");
    let count = 0;
    rollTimerRef.current = setInterval(() => {
      setDisplayFace(Math.ceil(Math.random() * 6));
      count += 1;
      if (count < 14) return;
      if (rollTimerRef.current) clearInterval(rollTimerRef.current);
      rollTimerRef.current = null;
      setDisplayFace(final);
      setCurrentFace(final);
      if (rolledByAi) {
        setPhase("ai-turn");
        void recordAiQuestion(rolledRun);
      } else {
        setPhase("result");
      }
    }, 100);
  }

  async function retryAiQuestion() {
    if (!run || run.nextStep !== "AI_QUESTION" || runBusy) return;
    clearRunError();
    await recordAiQuestion(run);
  }

  async function submit() {
    const trimmed = (unconfirmedQuestion ?? question).trim();
    if (!trimmed || interactionBusy) return;
    const typeInfo = diceTypes[currentFace - 1];
    clearRunError();
    const saved = await submitDiceQuestion(trimmed, locale);
    if (!saved) return;
    const studentEntry: RoundEntry = {
      player: currentPlayer,
      face: currentFace,
      type: typeInfo.type,
      question: trimmed,
    };

    if (saved.result || saved.run.status === "SETTLED") {
      aiRequestRef.current += 1;
      setHistory([studentEntry, ...history]);
      setFeedback("");
      setQuestion("");
      setPhase("done");
      return;
    }

    let fb = "";

    if (isAI && aiQuestion) {
      const requestId = ++aiRequestRef.current;
      const res = await ask({
        action: "dice:feedback",
        context: { studentQuestion: trimmed, aiQuestion },
      });
      if (requestId !== aiRequestRef.current) return;
      fb = res?.text ?? "";
    }

    const nextHistory: RoundEntry[] = [{ ...studentEntry, aiFeedback: fb }, ...history];
    setHistory(nextHistory);
    setFeedback(fb);
    setQuestion("");

    if (isAI) {
      setCurrentPlayerIdx(1);
    } else if (isMulti) {
      setCurrentPlayerIdx((i) => (i + 1) % players.length);
    }
    setPhase("idle");
  }

  const typeInfo = diceTypes[currentFace - 1];
  const displayInfo = diceTypes[displayFace - 1];

  if (phase === "done") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={backBlocked}
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {text.backToList}
          </button>
          <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
            style={{ background: game.gradientCss }}>
            <span className="text-4xl">{game.emoji}</span>
            <h1 className="text-xl font-black">{game.title}</h1>
          </div>
        </div>
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-8 text-center space-y-3">
          <div className="text-6xl">🎲</div>
          <h2 className="text-2xl font-black text-foreground">{text.diceHistory(studentQuestionCount)}</h2>
        </div>
        {runResult && (
          <div
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm ${
              runResult.awarded > 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
            }`}
          >
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
        <div className="space-y-3">
          {history.map((entry, index) => (
            <div key={index} className="bg-card text-foreground rounded-xl border border-border p-4 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm"
                style={{ background: diceTypes[entry.face - 1].color }}>
                {entry.face}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{entry.player} · {entry.type}</p>
                <p className="text-foreground text-sm font-medium">{entry.question}</p>
              </div>
            </div>
          ))}
        </div>
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }} onClick={handleBack}>
          {text.goOtherGame}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={backBlocked}
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {text.backToList}
        </button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white text-sm">{game.description}</p>
          </div>
        </div>
      </div>

      {runConflict && (
        <div className="space-y-3">
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 px-3 py-2 text-sm">
            {runConflict}
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={handleBack}>
            {locale === "en" ? "Return to game selection" : "놀이 선택으로 돌아가기"}
          </Button>
        </div>
      )}

      {!runConflict && runError && phase !== "ai-turn" && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
          {runError}
        </div>
      )}

      {/* 플레이어 턴 표시 (멀티/AI) */}
      {isMulti && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all ${
                i === currentPlayerIdx ? "text-white" : "bg-secondary text-secondary-foreground"
              }`}
              style={{
                background: i === currentPlayerIdx ? game.accentColor : undefined,
              }}>
              {p} {i === currentPlayerIdx && "🎲"}
            </div>
          ))}
        </div>
      )}

      {/* 주사위 영역 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-8 flex flex-col items-center gap-6">
        <div className="w-36 h-36 rounded-2xl flex items-center justify-center shadow-xl"
          style={{
            background: phase === "rolling" ? displayInfo.color : phase !== "idle" ? typeInfo.color : "#4338CA",
            transform: phase === "rolling" ? "rotate(15deg) scale(1.05)" : "rotate(0deg) scale(1)",
            transition: "background 0.1s, transform 0.1s",
          }}>
          <svg viewBox="0 0 100 100" className="w-24 h-24">
            {(DOT_POSITIONS[phase === "idle" ? 1 : displayFace] ?? []).map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="9" fill="white" />
            ))}
          </svg>
        </div>

        {phase === "idle" && (
          <p className="text-muted-foreground text-sm text-center">
            {isMulti ? `${text.turnOf(currentPlayer)}!` : text.diceIdleSolo}
          </p>
        )}

        {phase === "rolling" && (
          <p className="text-xl font-black text-foreground animate-pulse">{text.diceRolling}</p>
        )}

        {(phase === "result" || phase === "ai-turn") && (
          <div className="text-center w-full">
            <div className="inline-block rounded-full px-5 py-2 text-white font-black text-lg mb-2"
              style={{ background: typeInfo.color }}>
              {currentFace}번 — {typeInfo.type}
            </div>
            <p className="text-muted-foreground text-sm">{typeInfo.desc}</p>
          </div>
        )}

        {phase === "idle" && (
          <Button onClick={() => void roll()}
            className="w-full py-4 text-lg font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #4338CA, #6D28D9)" }}
            disabled={runBusy || runConflict !== null}>
            {runPending === "create" || runPending === "action" ? text.loading : text.diceRoll}
          </Button>
        )}

        {phase === "ai-turn" && (
          <div className="w-full space-y-3 py-3">
            {serverAiLoading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-indigo-700 dark:text-indigo-300 font-bold text-sm">{text.diceAiThinking}</span>
              </div>
            ) : (
              <>
                {runError && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
                    {runError}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold"
                  disabled={runBusy || runConflict !== null}
                  onClick={() => void retryAiQuestion()}
                >
                  {locale === "en" ? "Retry AI question" : "인공지능 질문 다시 만들기"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 질문 작성 (내 차례) */}
      {phase === "result" && !isAITurn && (
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-6 space-y-4">
          <h2 className="font-black text-foreground flex items-center gap-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold"
              style={{ background: typeInfo.color }}>✏</span>
            {text.diceMakeQuestion(currentPlayer, typeInfo.type)}
          </h2>

          {/* AI가 먼저 만든 질문 표시 (AI 모드) */}
          {isAI && aiQuestion && (
            <div className="bg-secondary border border-border rounded-xl p-3 flex items-start gap-2">
              <span className="text-xl flex-shrink-0">🤖</span>
              <div>
                <p className="text-indigo-700 dark:text-indigo-300 text-xs font-bold mb-0.5">{text.diceAiQuestion}</p>
                <p className="text-foreground text-sm">{aiQuestion}</p>
              </div>
            </div>
          )}

          <textarea
            maxLength={QUESTION_GAME_LIMITS.question}
            aria-label={locale === "en" ? "Enter a dice question" : "주사위 질문 입력"}
            className="w-full bg-background text-foreground border-2 border-input rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-indigo-400 h-28"
            placeholder={text.dicePlaceholder(typeInfo.type)}
            value={question}
            readOnly={interactionBusy || questionNeedsConfirmation}
            aria-readonly={interactionBusy || questionNeedsConfirmation}
            onChange={(e) => {
              if (!interactionBusy && !questionNeedsConfirmation) {
                setQuestion(e.target.value);
                clearRunError();
              }
            }}
          />
          <Button onClick={() => void submit()}
            className="w-full font-bold text-white rounded-xl"
            style={{ background: typeInfo.color, opacity: question.trim() ? 1 : 0.5 }}
            disabled={!question.trim() || interactionBusy || aiLoading}>
            {runPending === "action"
              ? text.sending
              : questionNeedsConfirmation
                ? (locale === "en" ? "Check saved question again" : "질문 저장 다시 확인")
                : aiLoading ? text.diceFeedbackLoading : text.submit}
          </Button>
        </div>
      )}

      {/* 피드백 표시 */}
      {feedback && (
        <div className="bg-secondary border border-border rounded-xl p-4 flex items-start gap-2">
          <span className="text-xl">💡</span>
          <div>
            <p className="text-amber-800 dark:text-amber-300 text-xs font-bold mb-0.5">{text.diceFeedback}</p>
            <p className="text-foreground text-sm">{feedback}</p>
          </div>
        </div>
      )}

      {/* 기록 */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-foreground text-sm">{text.diceHistory(history.length)}</h3>
          {history.map((h, i) => (
            <div key={i} className="bg-card text-foreground rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm"
                  style={{ background: diceTypes[h.face - 1].color }}>
                  {h.face}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{h.player} · {h.type}</p>
                  <p className="text-foreground text-sm font-medium">{h.question}</p>
                </div>
              </div>
              {h.aiFeedback && (
                <p className="text-secondary-foreground text-xs bg-secondary rounded-lg px-3 py-1.5">
                  💡 {h.aiFeedback}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
