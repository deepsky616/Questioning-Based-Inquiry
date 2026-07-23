"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import { getQuestionGameRule } from "@/lib/question-game-rules";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";

const PLAYER_COLORS = ["#C2410C", "#1D4ED8", "#047857", "#6D28D9", "#B91C1C", "#BE185D", "#0F766E", "#A16207"];

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
  const t = useTranslations("gamePlay");
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
            <p className="text-white text-sm">{t("lobbyWithFriends")} 🎮</p>
          </div>
        </div>
        <LearningSoundToggle />
      </div>

      {/* 방 코드 카드 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-6 text-center space-y-3">
        <p className="text-muted-foreground text-sm font-medium">{t("roomCode")}</p>
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
          {copied ? (t("copied")) : (t("copyCode"))}
        </button>
        <p className="text-muted-foreground text-xs">{t("shareThisCodeWithYour")}</p>
      </div>

      {/* 참가자 목록 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-foreground">
            👥 {t("players")} <span className="text-foreground">{room.players.length}</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("maxMax", { max: max })}
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
                  👑 {t("host")}
                </span>
              )}
            </div>
          ))}
          {/* 빈 자리 안내 */}
          {room.players.length < min && (
            <div className="flex items-center gap-3 rounded-xl bg-secondary p-3 border-2 border-dashed border-border">
              <div className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-muted-foreground text-lg">+</div>
              <span className="text-secondary-foreground text-sm">{t("waitingForFriends")}</span>
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
            {actionLoading ? (t("starting")) : (t("startGame"))}
          </Button>
          {needsMorePlayers && (
            <p className="text-center text-sm text-muted-foreground" role="status">
              {t("atLeastOneFriendMust")}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-secondary rounded-2xl border border-border p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-secondary-foreground">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">{t("waitingForTheHostTo")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
