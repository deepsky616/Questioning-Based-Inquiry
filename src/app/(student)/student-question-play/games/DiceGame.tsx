"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const DICE_TYPES = [
  { face: 1, type: "사실질문", desc: "언제, 어디서, 무엇이 일어났는지 확인하는 질문", example: "공룡은 언제 멸종했나요?", color: "#3b82f6" },
  { face: 2, type: "개념질문", desc: "어떤 것의 의미나 본질을 파악하는 질문", example: "민주주의란 무엇인가요?", color: "#8b5cf6" },
  { face: 3, type: "논쟁질문", desc: "옳고 그름을 따져보는 비판적 질문", example: "동물 실험은 허용되어야 할까요?", color: "#ef4444" },
  { face: 4, type: "상상질문", desc: "아직 일어나지 않은 일을 상상하는 질문", example: "만약 사람이 날 수 있다면?", color: "#f59e0b" },
  { face: 5, type: "비교질문", desc: "둘 이상을 비교·대조하는 질문", example: "강과 바다는 어떻게 다른가요?", color: "#10b981" },
  { face: 6, type: "열린질문", desc: "정해진 답 없이 자유롭게 탐구하는 질문", example: "무엇이든 원하는 질문을 만들어요!", color: "#ec4899" },
];

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

interface RoundEntry { player: string; face: number; type: string; question: string; aiFeedback?: string }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function DiceGame({ game, onBack, config }: Props) {
  const { mode, players } = config;
  const isMulti = mode !== "solo";
  const isAI = mode === "ai";

