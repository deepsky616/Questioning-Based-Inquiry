"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const SEEDS = [
  "학교 급식은 매일 다른 메뉴가 나와요.",
  "나무는 햇빛과 물로 자라요.",
  "우리나라의 수도는 서울이에요.",
  "강물은 바다로 흘러가요.",
  "겨울에는 눈이 내려요.",
  "사람은 음식을 먹어야 살 수 있어요.",
  "지구는 태양 주위를 돌고 있어요.",
  "책을 읽으면 새로운 것을 배울 수 있어요.",
];

const MAX_ROUNDS = 5;

interface ChainEntry { type: "seed"|"question"|"answer"; text: string; author: string }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function RelayGame({ game, onBack, config }: Props) {
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode !== "solo";

  const [phase, setPhase] = useState<"setup"|"question"|"answer"|"ai-thinking"|"done">("setup");
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [round, setRound] = useState(0);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [inputText, setInputText] = useState("");

  const { ask, loading: aiLoading } = useAIPlay();

  const currentPlayer = players[playerIdx] ?? "학생";
  const isCurrentAI = isAI && playerIdx === 1;

  function startGame() {
    const seed = SEEDS[Math.floor(Math.random() * SEEDS.length)];
    setChain([{ type: "seed", text: seed, author: "시작" }]);
    setRound(0);
    setPlayerIdx(0);
    setPhase("question");
  }

  async function submitQuestion() {
    if (!inputText.trim()) return;
    const newChain: ChainEntry[] = [...chain, { type: "question", text: inputText, author: currentPlayer }];
    setChain(newChain);
    setInputText("");

    const nextPlayerIdx = isMulti ? (playerIdx + 1) % players.length : 0;

    // AI 모드: AI가 대답
    if (isAI) {
      setPhase("ai-thinking");
      const res = await ask({ action: "relay:answer", context: { question: inputText } });
      const aiAnswer = res?.text ?? "잘 모르겠어요.";
      const withAnswer: ChainEntry[] = [...newChain, { type: "answer", text: aiAnswer, author: "🤖 AI" }];
      setChain(withAnswer);
      const nextRound = round + 1;
      setRound(nextRound);
      if (nextRound >= MAX_ROUNDS) {
        setPhase("done");
      } else {
        setPlayerIdx(nextPlayerIdx);
        setPhase("question");
      }
    } else {
      // 친구/솔로: 답변 단계로
      setPlayerIdx(nextPlayerIdx);
      setPhase("answer");
    }
  }

  async function submitAnswer() {
    if (!inputText.trim()) return;
    const withAnswer: ChainEntry[] = [...chain, { type: "answer", text: inputText, author: currentPlayer }];
    setChain(withAnswer);
    setInputText("");
    const nextRound = round + 1;
    setRound(nextRound);

    if (nextRound >= MAX_ROUNDS) {
      setPhase("done");
    } else {
      setPlayerIdx((i) => (i + 1) % players.length);
      setPhase("question");
    }
  }

  function reset() {
    setChain([]); setRound(0); setPlayerIdx(0); setInputText(""); setPhase("setup");
  }

  const lastItem = chain[chain.length - 1];
  const progressPct = (round / MAX_ROUNDS) * 100;

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">
              {isAI ? "AI가 대답해주는 릴레이!" : "대답에서 새 질문을 이어가요!"}
            </p>
          </div>
        </div>
      </div>

