"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const SENTENCES = [
  "고양이가 잔다",
  "개미가 걷는다",
  "토끼가 뛴다",
  "꽃이 예쁘다",
  "사과가 빨갛다",
  "하늘이 파랗다",
  "비가 온다",
  "새가 날아간다",
  "강아지가 짖는다",
  "물고기가 헤엄친다",
  "아이가 웃는다",
  "나무가 흔들린다",
  "별이 빛난다",
  "바람이 분다",
  "눈이 내린다",
  "나비가 날개를 편다",
  "달이 밝다",
  "파도가 친다",
  "벌이 꿀을 모은다",
  "원숭이가 나무에 오른다",
  "햇빛이 따뜻하다",
  "구름이 하얗다",
  "고래가 바다에 산다",
  "개구리가 울다",
  "아기 새가 둥지에 있다",
];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function isQuestionForm(text: string): boolean {
  const trimmed = text.trim();
  // 한국어 의문형 어미 또는 물음표로 끝나는지 확인
  return /[?？]$/.test(trimmed) ||
    /(나요|인가요|인가|할까요|까요|니요|니까|가요|나|냐|니)\s*[?？]?$/.test(trimmed);
}

interface AIFeedback { verdict: "잘했어요" | "다시해봐요"; reason: string; cheer: string }
interface RoundEntry { original: string; student: string; isCorrect: boolean; playerName: string; feedback?: AIFeedback }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function KabaGame({ game, onBack, config }: Props) {
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode !== "solo";

  const [sentences] = useState<string[]>(() => shuffle(SENTENCES));
  const [idx, setIdx] = useState(0);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"input" | "checking" | "feedback" | "done">("input");
  const [history, setHistory] = useState<RoundEntry[]>([]);
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [localResult, setLocalResult] = useState<"correct" | "incorrect" | null>(null);

  const { ask, loading: aiLoading } = useAIPlay();

  const TOTAL_ROUNDS = Math.min(10, sentences.length);
  const current = sentences[idx] ?? "";
  const currentPlayer = players[playerIdx] ?? "나";

