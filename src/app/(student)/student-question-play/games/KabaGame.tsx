"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  KABA_VERDICT_GOOD,
  KABA_VERDICT_RETRY,
  parseKabaFeedbackText,
  type KabaVerdict,
} from "./kaba-feedback";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { getKabaText, getQuestionGameText } from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS, QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";
import { useGameRun } from "./useGameRun";
import { GameLearningSummary } from "./GameLearningSummary";
import { useLearningSounds } from "@/lib/learning-sounds";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";

interface AIFeedback { verdict: KabaVerdict; reason: string; cheer: string }
interface RoundEntry { original: string; student: string; isCorrect: boolean; playerName: string; feedback?: AIFeedback }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function KabaGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const text = getQuestionGameText(locale);
  const kabaText = getKabaText(locale);
  const { play: playSound } = useLearningSounds();
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode === "friend";
  const targetAttempts = QUESTION_GAME_RULES.kaba.targets[isAI ? "ai" : "solo"].count;

  const [idx, setIdx] = useState(0);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"input" | "checking" | "feedback" | "done">("input");
  const [history, setHistory] = useState<RoundEntry[]>([]);
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [localResult, setLocalResult] = useState<"correct" | "incorrect" | null>(null);

  const { ask } = useAIPlay();
  const {
    run,
    result: runResult,
    pending: runPending,
    error: runError,
    conflict: runConflict,
    unconfirmedQuestion,
    start: startRun,
    submitKabaAttempt,
    reset: resetRun,
    clearError: clearRunError,
  } = useGameRun();
  const aiRequestRef = useRef(0);

  useEffect(() => {
    aiRequestRef.current += 1;
    resetRun();
    setIdx(0);
    setPlayerIdx(0);
    setInput("");
    setFeedback(null);
    setLocalResult(null);
    setHistory([]);
    setPhase("input");
    void startRun(game.id, isAI ? "ai" : "solo", "", locale);
  }, [game.id, isAI, locale, resetRun, startRun]);

  useEffect(() => () => {
    aiRequestRef.current += 1;
  }, []);

  const TOTAL_ROUNDS = run?.targetCount ?? targetAttempts;
  const current = phase === "feedback"
    ? history.at(-1)?.original ?? run?.currentSentence ?? ""
    : run?.currentSentence ?? "";
  const currentPlayer = players[playerIdx] ?? text.me;
  const runBusy = runPending !== null;
  const backBlocked = runBusy || unconfirmedQuestion !== null;

  const parseAIFeedback = useCallback((text: string): AIFeedback | null => {
    const parsed = parseKabaFeedbackText(text);
    if (!parsed) return null;
    return {
      verdict: parsed.verdict,
      reason: parsed.reason || (t("checked")),
      cheer: parsed.cheer || (t("keepGoing")),
    };
  }, [t]);

  async function submit() {
    const trimmed = (unconfirmedQuestion ?? input).trim();
    if (!trimmed || !run || !current || runBusy || runConflict) return;

    clearRunError();
    setPhase("checking");
    const original = current;
    const saved = await submitKabaAttempt(trimmed, locale, run);
    if (!saved) {
      setPhase("input");
      return;
    }
    const correct = saved.correct;
    playSound(correct ? "success" : "retry");

    if (isAI) {
      const requestId = ++aiRequestRef.current;
      const res = await ask({
        action: "kaba:check",
        context: { original, student: trimmed },
      });
      if (requestId !== aiRequestRef.current) return;
      const parsed = res?.text ? parseAIFeedback(res.text) : null;
      const verdict = correct ? KABA_VERDICT_GOOD : KABA_VERDICT_RETRY;
      const serverFeedback: AIFeedback = {
        verdict,
        reason: correct ? t("hasQuestionForm") : t("rewriteAsQuestion"),
        cheer: t("keepGoing2"),
      };
      const fb = parsed?.verdict === verdict ? parsed : serverFeedback;
      setFeedback(fb);
      setHistory((h) => [...h, {
        original,
        student: trimmed,
        isCorrect: correct,
        playerName: currentPlayer,
        feedback: fb,
      }]);
      setPhase("feedback");
    } else {
      setLocalResult(correct ? "correct" : "incorrect");
      setHistory((h) => [...h, {
        original,
        student: trimmed,
        isCorrect: correct,
        playerName: currentPlayer,
      }]);
      setPhase("feedback");
    }
  }

  function next() {
    const nextIdx = idx + 1;
    if (run?.status === "SETTLED" || nextIdx >= TOTAL_ROUNDS) {
      setPhase("done");
      return;
    }
    setIdx(nextIdx);
    setInput("");
    setFeedback(null);
    setLocalResult(null);
    if (isMulti) setPlayerIdx((p) => (p + 1) % players.length);
    setPhase("input");
  }

  async function restart() {
    aiRequestRef.current += 1;
    resetRun();
    setIdx(0);
    setPlayerIdx(0);
    setInput("");
    setFeedback(null);
    setLocalResult(null);
    setHistory([]);
    setPhase("input");
    await startRun(game.id, isAI ? "ai" : "solo", "", locale);
  }

  async function retryStart() {
    clearRunError();
    await startRun(game.id, isAI ? "ai" : "solo", "", locale);
  }

  function handleBack() {
    if (backBlocked) return;
    aiRequestRef.current += 1;
    resetRun();
    onBack();
  }

  const correctCount = run?.correctCount ?? history.filter((h) => h.isCorrect).length;
  const progressPct = ((run?.questionCount ?? history.length) / TOTAL_ROUNDS) * 100;

  /* ── 완료 화면 ── */
  if (phase === "done") {
    const stars = correctCount >= TOTAL_ROUNDS * 0.9 ? 3 :
                  correctCount >= TOTAL_ROUNDS * 0.6 ? 2 : 1;
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button disabled={backBlocked} onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50">{text.backToList}</button>
          <LearningSoundToggle />
        </div>
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-10 flex flex-col items-center gap-5">
          <div className="text-6xl">{"⭐".repeat(stars)}</div>
          <h2 className="text-3xl font-black text-foreground">{kabaText.complete}</h2>
          <p className="text-muted-foreground text-center text-sm">
            {kabaText.score(TOTAL_ROUNDS, correctCount)}
          </p>
          <div className="w-full space-y-2">
            {history.map((h, i) => (
              <div
                key={i}
                data-testid="kaba-result-entry"
                data-player-name={h.playerName}
                className="flex items-center gap-3 bg-secondary rounded-xl p-3"
              >
                <span className="text-lg">{h.isCorrect ? "✅" : "❌"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-secondary-foreground">{h.original}</p>
                  <p className="text-sm font-medium text-foreground truncate">{h.student}</p>
                </div>
                {isMulti && <span className="text-xs text-secondary-foreground flex-shrink-0">{h.playerName}</span>}
              </div>
            ))}
          </div>
          {runResult && (
            <div role="status" className={`w-full rounded-xl border px-4 py-3 text-sm ${
              runResult.awarded > 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
            }`}>
              <p className="font-bold">
                {runResult.preview
                  ? (t("previewCompletedWithoutPoints"))
                  : runResult.awarded > 0
                    ? (t("awardedPointsEarned", { awarded: runResult.awarded }))
                    : (t("theDailyPointLimitHas"))}
              </p>
            </div>
          )}
          <GameLearningSummary
            mode={isAI ? "ai" : "solo"}
            completedActivities={history.length}
            questions={history.map((entry) => entry.student)}
            points={runResult?.awarded}
            accentColor={game.accentColor}
            embedded
          />
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }} onClick={() => void restart()}>
            {text.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button disabled={backBlocked} onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50">{text.backToList}</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white text-sm">{kabaText.subtitle}</p>
          </div>
        </div>
        <LearningSoundToggle />
      </div>

      {runConflict && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {runConflict}
        </div>
      )}
      {!runConflict && runError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
          {runError}
        </div>
      )}

      {/* 플레이어 턴 (멀티) */}
      {isMulti && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all ${
                i === playerIdx ? "text-white" : "bg-secondary text-secondary-foreground"
              }`}
              style={{
                background: i === playerIdx ? game.accentColor : undefined,
              }}>
              {p} {i === playerIdx ? "🙋" : ""}
            </div>
          ))}
        </div>
      )}

      {/* 진행도 */}
      <div className="bg-card text-foreground rounded-xl border border-border p-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{kabaText.round(idx + 1, TOTAL_ROUNDS)}</span>
          <span className="font-bold text-foreground">
            {kabaText.correctCount(correctCount)} ✅
          </span>
        </div>
        <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
          <div className="h-3 rounded-full transition-all duration-500"
            style={{ background: game.gradientCss, width: `${progressPct}%` }} />
        </div>
      </div>

      {/* 메인 게임 카드 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border overflow-hidden">
        {/* 상단: 평서문 표시 */}
        <div className="p-6 text-center"
          style={{ background: `${game.accentColor}10` }}>
          <p className="text-xs text-foreground font-medium mb-2 uppercase tracking-wider">
            {kabaText.sentencePrompt(isMulti ? currentPlayer : undefined)}
          </p>
          <div className="inline-block bg-background rounded-2xl px-8 py-5 shadow-sm border border-border">
            <p className="text-3xl font-black text-foreground leading-tight">{current}</p>
          </div>
          {/* 변환 힌트 */}
          <div className="flex items-center justify-center gap-3 mt-4 text-foreground">
            <span className="text-lg">📢</span>
            <span className="text-sm">{kabaText.hint}</span>
          </div>
        </div>

        {/* 하단: 입력/피드백 */}
        <div className="p-6 space-y-4">
          {phase === "input" && !run && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              {runPending === "create" ? (
                <>
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-blue-700 dark:text-blue-300 font-bold text-lg">{text.loading}</p>
                </>
              ) : (
                <Button
                  className="w-full py-4 text-lg font-black text-white rounded-2xl"
                  style={{ background: game.gradientCss }}
                  onClick={() => void retryStart()}
                >
                  {t("tryStartingAgain")}
                </Button>
              )}
            </div>
          )}
          {phase === "input" && run && current && !runConflict && (
            <>
              <div className="relative">
                <input
                  type="text"
                  maxLength={QUESTION_GAME_LIMITS.question}
                  className="w-full bg-background text-foreground border-2 border-input rounded-2xl px-5 py-4 text-xl font-bold text-center focus:outline-none transition-colors"
                  style={{ borderColor: "hsl(var(--input))" }}
                  onFocus={(e) => (e.target.style.borderColor = game.accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(var(--input))")}
                  placeholder={kabaText.placeholder}
                  value={input}
                  readOnly={runBusy || unconfirmedQuestion !== null}
                  aria-readonly={runBusy || unconfirmedQuestion !== null}
                  onChange={(e) => {
                    if (!runBusy && unconfirmedQuestion === null) {
                      setInput(e.target.value);
                      clearRunError();
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  autoFocus
                />
              </div>
              <Button
                className="w-full py-4 text-lg font-black text-white rounded-2xl"
                style={{ background: game.gradientCss, opacity: input.trim() ? 1 : 0.4 }}
                disabled={!input.trim() || runBusy || Boolean(runConflict)}
                onClick={() => void submit()}>
                {runBusy
                  ? text.loading
                  : unconfirmedQuestion
                    ? (t("checkSavedAnswerAgain"))
                    : isAI ? kabaText.checkAi : kabaText.check}
              </Button>
            </>
          )}

          {/* AI 확인 중 */}
          {phase === "checking" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-700 dark:text-blue-300 font-bold text-lg">{kabaText.checking}</p>
            </div>
          )}

          {/* 피드백 */}
          {phase === "feedback" && (
            <div className="space-y-4">
              {/* 내 답 표시 */}
              <div className="text-center bg-secondary rounded-xl p-4">
                <p className="text-xs text-secondary-foreground mb-1">{kabaText.myQuestion}</p>
                <p className="text-xl font-black text-foreground">{history[history.length - 1]?.student}</p>
              </div>

              {/* AI 피드백 */}
              {isAI && feedback && (
                <div className="rounded-2xl bg-secondary border-2 border-border p-5 text-center space-y-2">
                  <div className="text-5xl">{feedback.verdict === KABA_VERDICT_GOOD ? "🎉" : "🤔"}</div>
                  <p className={`text-2xl font-black ${
                    feedback.verdict === KABA_VERDICT_GOOD
                      ? "text-green-900 dark:text-green-200"
                      : "text-orange-800 dark:text-orange-200"
                  }`}>
                    {feedback.verdict === KABA_VERDICT_GOOD ? kabaText.good : kabaText.tryAgain}
                  </p>
                  <p className="text-secondary-foreground text-sm">{feedback.reason}</p>
                  <p className="text-foreground text-sm font-medium px-4 py-2">
                    💬 {feedback.cheer}
                  </p>
                </div>
              )}

              {/* 로컬 피드백 */}
              {!isAI && localResult && (
                <div className="rounded-2xl bg-secondary border-2 border-border p-5 text-center">
                  <div className="text-5xl mb-2">{localResult === "correct" ? "🎉" : "🤔"}</div>
                  <p className={`text-2xl font-black ${
                    localResult === "correct"
                      ? "text-green-900 dark:text-green-200"
                      : "text-orange-800 dark:text-orange-200"
                  }`}>
                    {localResult === "correct" ? kabaText.goodBang : kabaText.tryAgainBang}
                  </p>
                  {localResult === "incorrect" && (
                    <p className="text-secondary-foreground text-sm mt-2">
                      {kabaText.localTip}
                    </p>
                  )}
                </div>
              )}

              <Button
                className="w-full py-4 text-lg font-black text-white rounded-2xl"
                style={{ background: game.gradientCss }}
                onClick={next}>
                {run?.status === "SETTLED" ? kabaText.seeResult : kabaText.nextSentence}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* AI 모드 안내 */}
      {isAI && phase === "input" && (
        <div className="flex items-center gap-3 bg-secondary border border-border rounded-xl px-4 py-3">
          <span className="text-2xl">🤖</span>
          <p className="text-secondary-foreground text-sm">{kabaText.aiHelp}</p>
        </div>
      )}
    </div>
  );
}
