"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { getQuestionGameText, getRelayTopics, isQuestionFormForLocale } from "@/lib/question-game-i18n";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";
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
  const targetQuestions = QUESTION_GAME_RULES.relay.targets[isAI ? "ai" : "solo"].count;

  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [inputQ, setInputQ] = useState("");
  const [playerIdx, setPlayerIdx] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const chainEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const aiRequestRef = useRef(0);

  const { ask, loading: aiLoading } = useAIPlay();

  const finalTopic = customTopic.trim() || topic;
  const myPlayerName = players[0] ?? text.me;
  const studentQuestionCount = chain.filter((item) => !item.isAI).length;
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
    if (!aiLoading && phase === "playing") {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [aiLoading, phase]);

  useEffect(() => () => {
    aiRequestRef.current += 1;
  }, []);

  function handleBack() {
    aiRequestRef.current += 1;
    onBack();
  }

  function startGame() {
    if (!finalTopic) return;
    aiRequestRef.current += 1;
    setChain([]);
    setInputQ("");
    setPlayerIdx(0);
    setLocalError(null);
    setPhase("playing");
  }

  // AI가 다음 질문 생성 (체인 추가까지 완료)
  const runAITurn = useCallback(async (currentChain: ChainItem[], t: string) => {
    const requestId = ++aiRequestRef.current;
    const prev = currentChain[currentChain.length - 1]?.question ?? "";
    const history = currentChain.map((c) => `"${c.question}"`).join(", ");
    const res = await ask({
      action: "relay:ai-turn",
      context: { topic: t, prev, history },
    });
    if (requestId !== aiRequestRef.current) return;
    if (res?.text) {
      const generated = res.text.trim();
      if (generated) {
        setChain((c) => [...c, { question: generated, player: "🤖 AI", isAI: true }]);
      }
    }
  }, [ask]);

  async function submitQuestion() {
    const trimmed = inputQ.trim();
    if (!trimmed || aiLoading) return;

    setLocalError(null);

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

    // 학생/친구 질문 체인에 추가
    const playerName = isAI ? myPlayerName : currentFriendPlayer;
    const newChain: ChainItem[] = [...chain, { question: trimmed, player: playerName }];
    setChain(newChain);
    setInputQ("");

    const nextStudentQuestionCount = newChain.filter((item) => !item.isAI).length;
    if (nextStudentQuestionCount >= targetQuestions) {
      aiRequestRef.current += 1;
      setPhase("done");
      return;
    }

    if (isAI) {
      // AI가 즉시 다음 질문 생성
      await runAITurn(newChain, finalTopic);
    } else if (isMulti) {
      // 친구 모드: 다음 플레이어로 교대
      setPlayerIdx((i) => (i + 1) % players.length);
    }
  }

  const lastItem = chain[chain.length - 1];
  // AI 모드: 직전 질문 (연결 기준)
  const prevForHint = chain.length > 0 ? lastItem : null;

  /* ─── 설정 화면 ─── */
  if (phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm">{text.backToList}</button>
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
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5">
            <p className="text-orange-700 font-black text-sm">{text.gameRules}</p>
            {text.relayRules.map((r, i) => (
              <p key={i} className="text-orange-600 text-sm flex items-start gap-2">
                <span className="flex-shrink-0">•</span>{r}
              </p>
            ))}
            {isAI && (
              <p className="text-indigo-600 text-sm font-bold mt-2 bg-indigo-50 rounded-lg px-3 py-1.5">
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
            <div className="rounded-xl px-4 py-3 text-white text-center font-bold"
              style={{ background: game.gradientCss }}>
              {text.selectedTopic}: <span className="text-xl">{finalTopic}</span>
            </div>
          )}

          <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss, opacity: finalTopic ? 1 : 0.4 }}
            disabled={!finalTopic}
            onClick={startGame}>
            {text.relayStart}
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
          <button onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm">{text.backToList}</button>
        </div>
        <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-8 flex flex-col items-center gap-4">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-foreground">{text.relayDone}</h2>
          <p className="text-muted-foreground text-sm">{text.topic}: <span className="font-bold text-foreground">{finalTopic}</span></p>
          <p className="text-muted-foreground text-sm">
            {text.relayTotal(studentQuestionCount)}
          </p>
        </div>

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
            aiRequestRef.current += 1;
            setPhase("setup");
            setTopic("");
            setCustomTopic("");
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
        <button onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm">{text.backToList}</button>
        <div className="flex-1 rounded-2xl py-3 px-5 text-white flex items-center justify-between"
          style={{ background: game.gradientCss }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{game.emoji}</span>
            <div>
              <p className="font-black">{game.title}</p>
              <p className="text-white text-xs">{text.topic}: {finalTopic}</p>
            </div>
          </div>
          <div className="text-white text-right">
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
                i === playerIdx ? "text-white" : "bg-secondary text-muted-foreground"
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
            !aiLoading ? "text-white" : "bg-secondary text-muted-foreground"
          }`}
            style={{
              background: !aiLoading ? game.accentColor : undefined,
            }}>
            {myPlayerName} {!aiLoading && "🏃"}
          </div>
          <div className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            aiLoading ? "text-white" : "bg-secondary text-muted-foreground"
          }`}
            style={{
              background: aiLoading ? AI_COLOR : undefined,
            }}>
            🤖 AI {aiLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            )}
          </div>
        </div>
      )}

      {/* 질문 체인 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-4 max-h-72 overflow-y-auto space-y-2">
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
              <p className="text-muted-foreground text-sm font-medium">{text.aiMakingQuestion}</p>
            </div>
          </div>
        )}

        <div ref={chainEndRef} />
      </div>

      {/* 앞 질문 연결 힌트 (AI 응답 후 학생 차례) */}
      {prevForHint && !aiLoading && (
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

      {/* 입력 영역 — 항상 학생 차례 (AI가 응답 중일 때만 비활성화) */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-4 space-y-3">
        {localError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm">
            ❌ {localError}
          </div>
        )}

        <textarea
          ref={inputRef}
          className="w-full bg-background text-foreground border-2 border-input rounded-xl p-3 text-sm resize-none focus:outline-none h-24 transition-colors disabled:bg-secondary disabled:text-muted-foreground"
          style={{ borderColor: "hsl(var(--input))", opacity: aiLoading ? 0.5 : 1 }}
          onFocus={(e) => { if (!aiLoading) { e.target.style.borderColor = game.accentColor; setLocalError(null); } }}
          onBlur={(e) => (e.target.style.borderColor = "hsl(var(--input))")}
          placeholder={
            aiLoading
              ? text.aiMakingPlaceholder
              : chain.length === 0
              ? text.firstQuestionPlaceholder(finalTopic)
              : text.connectedQuestionPlaceholder
          }
          value={inputQ}
          onChange={(e) => { if (!aiLoading) { setInputQ(e.target.value); setLocalError(null); } }}
          disabled={aiLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !aiLoading) {
              e.preventDefault();
              submitQuestion();
            }
          }}
        />

        <div className="flex gap-2">
          <Button
            className="flex-1 font-bold text-white rounded-xl"
            style={{ background: game.gradientCss, opacity: inputQ.trim() && !aiLoading ? 1 : 0.4 }}
            disabled={!inputQ.trim() || aiLoading}
            onClick={submitQuestion}>
            {isAI ? text.relaySubmitAi : text.relaySubmit}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {text.questionFormHint}
        </p>
      </div>
    </div>
  );
}
