"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

const PLAYER_COLORS = ["#F97316", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6", "#F59E0B"];

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onStart: () => void;
  onLeave: () => void;
}

export default function RoomLobby({ game, room, myId, actionLoading, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === myId;

  function copyCode() {
    navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onLeave} className="text-gray-400 hover:text-gray-600 text-sm">← 나가기</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">친구들과 함께하는 대기실 🎮</p>
          </div>
        </div>
      </div>

      {/* 방 코드 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center space-y-3">
        <p className="text-gray-400 text-sm font-medium">방 코드</p>
        <div className="flex items-center justify-center gap-2">
          {room.code.split("").map((d, i) => (
            <span key={i}
              className="w-12 h-16 rounded-xl flex items-center justify-center text-3xl font-black text-white shadow-sm"
              style={{ background: game.gradientCss }}>
              {d}
            </span>
          ))}
        </div>
        <button
          onClick={copyCode}
          className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          style={{ color: game.accentColor, background: `${game.accentColor}12` }}>
          {copied ? "✅ 복사됨!" : "📋 코드 복사하기"}
        </button>
        <p className="text-gray-400 text-xs">친구에게 이 코드를 알려주세요!</p>
      </div>

      {/* 참가자 목록 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-800">
            👥 참가자 <span style={{ color: game.accentColor }}>{room.players.length}</span>명
          </h2>
          <span className="text-xs text-gray-400">최대 8명</span>
        </div>
        <div className="space-y-2">
          {room.players.map((p, i) => (
            <div key={p.id}
              className="flex items-center gap-3 rounded-xl p-3 transition-all"
              style={{ background: p.id === myId ? `${game.accentColor}10` : "#f9fafb" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>
                {p.name.charAt(0)}
              </div>
              <span className="font-bold text-gray-800 flex-1">
                {p.name}
                {p.id === myId && <span className="text-xs text-gray-400 ml-1">(나)</span>}
              </span>
              {p.isHost && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                  style={{ background: game.accentColor }}>
                  👑 방장
                </span>
              )}
            </div>
          ))}
          {/* 빈 자리 안내 */}
          {room.players.length < 2 && (
            <div className="flex items-center gap-3 rounded-xl p-3 border-2 border-dashed border-gray-200">
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-300 text-lg">+</div>
              <span className="text-gray-400 text-sm animate-pulse">친구를 기다리는 중...</span>
            </div>
          )}
        </div>
      </div>

      {/* 시작 / 대기 */}
      {isHost ? (
        <Button
          className="w-full py-5 text-xl font-black text-white rounded-2xl"
          style={{ background: game.gradientCss, opacity: room.players.length >= 1 && !actionLoading ? 1 : 0.5 }}
          disabled={room.players.length < 1 || actionLoading}
          onClick={onStart}>
          {actionLoading ? "시작하는 중..." : "🚀 게임 시작!"}
        </Button>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">방장이 시작하기를 기다리는 중...</p>
          </div>
        </div>
      )}
    </div>
  );
}
