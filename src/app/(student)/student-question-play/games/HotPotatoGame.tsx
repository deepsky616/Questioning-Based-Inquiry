"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { BuiltInGame } from "@/lib/question-games-data";

const TOPICS = [
  "우리 학교에서 가장 좋아하는 장소",
  "오늘 배운 것 중 가장 신기한 것",
  "자연에서 궁금한 것",
  "미래의 기술에 대해",
  "동물의 세계",
  "우주와 별에 대해",
  "좋아하는 계절과 그 이유",
  "책이나 이야기 속 궁금한 것",
  "음식과 요리",
  "친구 사이에서 중요한 것",
  "환경 보호",
  "꿈과 목표",
];

interface RoundEntry { topic: string; question: string }
interface Props { game: BuiltInGame; onBack: () => void }

export default function HotPotatoGame({ game, onBack }: Props) {
  const [phase, setPhase] = useState<"waiting" | "running" | "caught" | "submitted">("waiting");
  const [timeLeft, setTimeLeft] = useState(0);
  const [topic, setTopic] = useState("");
  const [question, setQuestion] = useState("");
  const [rounds, setRounds] = useState<RoundEntry[]>([]);
  const [potatoAngle, setPotatoAngle] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startRound() {
    const randomTime = 10 + Math.floor(Math.random() * 21); // 10~30초
    setTimeLeft(randomTime);
    setPhase("running");

    // 감자 회전 애니메이션
    animRef.current = setInterval(() => {
      setPotatoAngle((a) => a + 15);
    }, 50);

    // 카운트다운
    let remaining = randomTime;
    intervalRef.current = setInterval(() => {
      remaining--;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        clearInterval(animRef.current!);
        const randomTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
        setTopic(randomTopic);
        setPhase("caught");
      }
    }, 1000);
  }

  function submitQuestion() {
    if (!question.trim()) return;
    setRounds((r) => [...r, { topic, question }]);
    setQuestion("");
    setPhase("submitted");
  }

  function nextRound() {
    setPhase("waiting");
    setTopic("");
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animRef.current) clearInterval(animRef.current);
    };
  }, []);

  const urgentColor = timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f59e0b" : "#10b981";

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
          ← 목록
        </button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">{game.description}</p>
          </div>
        </div>
      </div>

      {/* 대기 화면 */}
      {phase === "waiting" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-6">
          <div className="text-8xl">🥔</div>
          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-800">감자가 뜨거워요!</h2>
            <p className="text-gray-500 mt-2 text-sm">버튼을 누르면 타이머가 시작돼요.<br />타이머가 멈추면 감자를 들고 있는 사람이 질문을 만들어요!</p>
          </div>
          {rounds.length > 0 && (
            <p className="text-gray-400 text-sm">{rounds.length}라운드 완료!</p>
          )}
          <Button
            className="w-full py-5 text-xl font-black text-white rounded-2xl"
            style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
            onClick={startRound}
          >
            🔥 감자 돌리기 시작!
          </Button>
        </div>
      )}

      {/* 실행 중 */}
      {phase === "running" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-6">
          <div
            className="text-9xl select-none"
            style={{ transform: `rotate(${potatoAngle}deg)`, transition: "transform 0.05s linear" }}
          >
            🥔
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">감자가 돌아가고 있어요!</p>
            <div
              className="text-6xl font-black tabular-nums"
              style={{ color: urgentColor, transition: "color 0.3s" }}
            >
              {timeLeft}
            </div>
            <p className="text-gray-400 text-sm mt-1">초 남았어요</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full transition-all duration-1000"
              style={{ background: urgentColor, width: `${(timeLeft / 30) * 100}%` }}
            />
          </div>
          <p className="text-gray-400 text-sm animate-pulse">⚡ 빨리 감자를 전달하세요!</p>
        </div>
      )}

      {/* 잡혔을 때 */}
      {phase === "caught" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 p-8 flex flex-col items-center gap-4">
            <div className="text-6xl animate-bounce">🥔</div>
            <div
              className="text-white font-black text-xl px-6 py-2 rounded-full"
              style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
            >
              잡혔어요! 🔥
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 text-center">
              <p className="text-orange-600 text-xs font-medium mb-1">📌 오늘의 주제</p>
              <p className="text-gray-800 font-bold text-lg">{topic}</p>
            </div>
            <p className="text-gray-500 text-sm text-center">이 주제로 질문을 하나 만들어 보세요!</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
            <textarea
              className="w-full border-2 border-orange-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-orange-400 h-28"
              placeholder="주제에 대한 나만의 질문을 써보세요..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
            />
            <Button
              className="w-full font-bold text-white rounded-xl"
              style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)", opacity: question.trim() ? 1 : 0.5 }}
              disabled={!question.trim()}
              onClick={submitQuestion}
            >
              질문 제출하기 🎉
            </Button>
          </div>
        </div>
      )}

      {/* 제출 완료 */}
      {phase === "submitted" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-5">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-black text-gray-800">훌륭해요!</h2>
          <div className="w-full bg-orange-50 border border-orange-100 rounded-xl p-4">
            <p className="text-orange-600 text-xs font-medium mb-1">방금 만든 질문</p>
            <p className="text-gray-800 font-medium">{rounds[rounds.length - 1]?.question}</p>
          </div>
          <Button
            className="w-full py-4 font-black text-white text-lg rounded-xl"
            style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
            onClick={nextRound}
          >
            🥔 다음 라운드!
          </Button>
        </div>
      )}

      {/* 히스토리 */}
      {rounds.length > 0 && phase !== "submitted" && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm">📝 지금까지 만든 질문 ({rounds.length}개)</h3>
          {rounds.map((r, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-orange-500 text-xs font-medium mb-1">주제: {r.topic}</p>
              <p className="text-gray-800 text-sm">{r.question}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
