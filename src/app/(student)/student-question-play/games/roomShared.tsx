"use client";

import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";
import { useLocale } from "next-intl";
import { getQuestionGameText } from "@/lib/question-game-i18n";

export const PLAYER_COLORS = [
  "#C2410C", "#1D4ED8", "#047857", "#6D28D9",
  "#B91C1C", "#BE185D", "#0F766E", "#A16207",
];

export function playerColorById(room: GameRoom, id: string): string {
  const i = room.players.findIndex((p) => p.id === id);
  return i >= 0
    ? PLAYER_COLORS[i % PLAYER_COLORS.length]
    : "hsl(var(--muted-foreground))";
}

export function RoomHeader({
  game,
  room,
  subtitle,
  onLeave,
  disabled = false,
}: {
  game: BuiltInGame;
  room: GameRoom;
  subtitle?: string;
  onLeave: () => void;
  disabled?: boolean;
}) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onLeave}
        disabled={disabled}
        className="text-muted-foreground hover:text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {text.leave}
      </button>
      <div className="flex-1 rounded-2xl py-3 px-5 text-white flex items-center justify-between"
        style={{ background: game.gradientCss }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{game.emoji}</span>
          <div>
            <p className="font-black">{game.title}</p>
            <p className="text-white text-xs">{subtitle ?? (locale === "en" ? `Room ${room.code}` : `방 ${room.code}`)}</p>
          </div>
        </div>
        <div className="text-white text-right">
          <p className="text-lg font-black">{room.players.length}</p>
          <p className="text-xs">{text.inProgress}</p>
        </div>
      </div>
    </div>
  );
}

export function TurnBar({
  room,
  myId,
  currentId,
}: {
  room: GameRoom;
  myId: string;
  currentId?: string;
}) {
  const text = getQuestionGameText(useLocale());
  return (
    <div className="flex gap-2 flex-wrap">
      {room.players.map((p) => {
        const isCurrent = currentId === p.id;
        return (
          <div key={p.id}
            className={`rounded-xl py-2 px-3 text-center text-sm font-bold transition-all ${
              isCurrent ? "text-white" : "bg-secondary text-secondary-foreground"
            }`}
            style={{
              background: isCurrent ? playerColorById(room, p.id) : undefined,
            }}>
            {p.name}{p.id === myId ? ` (${text.me})` : ""} {isCurrent && "🎮"}
          </div>
        );
      })}
    </div>
  );
}

export function WaitingBanner({ text }: { text: string }) {
  return (
    <div className="bg-secondary rounded-2xl border border-border p-5 text-center">
      <div className="flex items-center justify-center gap-2 text-secondary-foreground">
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">{text}</p>
      </div>
    </div>
  );
}
