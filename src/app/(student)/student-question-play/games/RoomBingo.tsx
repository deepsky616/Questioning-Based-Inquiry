"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader } from "./roomShared";
import RoomResult from "./RoomResult";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

const ALL_TYPES = [
  "사실질문", "개념질문", "논쟁질문", "상상질문", "비교질문",
  "이유질문", "예측질문", "관계질문", "열린질문",
];
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }

interface Winner { playerId: string; playerName: string }
interface BingoState { calledTypes: string[]; winners: Winner[] }

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomBingo({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  // 내 빙고판 (로컬 셔플, 마운트 시 고정)
  const [board] = useState<string[]>(() => shuffle(ALL_TYPES));

  const isHost = room.hostId === myId;
  const state = (room.gameState ?? {}) as unknown as BingoState;
  const calledTypes = state.calledTypes ?? [];
  const winners = state.winners ?? [];

  const marks = board.map((t) => calledTypes.includes(t));
  const bingoLines = LINES.filter((l) => l.every((i) => marks[i]));
  const hasBingo = bingoLines.length > 0;
  const alreadyWon = winners.some((w) => w.playerId === myId);
  const isBingoCell = (i: number) => bingoLines.some((l) => l.includes(i));

  function callNext() {
    const remaining = ALL_TYPES.filter((t) => !calledTypes.includes(t));
    if (remaining.length === 0) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    onAction("update-state", { patch: { calledTypes: [...calledTypes, pick] } });
  }

  function declareBingo() {
    if (alreadyWon) return;
    const me = room.players.find((p) => p.id === myId);
    onAction("update-state", {
      patch: { winners: [...winners, { playerId: myId, playerName: me?.name ?? "나" }] },
    });
  }

  if (room.status === "ended") {
    // 빙고 완성 순서가 빠를수록 높은 점수
    const scores = room.players.map((p) => {
      const rank = winners.findIndex((w) => w.playerId === p.id);
      return { playerId: p.id, name: p.name, score: rank >= 0 ? winners.length - rank : 0 };
    });
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel="빙고 점수" scoreUnit="점"
        scores={scores} questions={[]}
        onAction={onAction} onLeave={onLeave} />
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RoomHeader game={game} room={room} subtitle={`호명 ${calledTypes.length}/9`} onLeave={onLeave} />

      {/* 최근 호명 */}
      {calledTypes.length > 0 && (
        <div className="bg-white rounded-2xl border-2 p-4 flex items-center justify-between"
          style={{ borderColor: game.accentColor }}>
          <div>
            <p className="text-xs text-gray-400 font-medium">방금 호명된 유형</p>
            <p className="text-2xl font-black" style={{ color: game.accentColor }}>
              {calledTypes[calledTypes.length - 1]}
            </p>
          </div>
          <p className="text-lg font-bold text-gray-500">{calledTypes.length} / 9</p>
        </div>
      )}

      {/* 우승자 알림 */}
      {winners.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-yellow-600 font-bold text-sm">
            🎉 {winners.map((w) => w.playerName).join(", ")} 빙고 완성!
          </p>
        </div>
      )}

      {/* 빙고판 */}
      <div className="grid grid-cols-3 gap-2.5">
        {board.map((type, i) => {
          const marked = marks[i];
          const bingo = isBingoCell(i);
          return (
            <div key={i}
              className="rounded-xl border-2 overflow-hidden transition-all duration-300 aspect-square flex flex-col items-center justify-center text-center p-1"
              style={{
                borderColor: bingo ? "#f59e0b" : marked ? game.accentColor : "#e5e7eb",
                background: bingo ? "#fef3c7" : marked ? `${game.accentColor}15` : "white",
                transform: bingo ? "scale(1.04)" : "scale(1)",
              }}>
              <span className="text-sm font-bold" style={{ color: marked ? game.accentColor : "#9ca3af" }}>
                {type}
              </span>
              {marked && <span className="text-lg mt-1">{bingo ? "⭐" : "✓"}</span>}
            </div>
          );
        })}
      </div>

      {/* 빙고 선언 버튼 */}
      {hasBingo && !alreadyWon && (
        <Button className="w-full py-4 text-xl font-black text-white rounded-2xl animate-pulse"
          style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
          onClick={declareBingo}>
          🎉 빙고! 외치기
        </Button>
      )}
      {alreadyWon && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 text-center text-green-600 font-bold">
          ✅ 빙고 완성! 멋져요!
        </div>
      )}

      {/* 방장: 호명 진행 */}
      {isHost ? (
        <div className="flex gap-2">
          <Button className="flex-1 py-3 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }}
            disabled={calledTypes.length >= 9 || actionLoading}
            onClick={callNext}>
            {calledTypes.length >= 9 ? "모두 호명됨" : "📢 다음 호명!"}
          </Button>
          <Button variant="outline" className="rounded-xl px-4 text-gray-500"
            onClick={() => onAction("update-state", { patch: {}, status: "ended" })}>
            마치기
          </Button>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-3 text-center text-gray-500 text-sm">
          방장이 유형을 호명하면 내 판에서 자동으로 표시돼요!
        </div>
      )}

      {/* 호명 기록 */}
      {calledTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {calledTypes.map((c, i) => (
            <span key={i} className="text-xs text-white px-2 py-0.5 rounded-full font-medium"
              style={{ background: game.accentColor }}>{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}