  const [phase, setPhase] = useState<"idle" | "rolling" | "result" | "ai-turn">("idle");
  const [currentFace, setCurrentFace] = useState(1);
  const [displayFace, setDisplayFace] = useState(1);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<RoundEntry[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [aiQuestion, setAiQuestion] = useState("");
  const [feedback, setFeedback] = useState("");

  const { ask, loading: aiLoading } = useAIPlay();

  const currentPlayer = players[currentPlayerIdx] ?? "나";
  const isAITurn = isAI && currentPlayerIdx === 1;

  const roll = useCallback(() => {
    setPhase("rolling");
    setQuestion("");
    setAiQuestion("");
    setFeedback("");
    let count = 0;
    const final = Math.ceil(Math.random() * 6);
    const interval = setInterval(() => {
      setDisplayFace(Math.ceil(Math.random() * 6));
      count++;
      if (count >= 14) {
        clearInterval(interval);
        setDisplayFace(final);
        setCurrentFace(final);
        if (isAITurn) {
          setPhase("ai-turn");
          // AI가 자동으로 질문 생성
          const typeInfo = DICE_TYPES[final - 1];
          ask({
            action: "dice:generate",
            context: { questionType: typeInfo.type, typeDesc: typeInfo.desc },
          }).then((res) => {
            if (res?.text) setAiQuestion(res.text);
            setPhase("result");
          });
        } else {
          setPhase("result");
        }
      }
    }, 100);
  }, [isAITurn, ask]);

  async function submit() {
    if (!question.trim()) return;
    const typeInfo = DICE_TYPES[currentFace - 1];
    let fb = "";

    if (isAI && aiQuestion) {
      const res = await ask({
        action: "dice:feedback",
        context: { studentQuestion: question, aiQuestion },
      });
      fb = res?.text ?? "";
    }

    setHistory((h) => [
      { player: currentPlayer, face: currentFace, type: typeInfo.type, question, aiFeedback: fb },
      ...h,
    ]);
    setFeedback(fb);

    if (isMulti) {
      setCurrentPlayerIdx((i) => (i + 1) % players.length);
    }
    setPhase("idle");
    setQuestion("");
  }

  const typeInfo = DICE_TYPES[currentFace - 1];
  const displayInfo = DICE_TYPES[displayFace - 1];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">{game.description}</p>
          </div>
        </div>
      </div>

      {/* 플레이어 턴 표시 (멀티/AI) */}
      {isMulti && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className="flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all"
              style={{
                background: i === currentPlayerIdx ? game.accentColor : "#f3f4f6",
                color: i === currentPlayerIdx ? "white" : "#9ca3af",
              }}>
              {p} {i === currentPlayerIdx && "🎲"}
            </div>
          ))}
        </div>
      )}

      {/* 주사위 영역 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-6">
        <div className="w-36 h-36 rounded-2xl flex items-center justify-center shadow-xl"
          style={{
            background: phase === "rolling" ? displayInfo.color : phase !== "idle" ? typeInfo.color : "#6366f1",
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
          <p className="text-gray-400 text-sm text-center">
            {isMulti ? `${currentPlayer}의 차례예요!` : "주사위를 굴려서 질문 유형을 정해요!"}
          </p>
        )}

        {phase === "rolling" && (
          <p className="text-xl font-black text-gray-700 animate-pulse">굴리는 중...</p>
        )}

        {(phase === "result" || phase === "ai-turn") && (
          <div className="text-center w-full">
            <div className="inline-block rounded-full px-5 py-2 text-white font-black text-lg mb-2"
              style={{ background: typeInfo.color }}>
              {currentFace}번 — {typeInfo.type}
            </div>
            <p className="text-gray-600 text-sm">{typeInfo.desc}</p>
          </div>
        )}

        {phase !== "rolling" && phase !== "ai-turn" && (
          <Button onClick={roll}
            className="w-full py-4 text-lg font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            disabled={aiLoading}>
            {phase === "idle" ? "🎲 주사위 굴리기!" : "🎲 다시 굴리기!"}
          </Button>
        )}

        {phase === "ai-turn" && (
          <div className="w-full flex items-center justify-center gap-3 py-3">
            <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-indigo-600 font-bold text-sm">AI가 질문을 만드는 중...</span>
          </div>
        )}
      </div>

      {/* 질문 작성 (내 차례) */}
      {phase === "result" && !isAITurn && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-black text-gray-800 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold"
              style={{ background: typeInfo.color }}>✏</span>
            {currentPlayer} — {typeInfo.type}을 만들어보세요!
          </h2>

          {/* AI가 먼저 만든 질문 표시 (AI 모드) */}
          {isAI && aiQuestion && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2">
              <span className="text-xl flex-shrink-0">🤖</span>
              <div>
                <p className="text-indigo-600 text-xs font-bold mb-0.5">AI의 질문</p>
                <p className="text-gray-700 text-sm">{aiQuestion}</p>
              </div>
            </div>
          )}

          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-indigo-400 h-28"
            placeholder={`${typeInfo.type} 유형의 질문을 자유롭게 써보세요...`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button onClick={submit}
            className="w-full font-bold text-white rounded-xl"
            style={{ background: typeInfo.color, opacity: question.trim() ? 1 : 0.5 }}
            disabled={!question.trim() || aiLoading}>
            {aiLoading ? "AI 피드백 받는 중..." : "제출하기 ✓"}
          </Button>
        </div>
      )}

      {/* 피드백 표시 */}
      {feedback && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-2">
          <span className="text-xl">💡</span>
          <div>
            <p className="text-amber-700 text-xs font-bold mb-0.5">AI 피드백</p>
            <p className="text-gray-700 text-sm">{feedback}</p>
          </div>
        </div>
      )}

      {/* 기록 */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm">📝 질문 기록 ({history.length}개)</h3>
          {history.map((h, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm"
                  style={{ background: DICE_TYPES[h.face - 1].color }}>
                  {h.face}
                </div>
                <div>
                  <p className="text-xs text-gray-400">{h.player} · {h.type}</p>
                  <p className="text-gray-800 text-sm font-medium">{h.question}</p>
                </div>
              </div>
              {h.aiFeedback && (
                <p className="text-amber-600 text-xs bg-amber-50 rounded-lg px-3 py-1.5">
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
