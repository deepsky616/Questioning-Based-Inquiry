"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("gamePlay");
  const isHost = room.hostId === myId;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <RoomHeader game={game} room={room} onLeave={onLeave} />

      <section
        role="status"
        aria-labelledby="room-compatibility-title"
        className="space-y-5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-50 p-6 text-center"
      >
        <AlertTriangle
          className="mx-auto h-10 w-10 text-amber-700 dark:text-amber-300"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h2
            id="room-compatibility-title"
            className="text-lg font-black text-amber-950 dark:text-amber-50"
          >
            {t("restartWithTheNewRules")}
          </h2>
          <p className="text-sm leading-6 text-amber-800 dark:text-amber-200">
            {t("thisRoomWasStartedWith")}
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
              ? (t("restarting"))
              : (t("restartWithNewRules"))}
          </Button>
        ) : (
          <p className="rounded-xl border border-border bg-card text-card-foreground px-4 py-3 text-sm font-medium">
            {t("waitingForTheHostTo2")}
          </p>
        )}
      </section>
    </div>
  );
}
