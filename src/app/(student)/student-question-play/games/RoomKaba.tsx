"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader, TurnBar, WaitingBanner, playerColorById } from "./roomShared";
import RoomResult from "./RoomResult";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

const SENTENCES = [
  "고양이가 잔다", "개미가 걷는다", "토끼가 뛴다", "꽃이 예쁘다", "사과가 빨갛다",
  "하늘이 파랗다", "비가 온다", "새가 날아간다", "강아지가 짖는다", "물고기가 헤엄친다",
  "아이가 웃는다", "나무가 흔들린다", "별이 빛난다", "바람이 분다", "눈이 내린다",
  "나비가 날개를 편다", "달이 밝다", "파도가 친다", "벌이 꿀을 모은다", "원숭이가 나무에 오른다",
];

function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }
function isQuestionForm(t: string): boolean {
  const s = t.trim();
  return /[?？]/.test(s) || /(나요|인가요|할까요|까요|니요|니까|가요|는지요)\s*$/.test(s);
}

interface KabaEntry { sentence: string; answer: string; playerId: string; playerName: string; correct: boolean }
interface KabaState { sentences: string[]; idx: number; history: KabaEntry[] }

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomKaba({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const initRef = useRef(false);

  const isHost = room.hostId === myId;
  const state = room.gameState as unknown as KabaState;
  const hasState = Array.isArray(state?.sentences) && state.sentences.length > 0;
  const ROUNDS = Math.min(SENTENCES.length, Math.max(6, room.players.length * 3));

  // 방장이 게임 상태 초기화
  useEffect(() => {
    if (isHost && !hasState && !initRef.current && room.status === "playing") {
      initRef.current = true;
      onAction("set-state", {
        state: { sentences: shuffle(SENTENCES).slice(0, ROUNDS), idx: 0, history: [] },
        turnIndex: 0,
      });
    }
  }, [isHost, hasState, room.status, ROUNDS, onAction]);

  if (room.status === "ended" || (hasState && state.idx >= state.sentences.length)) {
    const hist = state?.history ?? [];
    const scores = room.players.map((p) => ({
      playerId: p.id, name: p.name,
      score: hist.filter((h) => h.playerId === p.id && h.correct).length,
    }));
    const questions = hist.filter((h) => h.correct).map((h) => ({ playerName: h.playerName, question: h.answer }));
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel="맞힌 질문" scoreUnit="개"
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

  const current = state.sentences[state.idx];
  const currentPlayer = room.players[room.turnIndex % room.players.length];
  const isMyTurn = currentPlayer?.id === myId;
  const lastEntry = state.history[state.history.length - 1];

  async function submit() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading) return;
    setLocalError(null);
    const correct = isQuestionForm(trimmed);
    const entry: KabaEntry = {
      sentence: current, answer: trimmed, playerId: myId,
      playerName: currentPlayer?.name ?? "나", correct,
    };
    const newIdx = state.idx + 1;
    const ended = newIdx >= state.sentences.length;
    const res = await onAction("update-state", {
      patch: { history: [...state.history, entry], idx: newIdx },
      turnIndex: (room.turnIndex + 1) % room.players.length,
      ...(ended ? { status: "ended" } : {}),
    });
    if (res) setInput("");
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RoomHeader game={game} room={room} subtitle={`${state.idx + 1} / ${state.sentences.length} 문제`} onLeave={onLeave} />
      <TurnBar room={room} myId={myId} currentId={currentPlayer?.id} />

      {/* 진행도 */}
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className="h-2.5 rounded-full transition-all duration-500"
          style={{ background: game.gradientCss, width: `${(state.idx / state.sentences.length) * 100}%` }} />
      </div>

      {/* 직전 결과 */}
      {lastEntry && (
        <div className={`rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${
          lastEntry.correct ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"
        }`}>
          <span>{lastEntry.correct ? "✅" : "🤔"}</span>
          <span className="text-gray-500">{lastEntry.playerName}:</span>
          <span className="font-medium text-gray-700">{lastEntry.answer}</span>
        </div>
      )}

      {/* 문장 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center"
        style={{ background: `${game.accentColor}08` }}>
        <p className="text-xs text-gray-400 font-medium mb-2">이 문장을 질문으로 바꿔요!</p>
        <div className="inline-block bg-white rounded-2xl px-8 py-5 shadow-sm border border-gray-100">
          <p className="text-3xl font-black text-gray-800">{current}</p>
        </div>
        <p className="text-sm text-gray-400 mt-3">예) ~<span className="font-bold text-blue-500">나요?</span> · ~<span className="font-bold text-blue-500">인가요?</span></p>
      </div>

      {/* 현재 차례 안내 */}
      <div className="rounded-xl px-4 py-3 text-center font-bold"
        style={{ background: isMyTurn ? `${game.accentColor}15` : "#f9fafb", color: isMyTurn ? game.accentColor : "#9ca3af" }}>
        {isMyTurn ? "🙋 내 차례! 질문으로 바꿔보세요" : `⏳ ${currentPlayer?.name}님의 차례예요`}
      </div>

      {/* 입력 */}
      {isMyTurn ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          {localError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm">❌ {localError}</div>}
          <input
            type="text"
            className="w-full border-2 rounded-2xl px-5 py-4 text-xl font-bold text-center focus:outline-none"
            style={{ borderColor: "#e5e7eb" }}
            onFocus={(e) => (e.target.style.borderColor = game.accentColor)}
            onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
            placeholder="질문으로 바꿔 써보세요!"
            value={input}
            onChange={(e) => { setInput(e.target.value); setLocalError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            autoFocus
          />
          <Button className="w-full py-4 text-lg font-black text-white rounded-2xl"
            style={{ background: game.gradientCss, opacity: input.trim() && !actionLoading ? 1 : 0.4 }}
            disabled={!input.trim() || actionLoading} onClick={submit}>
            {actionLoading ? "전송 중..." : "✅ 확인하기!"}
          </Button>
        </div>
      ) : (
        <WaitingBanner text={`${currentPlayer?.name}님이 질문을 만드는 중...`} />
      )}

      {/* 기록 */}
      {state.history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2 max-h-40 overflow-y-auto">
          {state.history.map((h, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span>{h.correct ? "✅" : "🤔"}</span>
              <span className="text-xs font-bold" style={{ color: playerColorById(room, h.playerId) }}>{h.playerName}</span>
              <span className="text-gray-400 text-xs">{h.sentence} →</span>
              <span className="text-gray-700 flex-1 truncate">{h.answer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
