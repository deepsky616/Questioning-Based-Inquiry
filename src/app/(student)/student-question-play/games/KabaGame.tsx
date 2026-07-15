"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { getKabaSentences, getKabaText, getQuestionGameText, isQuestionFormForLocale } from "@/lib/question-game-i18n";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

interface AIFeedback { verdict: "잘했어요" | "다시해봐요"; reason: string; cheer: string }
interface RoundEntry { original: string; student: string; isCorrect: boolean; playerName: string; feedback?: AIFeedback }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function KabaGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const kabaText = getKabaText(locale);
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode === "friend";
  const targetAttempts = QUESTION_GAME_RULES.kaba.targets[isAI ? "ai" : "solo"].count;

  const [sentences, setSentences] = useState<string[]>(() => shuffle([...getKabaSentences(locale)]));
  const [idx, setIdx] = useState(0);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"input" | "checking" | "feedback" | "done">("input");
  const [history, setHistory] = useState<RoundEntry[]>([]);
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [localResult, setLocalResult] = useState<"correct" | "incorrect" | null>(null);

  const { ask } = useAIPlay();
  const aiRequestRef = useRef(0);

  useEffect(() => {
    aiRequestRef.current += 1;
    setSentences(shuffle([...getKabaSentences(locale)]));
    setIdx(0);
    setPlayerIdx(0);
    setInput("");
    setFeedback(null);
    setLocalResult(null);
    setHistory([]);
    setPhase("input");
  }, [locale]);

  useEffect(() => () => {
    aiRequestRef.current += 1;
  }, []);

  const TOTAL_ROUNDS = Math.min(targetAttempts, sentences.length);
  const current = sentences[idx] ?? "";
  const currentPlayer = players[playerIdx] ?? text.me;

  const parseAIFeedback = useCallback((text: string): AIFeedback | null => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let verdict: "잘했어요" | "다시해봐요" | null = null;
    let reason = "";
    let cheer = "";
    for (const line of lines) {
      if (line.startsWith("판정:")) {
        if (line.includes("잘했어요")) verdict = "잘했어요";
        else if (line.includes("다시해봐요")) verdict = "다시해봐요";
      }
      if (line.startsWith("이유:")) reason = line.replace("이유:", "").trim();
      if (line.startsWith("격려:")) cheer = line.replace("격려:", "").trim();
    }
    if (!verdict) return null;
    return {
      verdict,
      reason: reason || (locale === "en" ? "Checked!" : "확인했어요!"),
      cheer: cheer || (locale === "en" ? "Keep going!" : "잘하고 있어요! 👍"),
    };
  }, [locale]);

  async function submit() {
    const trimmed = input.trim();
    if (!trimmed) return;

    setPhase("checking");

    if (isAI) {
      const requestId = ++aiRequestRef.current;
      const res = await ask({
        action: "kaba:check",
        context: { original: current, student: trimmed },
      });
      if (requestId !== aiRequestRef.current) return;
      const locallyCorrect = isQuestionFormForLocale(trimmed, locale);
      const fb = (res?.text ? parseAIFeedback(res.text) : null) ?? {
        verdict: locallyCorrect ? "잘했어요" as const : "다시해봐요" as const,
        reason: locale === "en"
          ? (locallyCorrect ? "It has a question form." : "Rewrite it as a question.")
          : (locallyCorrect ? "질문 형태로 바꿨어요." : "질문 형태로 다시 바꿔 보세요."),
        cheer: locale === "en" ? "Keep going!" : "계속 도전해 보세요!",
      };
      setFeedback(fb);
      setHistory((h) => [...h, {
        original: current,
        student: trimmed,
        isCorrect: fb.verdict === "잘했어요",
        playerName: currentPlayer,
        feedback: fb,
      }]);
      setPhase("feedback");
    } else {
      // 로컬 검사: 의문형 어미 여부
      const correct = isQuestionFormForLocale(trimmed, locale);
      setLocalResult(correct ? "correct" : "incorrect");
      setHistory((h) => [...h, {
        original: current,
        student: trimmed,
        isCorrect: correct,
        playerName: currentPlayer,
      }]);
      setPhase("feedback");
    }
  }

  function next() {
    const nextIdx = idx + 1;
    if (nextIdx >= TOTAL_ROUNDS) {
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

  function restart() {
    aiRequestRef.current += 1;
    setIdx(0);
    setPlayerIdx(0);
    setInput("");
    setFeedback(null);
    setLocalResult(null);
    setHistory([]);
    setPhase("input");
  }

  function handleBack() {
    aiRequestRef.current += 1;
    onBack();
  }

  const correctCount = history.filter((h) => h.isCorrect).length;
  const progressPct = (history.length / TOTAL_ROUNDS) * 100;

  /* ── 완료 화면 ── */
  if (phase === "done") {
    const stars = correctCount >= TOTAL_ROUNDS * 0.9 ? 3 :
                  correctCount >= TOTAL_ROUNDS * 0.6 ? 2 : 1;
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm">{text.backToList}</button>
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
                  <p className="text-xs text-muted-foreground">{h.original}</p>
                  <p className="text-sm font-medium text-foreground truncate">{h.student}</p>
                </div>
                {isMulti && <span className="text-xs text-muted-foreground flex-shrink-0">{h.playerName}</span>}
              </div>
            ))}
          </div>
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }} onClick={restart}>
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
        <button onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm">{text.backToList}</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white text-sm">{kabaText.subtitle}</p>
          </div>
        </div>
      </div>

      {/* 플레이어 턴 (멀티) */}
      {isMulti && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className={`flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all ${
                i === playerIdx ? "text-white" : "bg-secondary text-muted-foreground"
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
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">
            {kabaText.sentencePrompt(isMulti ? currentPlayer : undefined)}
          </p>
          <div className="inline-block bg-background rounded-2xl px-8 py-5 shadow-sm border border-border">
            <p className="text-3xl font-black text-foreground leading-tight">{current}</p>
          </div>
          {/* 변환 힌트 */}
          <div className="flex items-center justify-center gap-3 mt-4 text-muted-foreground">
            <span className="text-lg">📢</span>
            <span className="text-sm">{kabaText.hint}</span>
          </div>
        </div>

        {/* 하단: 입력/피드백 */}
        <div className="p-6 space-y-4">
          {phase === "input" && (
            <>
              <div className="relative">
                <input
                  type="text"
                  className="w-full bg-background text-foreground border-2 border-input rounded-2xl px-5 py-4 text-xl font-bold text-center focus:outline-none transition-colors"
                  style={{ borderColor: "hsl(var(--input))" }}
                  onFocus={(e) => (e.target.style.borderColor = game.accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(var(--input))")}
                  placeholder={kabaText.placeholder}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  autoFocus
                />
              </div>
              <Button
                className="w-full py-4 text-lg font-black text-white rounded-2xl"
                style={{ background: game.gradientCss, opacity: input.trim() ? 1 : 0.4 }}
                disabled={!input.trim()}
                onClick={submit}>
                {isAI ? kabaText.checkAi : kabaText.check}
              </Button>
            </>
          )}

          {/* AI 확인 중 */}
          {phase === "checking" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-600 font-bold text-lg">{kabaText.checking}</p>
            </div>
          )}

          {/* 피드백 */}
          {phase === "feedback" && (
            <div className="space-y-4">
              {/* 내 답 표시 */}
              <div className="text-center bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{kabaText.myQuestion}</p>
                <p className="text-xl font-black text-foreground">{history[history.length - 1]?.student}</p>
              </div>

              {/* AI 피드백 */}
              {isAI && feedback && (
                <div className="rounded-2xl bg-secondary border-2 border-border p-5 text-center space-y-2">
                  <div className="text-5xl">{feedback.verdict === "잘했어요" ? "🎉" : "🤔"}</div>
                  <p className={`text-2xl font-black ${
                    feedback.verdict === "잘했어요"
                      ? "text-green-900 dark:text-green-200"
                      : "text-orange-800 dark:text-orange-200"
                  }`}>
                    {feedback.verdict === "잘했어요" ? kabaText.good : kabaText.tryAgain}
                  </p>
                  <p className="text-muted-foreground text-sm">{feedback.reason}</p>
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
                    <p className="text-muted-foreground text-sm mt-2">
                      {kabaText.localTip}
                    </p>
                  )}
                </div>
              )}

              <Button
                className="w-full py-4 text-lg font-black text-white rounded-2xl"
                style={{ background: game.gradientCss }}
                onClick={next}>
                {idx + 1 >= TOTAL_ROUNDS ? kabaText.seeResult : kabaText.nextSentence}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* AI 모드 안내 */}
      {isAI && phase === "input" && (
        <div className="flex items-center gap-3 bg-secondary border border-border rounded-xl px-4 py-3">
          <span className="text-2xl">🤖</span>
          <p className="text-muted-foreground text-sm">{kabaText.aiHelp}</p>
        </div>
      )}
    </div>
  );
}