      {/* 설정 */}
      {phase === "setup" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-6">
          <div className="text-6xl">🏃</div>
          <div className="text-center">
            <h2 className="text-xl font-black text-gray-800">
              {isAI ? "AI 릴레이 준비!" : isMulti ? `${players.join(" vs ")} 릴레이!` : "릴레이 시작!"}
            </h2>
            <p className="text-gray-500 text-sm mt-2">
              {isAI
                ? "질문을 만들면 AI가 대답해줘요. 그 대답에서 다시 질문을 이어가요!"
                : `${MAX_ROUNDS}번 질문과 대답을 이어가요!`}
            </p>
          </div>
          <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss }} onClick={startGame}>
            🏃 시작!
          </Button>
        </div>
      )}

      {/* 게임 */}
      {(phase === "question" || phase === "answer" || phase === "ai-thinking") && (
        <div className="space-y-4">
          {/* 진행도 */}
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>라운드 {round + 1} / {MAX_ROUNDS}</span>
              {isMulti && (
                <span className="font-bold" style={{ color: game.accentColor }}>
                  {isCurrentAI ? "🤖 AI의 차례" : `${currentPlayer}의 차례`}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 rounded-full transition-all duration-500"
                style={{ background: game.gradientCss, width: `${progressPct}%` }} />
            </div>
          </div>

          {/* 체인 뷰어 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3 max-h-64 overflow-y-auto">
            {chain.map((item, i) => (
              <div key={i} className={`flex gap-3 ${item.type === "question" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm
                  ${item.type === "seed" ? "bg-gray-200" : item.type === "question" ? "text-white" : "bg-gray-100"}`}
                  style={item.type === "question" ? { background: game.accentColor } : {}}>
                  {item.type === "seed" ? "📌" : item.type === "question" ? "?" : "💬"}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm
                  ${item.type === "seed" ? "bg-gray-50 border border-gray-200 text-gray-700" :
                    item.type === "question" ? "text-white" : "bg-gray-100 text-gray-700"}`}
                  style={item.type === "question" ? { background: game.accentColor } : {}}>
                  <p className="text-xs opacity-60 mb-0.5 font-medium">{item.author}</p>
                  {item.text}
                </div>
              </div>
            ))}

            {/* AI 생각 중 */}
            {phase === "ai-thinking" && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm">💬</div>
                <div className="bg-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-indigo-600 text-sm font-medium">AI 생각 중...</span>
                </div>
              </div>
            )}
          </div>

          {/* 입력 */}
          {(phase === "question" || phase === "answer") && !isCurrentAI && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-bold"
                  style={{ background: game.accentColor }}>
                  {phase === "question" ? "?" : "💬"}
                </span>
                {currentPlayer} —{" "}
                {phase === "question" ? "질문을 만들어요!" : "대답해요!"}
              </h3>
              {phase === "question" && lastItem && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  <p className="text-xs text-amber-500 font-medium mb-1">
                    {lastItem.type === "seed" ? "📌 시작 문장" : "💬 앞의 대답"}
                  </p>
                  {lastItem.text}
                </div>
              )}
              <textarea
                className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
                style={{ borderColor: "#e5e7eb" }}
                onFocus={(e) => (e.target.style.borderColor = game.accentColor)}
                onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                placeholder={phase === "question" ? "위 문장을 보고 질문을 만들어보세요..." : "질문에 대한 대답을 써보세요..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                autoFocus
              />
              <Button
                className="w-full font-bold text-white rounded-xl"
                style={{ background: game.gradientCss, opacity: inputText.trim() && !aiLoading ? 1 : 0.5 }}
                disabled={!inputText.trim() || aiLoading}
                onClick={phase === "question" ? submitQuestion : submitAnswer}>
                {aiLoading ? "AI 대답 기다리는 중..." : phase === "question" ? "질문 제출 →" : "대답 제출 →"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 완료 */}
      {phase === "done" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-4">
            <div className="text-6xl">🏆</div>
            <h2 className="text-2xl font-black text-gray-800">릴레이 완성!</h2>
            <p className="text-gray-500 text-sm text-center">
              {MAX_ROUNDS}번 릴레이를 완성했어요!
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h3 className="font-bold text-gray-700">📜 전체 릴레이 체인</h3>
            {chain.map((item, i) => (
              <div key={i} className="flex gap-3">
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
                  ${item.type === "seed" ? "bg-gray-200 text-gray-600" : item.type === "question" ? "text-white" : "bg-gray-100 text-gray-600"}`}
                  style={item.type === "question" ? { background: game.accentColor } : {}}>
                  {item.type === "seed" ? "📌" : item.type === "question" ? "?" : "💬"}
                </div>
                <div>
                  <p className="text-xs text-gray-400">{item.author}</p>
                  <p className="text-sm text-gray-800">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }} onClick={reset}>
            🔄 다시 하기
          </Button>
        </div>
      )}
    </div>
  );
}
