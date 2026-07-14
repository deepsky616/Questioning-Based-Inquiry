"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { hasQuestionGameRoomEngine } from "@/lib/question-game-room-engine";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
} from "@/lib/question-games-data";
import { RoomHeader } from "./roomShared";

interface RoomCompatibilityNoticeProps {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

export function shouldShowRoomCompatibilityNotice(room: GameRoom) {
  return (
    room.status === "playing" &&
    room.gameState.stateVersion !== 2 &&
    hasQuestionGameRoomEngine(room.gameId)
  );
}

export default function RoomCompatibilityNotice({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: RoomCompatibilityNoticeProps) {
  const isEnglish = useLocale() === "en";
  const isHost = room.hostId === myId;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <RoomHeader game={game} room={room} onLeave={onLeave} />

      <section
        role="status"
        aria-labelledby="room-compatibility-title"
        className="space-y-5 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center"
      >
        <AlertTriangle
          className="mx-auto h-10 w-10 text-amber-600"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h2
            id="room-compatibility-title"
            className="text-lg font-black text-foreground"
          >
            {isEnglish ? "Restart with the new rules" : "새 규칙으로 다시 시작"}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {isEnglish
              ? "This room was started with an earlier rule set."
              : "이 방은 이전 규칙으로 시작되었습니다."}
          </p>
        </div>

        {isHost ? (
          <Button
            type="button"
            className="w-full gap-2 py-5 font-black text-white"
            style={{ background: game.gradientCss }}
            disabled={actionLoading}
            onClick={() => { void onAction("restart"); }}
          >
            <RefreshCw
              className={`h-4 w-4 ${actionLoading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {actionLoading
              ? (isEnglish ? "Restarting..." : "다시 시작하는 중...")
              : (isEnglish ? "Restart with new rules" : "새 규칙으로 다시 시작")}
          </Button>
        ) : (
          <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-muted-foreground">
            {isEnglish
              ? "Waiting for the host to restart with the new rules."
              : "방장이 새 규칙으로 다시 시작하기를 기다리는 중입니다."}
          </p>
        )}
      </section>
    </div>
  );
}
