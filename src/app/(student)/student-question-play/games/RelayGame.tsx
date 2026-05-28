"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BuiltInGame } from "@/lib/question-games-data";

const SEEDS = [
  "학교 급식은 매일 다른 메뉴가 나와요.",
  "나무는 햇빛과 물로 자라요.",
  "우리나라의 수도는 서울이에요.",
  "강물은 바다로 흘러가요.",
  "겨울에는 눈이 내려요.",
  "사람은 음식을 먹어야 살 수 있어요.",
  "지구는 태양 주위를 돌고 있어요.",
  "책을 읽으면 새로운 것을 배울 수 있어요.",
  "동물들은 저마다 다른 방식으로 소통해요.",
  "오늘 날씨가 맑아서 기분이 좋아요.",
];

interface ChainEntry {
  type: "seed" | "question" | "answer";
  text: string;
  author?: string;
}

const MAX_ROUNDS = 5;

interface Props { game: BuiltInGame; onBack: () => void }

export default function RelayGame({ game, onBack }: Props) {
  const [phase, setPhase] = useState<"setup" | "question" | "answer" | "done">("setup");
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [round, setRound] = useState(0);
  const [playerCount, setPlayerCount] = useState(2);
  const [playerNames, setPlayerNames] = useState<string[]>(["", ""]);
  const [inputText, setInputText] = useState("");

  const currentPlayer = round % playerCount;
  const currentName = playerNames[currentPlayer]?.trim() || `학생 ${currentPlayer + 1}`;

  function startGame() {
    const seed = SEEDS[Math.floor(Math.random() * SEEDS.length)];
    setChain([{ type: "seed", text: seed }]);
    setRound(0);
    setPhase("question");
  }

  function submitQuestion() {
    if (!inputText.trim()) return;
    setChain((c) => [...c, { type: "question", text: inputText, author: currentName }]);
    setInputText("");
    setPhase("answer");
  }

  function submitAnswer() {
    if (!inputText.trim()) return;
    const newChain: ChainEntry[] = [...chain, { type: "answer", text: inputText, author: currentName }];
    setChain(newChain);
    setInputText("");
    const nextRound = round + 1;
    setRound(nextRound);
    if (nextRound >= MAX_ROUNDS) {
      setPhase("done");
    } else {
      setPhase("question");
    }
  }

  function reset() {
    setChain([]);
    setRound(0);
    setInputText("");
    setPhase("setup");
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
            <p className="text-white/80 text-sm">대답에서 새 질문을 이어가요!</p>
          </div>
        </div>
      </div>

      {/* 설정 화면 */}
      {phase === "setup" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <h2 className="font-black text-gray-800 mb-3">참가 인원 선택</h2>
            <div className="flex gap-2">
              {[1,2,3,4].map((n) => (
                <button key={n}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                  style={{ background: playerCount === n ? game.accentColor : "#f3f4f6", color: playerCount === n ? "white" : "#374151" }}
                  onClick={() => {
                    setPlayerCount(n);
                    setPlayerNames(Array(n).fill(""));
                  }}>
                  {n}명{n === 1 ? " (혼자)" : ""}
                </button>
              ))}
            </div>
          </div>
          {playerCount > 1 && (
            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-2">이름 입력 (선택)</h3>
              <div className="space-y-2">
                {Array.from({ length: playerCount }, (_, i) => (
                  <input key={i}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                    placeholder={`학생 ${i + 1} 이름`}
                    value={playerNames[i] ?? ""}
                    onChange={(e) => {
                      const n = [...playerNames]; n[i] = e.target.value; setPlayerNames(n);
                    }} />
                ))}
              </div>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
            <p className="font-bold mb-1">🎮 게임 방법</p>
            <p>1. 주어진 문장을 읽고 질문을 만들어요.</p>
            <p>2. 그 질문에 대한 대답을 써요.</p>
            <p>3. 그 대답에서 새 질문을 만들어요.</p>
            <p>4. {MAX_ROUNDS}번 릴레이하면 완성!</p>
          </div>
          <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss }}
            onClick={startGame}>
            🏃 릴레이 시작!
          </Button>
        </div>
      )}

      {/* 게임 화면 */}
      {(phase === "question" || phase === "answer") && (
        <div className="space-y-4">
          {/* 진행도 */}
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>라운드 {round + 1} / {MAX_ROUNDS}</span>
              <span className="font-bold" style={{ color: game.accentColor }}>{currentName}의 차례</span>
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
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                  ${item.type === "seed" ? "bg-gray-50 border border-gray-200 text-gray-700" :
                    item.type === "question" ? "text-white" : "bg-gray-100 text-gray-700"}`}
                  style={item.type === "question" ? { background: game.accentColor } : {}}>
                  {item.author && <p className="text-xs opacity-60 mb-0.5 font-medium">{item.author}</p>}
                  {item.text}
                </div>
              </div>
            ))}
          </div>

          {/* 입력 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-bold"
                style={{ background: game.accentColor }}>
                {phase === "question" ? "?" : "💬"}
              </span>
              {currentName}이(가) {phase === "question" ? "질문을 만들어요!" : "대답해요!"}
            </h3>
            {phase === "question" && lastItem && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                <p className="font-medium text-xs text-amber-500 mb-1">
                  {lastItem.type === "seed" ? "📌 주어진 문장" : "💬 앞 친구의 대답"}
                </p>
                {lastItem.text}
              </div>
            )}
            <textarea
              className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
              style={{ borderColor: "#e5e7eb" }}
              onFocus={(e) => e.target.style.borderColor = game.accentColor}
              onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
              placeholder={phase === "question" ?
                "위 문장/대답을 보고 질문을 만들어보세요..." :
                "질문에 대한 대답을 써보세요..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              autoFocus
            />
            <Button
              className="w-full font-bold text-white rounded-xl"
              style={{ background: game.gradientCss, opacity: inputText.trim() ? 1 : 0.5 }}
              disabled={!inputText.trim()}
              onClick={phase === "question" ? submitQuestion : submitAnswer}>
              {phase === "question" ? "질문 제출 →" : "대답 제출 →"}
            </Button>
          </div>
        </div>
      )}

      {/* 완료 화면 */}
      {phase === "done" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-4">
            <div className="text-6xl">🏆</div>
            <h2 className="text-2xl font-black text-gray-800">릴레이 완성!</h2>
            <p className="text-gray-500 text-sm text-center">
              {MAX_ROUNDS}번 질문 릴레이를 완성했어요!<br/>
              이어진 질문과 대답을 확인해보세요.
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            <h3 className="font-bold text-gray-700">📜 전체 릴레이 체인</h3>
            {chain.map((item, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${item.type === "seed" ? "bg-gray-200 text-gray-600" : item.type === "question" ? "text-white" : "bg-gray-100 text-gray-600"}`}
                  style={item.type === "question" ? { background: game.accentColor } : {}}>
                  {item.type === "seed" ? "📌" : item.type === "question" ? "?" : "💬"}
                </div>
                <div className="flex-1">
                  {item.author && <p className="text-xs text-gray-400">{item.author}</p>}
                  <p className="text-sm text-gray-800">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }}
            onClick={reset}>
            🔄 다시 하기
          </Button>
        </div>
      )}
    </div>
  );
}