  const parseAIFeedback = useCallback((text: string): AIFeedback => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let verdict: "잘했어요" | "다시해봐요" = "잘했어요";
    let reason = "";
    let cheer = "";
    for (const line of lines) {
      if (line.startsWith("판정:")) verdict = line.includes("잘했어요") ? "잘했어요" : "다시해봐요";
      if (line.startsWith("이유:")) reason = line.replace("이유:", "").trim();
      if (line.startsWith("격려:")) cheer = line.replace("격려:", "").trim();
    }
    return { verdict, reason: reason || "확인했어요!", cheer: cheer || "잘하고 있어요! 👍" };
  }, []);

  async function submit() {
    const trimmed = input.trim();
    if (!trimmed) return;

    setPhase("checking");

    if (isAI) {
      const res = await ask({
        action: "kaba:check",
        context: { original: current, student: trimmed },
      });
      const fb = res?.text ? parseAIFeedback(res.text) : { verdict: "잘했어요" as const, reason: "확인했어요!", cheer: "멋져요! 👍" };
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
      const correct = isQuestionForm(trimmed);
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
    setIdx(0);
    setPlayerIdx(0);
    setInput("");
    setFeedback(null);
    setLocalResult(null);
    setHistory([]);
    setPhase("input");
  }

  const correctCount = history.filter((h) => h.isCorrect).length;
  const progressPct = (idx / TOTAL_ROUNDS) * 100;

  /* ── 완료 화면 ── */
  if (phase === "done") {
    const stars = correctCount >= TOTAL_ROUNDS * 0.9 ? 3 :
                  correctCount >= TOTAL_ROUNDS * 0.6 ? 2 : 1;
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-5">
          <div className="text-6xl">{"⭐".repeat(stars)}</div>
          <h2 className="text-3xl font-black text-gray-800">완성!</h2>
          <p className="text-gray-500 text-center text-sm">
            {TOTAL_ROUNDS}문제 중 <span className="font-black text-blue-600 text-xl">{correctCount}</span>개 맞혔어요!
          </p>
          <div className="w-full space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <span className="text-lg">{h.isCorrect ? "✅" : "❌"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">{h.original}</p>
                  <p className="text-sm font-medium text-gray-700 truncate">{h.student}</p>
                </div>
                {isMulti && <span className="text-xs text-gray-400 flex-shrink-0">{h.playerName}</span>}
              </div>
            ))}
          </div>
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }} onClick={restart}>
            🔄 다시 하기!
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">평서문을 질문으로 바꿔요!</p>
          </div>
        </div>
      </div>

      {/* 플레이어 턴 (멀티) */}
      {isMulti && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className="flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all"
              style={{
                background: i === playerIdx ? game.accentColor : "#f3f4f6",
                color: i === playerIdx ? "white" : "#9ca3af",
              }}>
              {p} {i === playerIdx ? "🙋" : ""}
            </div>
          ))}
        </div>
      )}

      {/* 진행도 */}
      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{idx + 1} / {TOTAL_ROUNDS} 문제</span>
          <span className="font-bold" style={{ color: game.accentColor }}>
            {correctCount}개 맞힘 ✅
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="h-3 rounded-full transition-all duration-500"
            style={{ background: game.gradientCss, width: `${progressPct}%` }} />
        </div>
      </div>

      {/* 메인 게임 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 상단: 평서문 표시 */}
        <div className="p-6 text-center"
          style={{ background: `${game.accentColor}10` }}>
          <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wider">
            {isMulti ? `${currentPlayer}의 차례 — 이 문장을 질문으로 바꿔요!` : "이 문장을 질문으로 바꿔요!"}
          </p>
          <div className="inline-block bg-white rounded-2xl px-8 py-5 shadow-sm border border-gray-100">
            <p className="text-3xl font-black text-gray-800 leading-tight">{current}</p>
          </div>
          {/* 변환 힌트 */}
          <div className="flex items-center justify-center gap-3 mt-4 text-gray-400">
            <span className="text-lg">📢</span>
            <span className="text-sm">예) ~<span className="font-bold text-blue-500">나요?</span> · ~<span className="font-bold text-blue-500">인가요?</span> · ~<span className="font-bold text-blue-500">할까요?</span></span>
          </div>
        </div>

        {/* 하단: 입력/피드백 */}
        <div className="p-6 space-y-4">
          {phase === "input" && (
            <>
              <div className="relative">
                <input
                  type="text"
                  className="w-full border-2 rounded-2xl px-5 py-4 text-xl font-bold text-center focus:outline-none transition-colors"
                  style={{ borderColor: "#e5e7eb" }}
                  onFocus={(e) => (e.target.style.borderColor = game.accentColor)}
                  onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  placeholder="질문으로 바꿔 써보세요!"
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
                {isAI ? "🤖 AI 선생님께 확인받기!" : "✅ 확인하기!"}
              </Button>
            </>
          )}

          {/* AI 확인 중 */}
          {phase === "checking" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-600 font-bold text-lg">AI 선생님이 확인하는 중...</p>
            </div>
          )}

          {/* 피드백 */}
          {phase === "feedback" && (
            <div className="space-y-4">
              {/* 내 답 표시 */}
              <div className="text-center bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">내가 바꾼 질문</p>
                <p className="text-xl font-black text-gray-800">{history[history.length - 1]?.student}</p>
              </div>

              {/* AI 피드백 */}
              {isAI && feedback && (
                <div className={`rounded-2xl p-5 text-center space-y-2 ${
                  feedback.verdict === "잘했어요"
                    ? "bg-green-50 border-2 border-green-200"
                    : "bg-orange-50 border-2 border-orange-200"
                }`}>
                  <div className="text-5xl">{feedback.verdict === "잘했어요" ? "🎉" : "🤔"}</div>
                  <p className={`text-2xl font-black ${
                    feedback.verdict === "잘했어요" ? "text-green-600" : "text-orange-500"
                  }`}>
                    {feedback.verdict}
                  </p>
                  <p className="text-gray-600 text-sm">{feedback.reason}</p>
                  <p className="text-blue-600 text-sm font-medium bg-blue-50 rounded-xl px-4 py-2">
                    💬 {feedback.cheer}
                  </p>
                </div>
              )}

              {/* 로컬 피드백 */}
              {!isAI && localResult && (
                <div className={`rounded-2xl p-5 text-center ${
                  localResult === "correct"
                    ? "bg-green-50 border-2 border-green-200"
                    : "bg-orange-50 border-2 border-orange-200"
                }`}>
                  <div className="text-5xl mb-2">{localResult === "correct" ? "🎉" : "🤔"}</div>
                  <p className={`text-2xl font-black ${
                    localResult === "correct" ? "text-green-600" : "text-orange-500"
                  }`}>
                    {localResult === "correct" ? "잘했어요!" : "다시 해봐요!"}
                  </p>
                  {localResult === "incorrect" && (
                    <p className="text-gray-500 text-sm mt-2">
                      '~나요?', '~인가요?' 처럼 끝을 바꿔봐요 😊
                    </p>
                  )}
                </div>
              )}

              <Button
                className="w-full py-4 text-lg font-black text-white rounded-2xl"
                style={{ background: game.gradientCss }}
                onClick={next}>
                {idx + 1 >= TOTAL_ROUNDS ? "🏁 결과 보기!" : "다음 문장 →"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* AI 모드 안내 */}
      {isAI && phase === "input" && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <span className="text-2xl">🤖</span>
          <p className="text-blue-600 text-sm">AI 선생님이 질문으로 잘 바꿨는지 확인해 줘요!</p>
        </div>
      )}
    </div>
  );
}
