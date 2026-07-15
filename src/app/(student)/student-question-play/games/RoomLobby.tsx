"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import { getQuestionGameRule } from "@/lib/question-game-rules";
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
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === myId;
  const { min, max } = getQuestionGameRule(game.id).multiplayer;
  const needsMorePlayers = room.players.length < min;

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
        <button onClick={onLeave} className="text-muted-foreground hover:text-foreground text-sm">{text.leave}</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">{locale === "en" ? "Lobby with friends" : "친구들과 함께하는 대기실"} 🎮</p>
          </div>
        </div>
      </div>

      {/* 방 코드 카드 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-6 text-center space-y-3">
        <p className="text-muted-foreground text-sm font-medium">{locale === "en" ? "Room code" : "방 코드"}</p>
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
          className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {copied ? (locale === "en" ? "✅ Copied!" : "✅ 복사됨!") : (locale === "en" ? "📋 Copy code" : "📋 코드 복사하기")}
        </button>
        <p className="text-muted-foreground text-xs">{locale === "en" ? "Share this code with your friends!" : "친구에게 이 코드를 알려주세요!"}</p>
      </div>

      {/* 참가자 목록 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-foreground">
            👥 {locale === "en" ? "Players" : "참가자"} <span style={{ color: game.accentColor }}>{room.players.length}</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            {locale === "en" ? `Max ${max}` : `최대 ${max}명`}
          </span>
        </div>
        <div className="space-y-2">
          {room.players.map((p, i) => (
            <div key={p.id}
              className="flex items-center gap-3 rounded-xl p-3 transition-all"
              style={{ background: p.id === myId ? `${game.accentColor}10` : "hsl(var(--muted))" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>
                {p.name.charAt(0)}
              </div>
              <span className="font-bold text-foreground flex-1">
                {p.name}
                {p.id === myId && <span className="text-xs text-muted-foreground ml-1">({text.me})</span>}
              </span>
              {p.isHost && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                  style={{ background: game.accentColor }}>
                  👑 {locale === "en" ? "Host" : "방장"}
                </span>
              )}
            </div>
          ))}
          {/* 빈 자리 안내 */}
          {room.players.length < min && (
            <div className="flex items-center gap-3 rounded-xl bg-secondary p-3 border-2 border-dashed border-border">
              <div className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-muted-foreground text-lg">+</div>
              <span className="text-muted-foreground text-sm animate-pulse">{locale === "en" ? "Waiting for friends..." : "친구를 기다리는 중..."}</span>
            </div>
          )}
        </div>
      </div>

      {/* 시작 / 대기 */}
      {isHost ? (
        <div className="space-y-2">
          <Button
            className="w-full py-5 text-xl font-black text-white rounded-2xl"
            style={{ background: game.gradientCss, opacity: !needsMorePlayers && !actionLoading ? 1 : 0.5 }}
            disabled={needsMorePlayers || actionLoading}
            onClick={onStart}>
            {actionLoading ? (locale === "en" ? "Starting..." : "시작하는 중...") : (locale === "en" ? "🚀 Start game!" : "🚀 게임 시작!")}
          </Button>
          {needsMorePlayers && (
            <p className="text-center text-sm text-muted-foreground" role="status">
              {locale === "en"
                ? "At least one friend must join before starting."
                : "친구가 한 명 이상 더 참가해야 시작할 수 있어요"}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-secondary rounded-2xl border border-border p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <span className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">{locale === "en" ? "Waiting for the host to start..." : "방장이 시작하기를 기다리는 중..."}</p>
          </div>
        </div>
      )}
    </div>
  );
}
