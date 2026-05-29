"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader, WaitingBanner, playerColorById } from "./roomShared";
import RoomResult from "./RoomResult";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

const TOPICS = [
  "우리 학교에서 좋아하는 장소", "오늘 배운 것 중 신기한 것", "자연에서 궁금한 것",
  "미래의 기술", "동물의 세계", "우주와 별", "좋아하는 계절", "책 속 궁금한 것",
  "음식과 요리", "환경 보호", "꿈과 목표", "친구 사이에 중요한 것",
];

interface PotatoRound { topic: string; question: string; playerId: string; playerName: string }
interface PotatoState {
  phase: "ready" | "running" | "caught" | "done";
  victimId: string;
  topic: string;
  rounds: PotatoRound[];
}

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomHotPotato({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const [input, setInput] = useState("");
  const [potatoAngle, setPotatoAngle] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const initRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isHost = room.hostId === myId;
  const state = room.gameState as unknown as PotatoState;
  const hasState = state && typeof state.phase === "string";

  // 방장 초기화
  useEffect(() => {
    if (isHost && !hasState && !initRef.current && room.status === "playing") {
      initRef.current = true;
      onAction("set-state", { state: { phase: "ready", victimId: "", topic: "", rounds: [] } });
    }
  }, [isHost, hasState, room.status, onAction]);

  // 감자 회전 애니메이션 (running 중 전원)
  useEffect(() => {
    if (hasState && state.phase === "running") {
      animRef.current = setInterval(() => setPotatoAngle((a) => a + 18), 50);
    } else if (animRef.current) {
      clearInterval(animRef.current);
      animRef.current = null;
    }
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null; } };
  }, [hasState, state?.phase]);

  // 방장: running 시작되면 랜덤 시간 후 victim 선정
  useEffect(() => {
    if (isHost && hasState && state.phase === "running") {
      const ms = 4000 + Math.floor(Math.random() * 8000); // 4~12초
      timerRef.current = setTimeout(() => {
        const victim = room.players[Math.floor(Math.random() * room.players.length)];
        const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
        onAction("update-state", { patch: { phase: "caught", victimId: victim.id, topic } });
      }, ms);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [isHost, hasState, state?.phase, room.players, onAction]);

  // 카운트다운 시각 효과 (대략)
  useEffect(() => {
    if (hasState && state.phase === "running") {
      setCountdown(0);
      const iv = setInterval(() => setCountdown((c) => c + 1), 1000);
      return () => clearInterval(iv);
    }
  }, [hasState, state?.phase]);

  if (room.status === "ended" || (hasState && state.phase === "done")) {
    const rounds = state?.rounds ?? [];
    const scores = room.players.map((p) => ({
      playerId: p.id, name: p.name,
      score: rounds.filter((r) => r.playerId === p.id).length,
    }));
    const questions = rounds.map((r) => ({ playerName: r.playerName, question: r.question }));
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel="만든 질문" scoreUnit="개"
        scores={scores} questions={questions}
        onAction={onAction} onLeave={onLeave} />
    );
  }

  if (!hasState) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="준비 중..." onLeave={onLeave} />
        <WaitingBanner text="게임을 준비하는 중..." />
      </div>
    );
  }

  const amVictim = state.victimId === myId;
  const victimPlayer = room.players.find((p) => p.id === state.victimId);

  async function submitQuestion() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading) return;
    const round: PotatoRound = {
      topic: state.topic, question: trimmed, playerId: myId,
      playerName: room.players.find((p) => p.id === myId)?.name ?? "나",
    };
    const res = await onAction("update-state", {
      patch: { phase: "ready", victimId: "", topic: "", rounds: [...state.rounds, round] },
    });
    if (res) setInput("");
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RoomHeader game={game} room={room} subtitle={`${state.rounds.length}라운드 완료`} onLeave={onLeave} />

      {/* 대기 (ready) */}
      {state.phase === "ready" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-5">
          <div className="text-7xl">🥔</div>
          <p className="text-gray-600 text-center text-sm">
            감자 돌리기를 시작하면 음악이 멈출 때<br />감자를 든 사람이 질문을 만들어요!
          </p>
          {isHost ? (
            <Button className="w-full py-5 text-xl font-black text-white rounded-2xl"
              style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
              disabled={actionLoading}
              onClick={() => onAction("update-state", { patch: { phase: "running" } })}>
              🔥 감자 돌리기 시작!
            </Button>
          ) : (
            <WaitingBanner text="방장이 감자를 돌리기를 기다려요..." />
          )}
        </div>
      )}

      {/* 진행 (running) */}
      {state.phase === "running" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-5">
          <div className="text-9xl select-none"
            style={{ transform: `rotate(${potatoAngle}deg)`, transition: "transform 0.05s linear" }}>🥔</div>
          <p className="text-xl font-black text-gray-700 animate-pulse">감자가 돌아가고 있어요!</p>
          <p className="text-gray-400 text-sm">⚡ 곧 누군가 감자를 들게 돼요... ({countdown}초)</p>
        </div>
      )}

      {/* 잡힘 (caught) */}
      {state.phase === "caught" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 p-8 flex flex-col items-center gap-3">
            <div className="text-6xl animate-bounce">🥔</div>
            <div className="text-white font-black text-lg px-6 py-2 rounded-full"
              style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}>
              {amVictim ? "내가 잡혔어요! 🔥" : `${victimPlayer?.name}님이 잡혔어요! 🔥`}
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 text-center">
              <p className="text-orange-600 text-xs font-medium mb-1">📌 주제</p>
              <p className="text-gray-800 font-bold text-lg">{state.topic}</p>
            </div>
          </div>

          {amVictim ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
              <textarea
                className="w-full border-2 border-orange-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
                placeholder="주제에 대한 질문을 만들어보세요..."
                value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
              <Button className="w-full font-bold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)", opacity: input.trim() && !actionLoading ? 1 : 0.5 }}
                disabled={!input.trim() || actionLoading} onClick={submitQuestion}>
                {actionLoading ? "전송 중..." : "질문 제출하기 🎉"}
              </Button>
            </div>
          ) : (
            <WaitingBanner text={`${victimPlayer?.name}님이 질문을 만드는 중...`} />
          )}
        </div>
      )}

      {/* 기록 */}
      {state.rounds.length > 0 && state.phase === "ready" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2 max-h-40 overflow-y-auto">
          {state.rounds.map((r, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs" style={{ color: playerColorById(room, r.playerId) }}>{r.playerName} · {r.topic}</p>
              <p className="text-gray-700 text-sm">{r.question}</p>
            </div>
          ))}
        </div>
      )}

      {/* 방장 종료 */}
      {isHost && state.phase === "ready" && state.rounds.length >= 1 && (
        <Button variant="outline" className="w-full rounded-xl text-gray-500"
          onClick={() => onAction("update-state", { patch: { phase: "done" }, status: "ended" })}>
          🏁 게임 마치기
        </Button>
      )}
    </div>
  );
}
