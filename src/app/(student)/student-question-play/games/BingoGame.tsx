"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { BuiltInGame } from "@/lib/question-games-data";

const ALL_TYPES = [
  "사실질문", "개념질문", "논쟁질문",
  "상상질문", "비교질문", "이유질문",
  "예측질문", "관계질문", "열린질문",
];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function checkBingo(marks: boolean[]): { hasBingo: boolean; lines: number[][] } {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],      // 가로
    [0,3,6],[1,4,7],[2,5,8],      // 세로
    [0,4,8],[2,4,6],               // 대각선
  ];
  const bingoLines = lines.filter((l) => l.every((i) => marks[i]));
  return { hasBingo: bingoLines.length > 0, lines: bingoLines };
}

interface Props { game: BuiltInGame; onBack: () => void }

export default function BingoGame({ game, onBack }: Props) {
  const [phase, setPhase] = useState<"fill" | "play" | "bingo">("fill");
  const [types] = useState<string[]>(() => shuffle(ALL_TYPES));
  const [questions, setQuestions] = useState<string[]>(Array(9).fill(""));
  const [marks, setMarks] = useState<boolean[]>(Array(9).fill(false));
  const [called, setCalled] = useState<string[]>([]);
  const [latestCall, setLatestCall] = useState<string>("");
  const [bingoLines, setBingoLines] = useState<number[][]>([]);
  const [focusedCell, setFocusedCell] = useState<number | null>(null);

  const allFilled = questions.every((q) => q.trim().length > 0);

  function startGame() {
    setPhase("play");
    callNext([]);
  }

  const callNext = useCallback((alreadyCalled: string[]) => {
    const remaining = types.filter((t) => !alreadyCalled.includes(t));
    if (remaining.length === 0) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    const newCalled = [...alreadyCalled, pick];
    setCalled(newCalled);
    setLatestCall(pick);

    // 자동 표시: 해당 타입이 보드에 있으면 마크
    setMarks((prev) => {
      const next = [...prev];
      types.forEach((t, i) => { if (t === pick) next[i] = true; });
      const { hasBingo, lines } = checkBingo(next);
      if (hasBingo) {
        setBingoLines(lines);
        setTimeout(() => setPhase("bingo"), 600);
      }
      return next;
    });
  }, [types]);

  function handleCallNext() {
    callNext(called);
  }

  function reset() {
    setPhase("fill");
    setQuestions(Array(9).fill(""));
    setMarks(Array(9).fill(false));
    setCalled([]);
    setLatestCall("");
    setBingoLines([]);
    setFocusedCell(null);
  }

  const isBingoCell = (idx: number) => bingoLines.some((l) => l.includes(idx));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">
              {phase === "fill" ? "각 칸에 해당 유형의 질문을 써보세요!" :
               phase === "play" ? "질문 유형을 호명하며 빙고를 완성해요!" : "🎉 빙고!"}
            </p>
          </div>
        </div>
      </div>

      {/* 진행 단계 표시 */}
      <div className="flex items-center gap-2">
        {["fill","play","bingo"].map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${phase === p ? "text-white scale-110" : (["fill","play","bingo"].indexOf(phase) > i ? "text-white" : "bg-gray-100 text-gray-400")}`}
              style={{ background: phase === p || ["fill","play","bingo"].indexOf(phase) > i ? game.accentColor : undefined }}>
              {i + 1}
            </div>
            {i < 2 && <div className="w-8 h-0.5 rounded" style={{ background: ["fill","play","bingo"].indexOf(phase) > i ? game.accentColor : "#e5e7eb" }} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-gray-500 font-medium">
          {phase === "fill" ? "질문 작성" : phase === "play" ? "빙고 게임" : "완료!"}
        </span>
      </div>

      {/* 호명된 유형 표시 (play 단계) */}
      {phase === "play" && latestCall && (
        <div className="bg-white rounded-2xl border-2 p-4 flex items-center justify-between"
          style={{ borderColor: game.accentColor }}>
          <div>
            <p className="text-xs text-gray-400 font-medium">방금 호명된 유형</p>
            <p className="text-2xl font-black" style={{ color: game.accentColor }}>{latestCall}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">호명됨</p>
            <p className="text-lg font-bold text-gray-700">{called.length} / 9</p>
          </div>
        </div>
      )}

      {/* 빙고 보드 */}
      <div className="grid grid-cols-3 gap-3">
        {types.map((type, i) => {
          const isMarked = marks[i];
          const isBingo = isBingoCell(i);
          const isFocused = focusedCell === i;
          return (
            <div
              key={i}
              className="rounded-xl border-2 overflow-hidden transition-all duration-300"
              style={{
                borderColor: isBingo ? "#f59e0b" : isMarked ? game.accentColor : isFocused ? game.accentColor : "#e5e7eb",
                background: isBingo ? "#fef3c7" : isMarked ? `${game.accentColor}15` : "white",
                transform: isBingo ? "scale(1.03)" : "scale(1)",
              }}
            >
              <div className="px-3 py-1.5 text-center text-xs font-bold text-white"
                style={{ background: isMarked ? game.accentColor : "#9ca3af" }}>
                {type}
                {isBingo && " ★"}
              </div>
              {phase === "fill" ? (
                <textarea
                  className="w-full p-2 text-xs resize-none focus:outline-none bg-transparent h-20"
                  placeholder="질문을 써보세요..."
                  value={questions[i]}
                  onFocus={() => setFocusedCell(i)}
                  onBlur={() => setFocusedCell(null)}
                  onChange={(e) => {
                    const next = [...questions];
                    next[i] = e.target.value;
                    setQuestions(next);
                  }}
                />
              ) : (
                <div className="p-2 text-xs text-gray-700 h-20 overflow-hidden leading-relaxed">
                  {questions[i] || <span className="text-gray-300">비어있음</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 액션 버튼 */}
      {phase === "fill" && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>작성 완료: {questions.filter((q) => q.trim()).length} / 9칸</span>
            {!allFilled && <span className="text-orange-500">모든 칸을 채워주세요!</span>}
          </div>
          <Button
            className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss, opacity: allFilled ? 1 : 0.5 }}
            disabled={!allFilled}
            onClick={startGame}
          >
            🎯 빙고 시작!
          </Button>
        </div>
      )}

      {phase === "play" && (
        <div className="flex gap-3">
          <Button
            className="flex-1 py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss }}
            onClick={handleCallNext}
            disabled={called.length >= 9}
          >
            {called.length >= 9 ? "모두 호명됨" : "📢 다음 호명!"}
          </Button>
          <Button variant="outline" className="rounded-xl px-4" onClick={reset}>
            처음부터
          </Button>
        </div>
      )}

      {phase === "bingo" && (
        <div className="bg-white rounded-2xl border-2 border-yellow-400 p-8 flex flex-col items-center gap-4">
          <div className="text-7xl animate-bounce">🎉</div>
          <h2 className="text-3xl font-black text-yellow-500">빙고!</h2>
          <p className="text-gray-600 text-center">
            {bingoLines.length}줄 빙고 달성!<br/>
            <span className="text-sm text-gray-400">{called.length}번 호명 만에 완성했어요</span>
          </p>
          <Button
            className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
            onClick={reset}
          >
            🔄 다시 하기!
          </Button>
        </div>
      )}

      {/* 호명 기록 */}
      {called.length > 0 && phase === "play" && (
        <div>
          <p className="text-xs text-gray-400 font-medium mb-2">호명된 유형들</p>
          <div className="flex flex-wrap gap-2">
            {called.map((c, i) => (
              <span key={i} className="text-xs text-white px-2.5 py-1 rounded-full font-medium"
                style={{ background: game.accentColor }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
