"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useGameRun } from "./useGameRun";
import { GameLearningSummary } from "./GameLearningSummary";
import { getQuestionGameText, getRelayTopics, isQuestionFormForLocale } from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const PLAYER_COLORS = ["#C2410C", "#1D4ED8", "#047857", "#6D28D9", "#B91C1C"];
const AI_COLOR = "#4338CA";

interface ChainItem { question: string; player: string; isAI?: boolean }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function RelayGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const presetTopics = getRelayTopics(locale);
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode !== "solo";
  const {
    run,
    result: runResult,
    pending: runPending,
    error: runError,
    conflict: runConflict,
    unconfirmedQuestion,
    start: startRun,
    submitRelayQuestion,
    submitRelayAiTurn,
    complete: completeRun,
    reset: resetRun,
    clearError: clearRunError,
  } = useGameRun();
  const targetQuestions = run?.targetCount ?? 3;

  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [inputQ, setInputQ] = useState("");
  const [playerIdx, setPlayerIdx] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const chainEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const finalTopic = customTopic.trim() || topic;
  const myPlayerName = players[0] ?? text.me;
  const studentQuestionCount = run?.questionCount
    ?? chain.filter((item) => !item.isAI).length;
  const runBusy = runPending !== null;
  const aiLoading = runPending === "ai";
  const interactionBusy = runBusy || runConflict !== null;
  const awaitingAiTurn = isAI && run?.awaitingAiTurn === true;
  const questionNeedsConfirmation = unconfirmedQuestion !== null;
  const awaitingCompletion =
    phase === "playing" &&
    studentQuestionCount >= targetQuestions &&
    !awaitingAiTurn;
  const backBlocked = runBusy || awaitingCompletion || questionNeedsConfirmation;
  // 친구 모드에서의 현재 플레이어
  const currentFriendPlayer = players[playerIdx] ?? "나";
  const playerColor = useCallback((name: string) => {
    const i = players.indexOf(name);
    return i >= 0
      ? PLAYER_COLORS[i % PLAYER_COLORS.length]
      : "hsl(var(--muted-foreground))";
  }, [players]);

  // 체인 끝으로 자동 스크롤
  useEffect(() => {
    chainEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chain, aiLoading]);

  // AI 응답 후 입력창 포커스
  useEffect(() => {
    if (!aiLoading && !awaitingAiTurn && phase === "playing") {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [aiLoading, awaitingAiTurn, phase]);

  function handleBack() {
    if (backBlocked) return;
    resetRun();
    onBack();
  }

  function returnToNewRun() {
    resetRun();
    setPhase("setup");
    setTopic("");
    setCustomTopic("");
    setChain([]);
    setInputQ("");
    setPlayerIdx(0);
    setLocalError(null);
  }

  async function startGame() {
    if (!finalTopic || runBusy) return;
    const createdRun = await startRun(
      game.id,
      isAI ? "ai" : "solo",
      finalTopic,
      locale,
    );
    if (!createdRun) return;
    setChain([]);
    setInputQ("");
    setPlayerIdx(0);
    setLocalError(null);
    setPhase("playing");
  }

  const runAITurn = useCallback(async (
    currentChain: ChainItem[],
    t: string,
    runOverride = run ?? undefined,
  ) => {
    const previousStudentQuestion = [...currentChain]
      .reverse()
      .find((item) => !item.isAI)?.question ?? "";
    if (!previousStudentQuestion || !runOverride?.awaitingAiTurn) return null;
    const recorded = await submitRelayAiTurn(
      t,
      previousStudentQuestion,
      locale,
      runOverride,
    );
    if (!recorded) return null;
    setChain((items) => [
      ...items,
      { question: recorded.output, player: "AI", isAI: true },
    ]);
    return recorded;
  }, [locale, run, submitRelayAiTurn]);

  async function submitQuestion() {
    const trimmed = (unconfirmedQuestion ?? inputQ).trim();
    if (!trimmed || interactionBusy || awaitingAiTurn || awaitingCompletion) return;

    setLocalError(null);
    clearRunError();

    // 질문 형식 검사
    if (!isQuestionFormForLocale(trimmed, locale)) {
      setLocalError(text.questionFormError);
      return;
    }

    // 중복 검사
    if (chain.some((c) => c.question.trim() === trimmed)) {
      setLocalError(text.duplicateQuestionError);
      return;
    }

    const saved = await submitRelayQuestion(trimmed, locale);
    if (!saved) return;
    const savedRun = saved.run;

    // 서버가 저장한 학생 질문만 화면 체인에 추가
    const playerName = isAI ? myPlayerName : currentFriendPlayer;
    const newChain: ChainItem[] = [...chain, { question: trimmed, player: playerName }];
    setChain(newChain);
    setInputQ("");

    const nextStudentQuestionCount = savedRun.questionCount;
    if (nextStudentQuestionCount >= targetQuestions) {
      if (saved.result) {
        setPhase("done");
        return;
      }
      const completed = await completeRun(savedRun);
      if (completed) setPhase("done");
      return;
    }

    if (isAI && savedRun.awaitingAiTurn) {
      await runAITurn(newChain, finalTopic, savedRun);
    } else if (isMulti) {
      // 친구 모드: 다음 플레이어로 교대
      setPlayerIdx((i) => (i + 1) % players.length);
    }
  }

  async function retryCompletion() {
    if (runBusy) return;
    const completed = await completeRun();
    if (completed) setPhase("done");
  }

  async function retryAiTurn() {
    if (!awaitingAiTurn || runBusy) return;
    setLocalError(null);
    clearRunError();
    await runAITurn(chain, finalTopic);
  }

  const lastItem = chain[chain.length - 1];
  // AI 모드: 직전 질문 (연결 기준)
  const prevForHint = chain.length > 0 ? lastItem : null;

  /* ─── 설정 화면 ─── */
  if (phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
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
              <p className="text-white text-sm">{text.relaySubtitle}</p>
            </div>
          </div>
        </div>

        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-6 space-y-5">
          {/* 규칙 */}
          <div className="bg-secondary border border-border rounded-xl p-4 space-y-1.5">
            <p className="text-foreground font-black text-sm">{text.gameRules}</p>
            {text.relayRules.map((r, i) => (
              <p key={i} className="text-foreground text-sm flex items-start gap-2">
                <span className="flex-shrink-0">•</span>{r}
              </p>
            ))}
            {isAI && (
              <p className="text-foreground text-sm font-bold mt-2 bg-muted border border-border rounded-lg px-3 py-1.5">
                {text.relayAiOrder}
              </p>
            )}
          </div>

          {/* 주제 선택 */}
          <div>
            <p className="text-sm font-black text-foreground mb-3">{text.chooseTopic}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {presetTopics.map((t) => (
                <button key={t}
                  type="button"
                  aria-pressed={topic === t}
                  className="px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all"
                  style={{
                    borderColor: topic === t ? game.accentColor : "hsl(var(--input))",
                    background: topic === t ? game.accentColor : "hsl(var(--background))",
                    color: topic === t ? "white" : "hsl(var(--foreground))",
                  }}
                  onClick={() => { setTopic(t); setCustomTopic(""); }}>
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              maxLength={QUESTION_GAME_LIMITS.topic}
              aria-label={locale === "en" ? "Enter a custom topic" : "직접 주제 입력"}
              className="w-full bg-background text-foreground border-2 border-input rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
              style={{ borderColor: customTopic ? game.accentColor : "hsl(var(--input))" }}
              onFocus={(e) => { e.target.style.borderColor = game.accentColor; setTopic(""); }}
              onBlur={(e) => { if (!customTopic) e.target.style.borderColor = "hsl(var(--input))"; }}
              placeholder={text.topicPlaceholder}
              value={customTopic}
              onChange={(e) => { setCustomTopic(e.target.value); setTopic(""); }}
            />
          </div>

          {finalTopic && (
            <div className="rounded-xl px-4 py-3 text-white text-center font-bold min-w-0"
              style={{ background: game.gradientCss }}>
              {text.selectedTopic}:{" "}
              <span className="text-xl break-words [overflow-wrap:anywhere]">{finalTopic}</span>
            </div>
          )}

          {runError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
              {runError}
            </div>
          )}

          <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss, opacity: finalTopic && !runBusy ? 1 : 0.4 }}
            disabled={!finalTopic || runBusy}
            onClick={() => void startGame()}>
            {runPending === "create" ? text.loading : text.relayStart}
          </Button>
        </div>
      </div>
    );
  }

  /* ─── 결과 화면 ─── */
  if (phase === "done") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {text.backToList}
          </button>
        </div>
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-8 flex flex-col items-center gap-4">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-foreground">{text.relayDone}</h2>
          <p className="text-muted-foreground text-sm min-w-0">
            {text.topic}:{" "}
            <span className="font-bold text-foreground break-words [overflow-wrap:anywhere]">
              {finalTopic}
            </span>
          </p>
          <p className="text-muted-foreground text-sm">
            {text.relayTotal(studentQuestionCount)}
          </p>
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
            {!runResult.preview && runResult.awarded > 0 && runResult.cappedByLimit && (
              <p className="mt-1 text-xs font-medium">
                {locale === "en"
                  ? "The daily limit was applied."
                  : "일일 상한이 적용되었어요."}
              </p>
            )}
          </div>
        )}

        <GameLearningSummary
          mode={isAI ? "ai" : "solo"}
          completedActivities={studentQuestionCount}
          questions={chain.filter((item) => !item.isAI).map((item) => item.question)}
          points={runResult?.awarded}
          accentColor={game.accentColor}
        />

        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-3">
          <h3 className="font-black text-foreground">{text.relayChain}</h3>
          {chain.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white mt-0.5"
                style={{ background: item.isAI ? AI_COLOR : playerColor(item.player) }}>
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold mb-0.5 text-foreground">
                  {item.player}
                </p>
                <p className="text-foreground text-sm leading-relaxed">{item.question}</p>
              </div>
            </div>
          ))}
        </div>

        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => {
            returnToNewRun();
          }}>
          {text.retry}
        </Button>
      </div>
    );
  }

  /* ─── 게임 진행 화면 ─── */
  return (
    <div className="max-w-lg mx-auto space-y-4">
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
        <div className="flex-1 min-w-0 rounded-2xl py-3 px-5 text-white flex items-center justify-between gap-3"
          style={{ background: game.gradientCss }}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-3xl flex-shrink-0">{game.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-black">{game.title}</p>
              <p className="text-white text-xs min-w-0 break-words [overflow-wrap:anywhere]">
                {text.topic}: {finalTopic}
              </p>
            </div>
          </div>
          <div className="text-white text-right flex-shrink-0">
            <p className="text-2xl font-black">{studentQuestionCount} / {targetQuestions}</p>
            <p className="text-xs">{text.connectedCount}</p>
          </div>
        </div>
      </div>

      {/* 친구 모드 턴 표시 */}
      {isMulti && !isAI && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all ${
                i === playerIdx ? "text-white" : "bg-secondary text-secondary-foreground"
              }`}
              style={{
                background: i === playerIdx ? game.accentColor : undefined,
              }}>
              {p} {i === playerIdx && "🏃"}
            </div>
          ))}
        </div>
      )}

      {/* AI 모드 턴 표시 */}
      {isAI && (
        <div className="flex gap-2">
          <div className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all ${
            !awaitingAiTurn ? "text-white" : "bg-secondary text-secondary-foreground"
          }`}
            style={{
              background: !awaitingAiTurn ? game.accentColor : undefined,
            }}>
            {myPlayerName} {!awaitingAiTurn && "🏃"}
          </div>
          <div className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            awaitingAiTurn ? "text-white" : "bg-secondary text-secondary-foreground"
          }`}
            style={{
              background: awaitingAiTurn ? AI_COLOR : undefined,
            }}>
            🤖 AI {aiLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            )}
          </div>
        </div>
      )}

      {/* 질문 체인 */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={locale === "en" ? "Question relay chain" : "질문 릴레이 사슬"}
        aria-busy={aiLoading}
        className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-4 max-h-72 overflow-y-auto space-y-2"
      >
        {chain.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <p className="text-3xl mb-2">🎯</p>
            <p>{text.firstQuestionPrompt(finalTopic)}</p>
          </div>
        ) : (
          chain.map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                style={{ background: item.isAI ? AI_COLOR : playerColor(item.player) }}>
                {i + 1}
              </div>
              <div
                className={`flex-1 rounded-xl px-3 py-2 text-sm leading-relaxed text-foreground ${
                  i === chain.length - 1 ? "border-2 font-medium" : "bg-secondary"
                }`}
                style={i === chain.length - 1 ? {
                  borderColor: item.isAI ? AI_COLOR : game.accentColor,
                  background: item.isAI ? "hsl(var(--secondary))" : `${game.accentColor}10`,
                } : {}}>
                <span className="text-xs font-bold mr-1.5 text-foreground">
                  {item.player}
                </span>
                {item.question}
              </div>
            </div>
          ))
        )}

        {/* AI 응답 대기 중 */}
        {aiLoading && (
          <div className="flex gap-2.5 items-start">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
              style={{ background: AI_COLOR }}>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            </div>
            <div className="flex-1 bg-secondary border-2 border-border rounded-xl px-3 py-2.5 flex items-center gap-2">
              <p className="text-secondary-foreground text-sm font-medium">{text.aiMakingQuestion}</p>
            </div>
          </div>
        )}

        <div ref={chainEndRef} />
      </div>

      {/* 앞 질문 연결 힌트 (AI 응답 후 학생 차례) */}
      {prevForHint && !interactionBusy && !awaitingAiTurn && !awaitingCompletion && (
        <div className="rounded-xl border-2 px-4 py-3"
          style={{
            borderColor: lastItem?.isAI ? AI_COLOR : game.accentColor,
            background: lastItem?.isAI ? "hsl(var(--secondary))" : `${game.accentColor}08`,
          }}>
          <p className="text-xs font-bold mb-1 text-foreground">
            {text.connectToQuestion}
          </p>
          <p className="text-foreground text-sm font-medium">{prevForHint.question}</p>
        </div>
      )}

      {/* 입력 및 완료 영역 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-4 space-y-3">
        {!runConflict && (localError || runError) && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
            {localError || runError}
          </div>
        )}

        {runConflict ? (
          <div className="space-y-3">
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 px-3 py-2 text-sm">
              {runConflict}
            </div>
            <Button
              type="button"
              className="w-full font-bold rounded-xl"
              variant="outline"
              onClick={returnToNewRun}
            >
              {locale === "en" ? "Start a new run" : "새 실행으로 돌아가기"}
            </Button>
          </div>
        ) : awaitingCompletion ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-muted-foreground text-center">
              {runPending === "complete"
                ? text.analyzingPoints
                : (locale === "en"
                  ? "Your questions are saved. Finish the run to receive points."
                  : "질문은 저장되었어요. 포인트 지급을 마무리해 주세요.")}
            </p>
            <Button
              className="w-full font-bold rounded-xl"
              variant="outline"
              disabled={runBusy}
              onClick={() => void retryCompletion()}
            >
              {runPending === "complete" ? text.loading : text.retryPoints}
            </Button>
          </div>
        ) : awaitingAiTurn ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-muted-foreground text-center">
              {aiLoading
                ? text.aiMakingQuestion
                : (locale === "en"
                  ? "The AI turn is waiting to be recorded."
                  : "인공지능 질문 차례를 이어 가 주세요.")}
            </p>
            <Button
              className="w-full font-bold rounded-xl"
              variant="outline"
              disabled={runBusy}
              onClick={() => void retryAiTurn()}
            >
              {aiLoading
                ? text.loading
                : (locale === "en" ? "Retry AI turn" : "인공지능 차례 다시 시도")}
            </Button>
          </div>
        ) : (
          <>
            <textarea
              ref={inputRef}
              maxLength={QUESTION_GAME_LIMITS.question}
              aria-label={locale === "en" ? "Enter the next question" : "이어 갈 질문 입력"}
              className="w-full bg-background text-foreground border-2 border-input rounded-xl p-3 text-sm resize-none focus:outline-none h-24 transition-colors"
              style={{ borderColor: "hsl(var(--input))" }}
              onFocus={(e) => {
                if (!interactionBusy && !questionNeedsConfirmation) {
                  e.target.style.borderColor = game.accentColor;
                  setLocalError(null);
                  clearRunError();
                }
              }}
              onBlur={(e) => (e.target.style.borderColor = "hsl(var(--input))")}
              placeholder={
                aiLoading
                  ? text.aiMakingPlaceholder
                  : chain.length === 0
                  ? text.firstQuestionPlaceholder(finalTopic)
                  : text.connectedQuestionPlaceholder
              }
              value={inputQ}
              onChange={(e) => {
                if (!interactionBusy && !questionNeedsConfirmation) {
                  setInputQ(e.target.value);
                  setLocalError(null);
                  clearRunError();
                }
              }}
              readOnly={interactionBusy || questionNeedsConfirmation}
              aria-readonly={interactionBusy || questionNeedsConfirmation}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !interactionBusy && !questionNeedsConfirmation) {
                  e.preventDefault();
                  void submitQuestion();
                }
              }}
            />

          <Button
              className="w-full font-bold text-white rounded-xl"
              style={{ background: game.gradientCss, opacity: inputQ.trim() && !interactionBusy ? 1 : 0.4 }}
              disabled={!inputQ.trim() || interactionBusy}
              onClick={() => void submitQuestion()}>
              {runPending === "action"
                ? text.sending
                : questionNeedsConfirmation
                  ? (locale === "en" ? "Check saved question again" : "질문 저장 다시 확인")
                : isAI ? text.relaySubmitAi : text.relaySubmit}
          </Button>

            <p className="text-xs text-muted-foreground text-center">
              {text.questionFormHint}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
