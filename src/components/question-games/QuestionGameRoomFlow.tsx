"use client";

import { useState } from "react";
import { ArrowLeft, Home, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
} from "@/lib/question-games-data";
import RoomCompatibilityNotice, {
  shouldShowRoomCompatibilityNotice,
} from "@/app/(student)/student-question-play/games/RoomCompatibilityNotice";
import RoomDice from "@/app/(student)/student-question-play/games/RoomDice";
import RoomKaba from "@/app/(student)/student-question-play/games/RoomKaba";
import RoomLadder from "@/app/(student)/student-question-play/games/RoomLadder";
import RoomLobby from "@/app/(student)/student-question-play/games/RoomLobby";
import RoomMemory from "@/app/(student)/student-question-play/games/RoomMemory";
import RoomMysteryBox from "@/app/(student)/student-question-play/games/RoomMysteryBox";
import RoomRelay from "@/app/(student)/student-question-play/games/RoomRelay";
import RoomStoryDice from "@/app/(student)/student-question-play/games/RoomStoryDice";
import { useRoom } from "@/app/(student)/student-question-play/games/useRoom";

type RoomGameComponent = React.ComponentType<{
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}>;

const ROOM_GAME_MAP: Record<string, RoomGameComponent> = {
  memory: RoomMemory,
  "story-dice": RoomStoryDice,
  dice: RoomDice,
  ladder: RoomLadder,
  relay: RoomRelay,
  "mystery-box": RoomMysteryBox,
  kaba: RoomKaba,
};

export interface QuestionGameRoomFlowProps {
  game: BuiltInGame;
  myId: string;
  allowJoin: boolean;
  onExit: () => void;
}

export function QuestionGameRoomFlow({
  game,
  myId,
  allowJoin,
  onExit,
}: QuestionGameRoomFlowProps) {
  const t = useTranslations("gamePlay");
  const {
    room,
    error,
    actionLoading,
    isRestoring,
    createRoom,
    joinRoom,
    sendAction,
    leaveRoom,
  } = useRoom(game.id);
  const [view, setView] = useState<"choice" | "join">("choice");
  const [joinCode, setJoinCode] = useState("");

  async function handleLeaveRoom() {
    if (!(await leaveRoom())) return;
    setJoinCode("");
    if (allowJoin) setView("choice");
    else onExit();
  }

  async function handleJoinRoom() {
    if (!allowJoin || joinCode.length !== 4) return;
    await joinRoom(joinCode);
  }

  const errorAlert = error ? (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 px-4 py-3 text-sm"
    >
      {error}
    </div>
  ) : null;

  if (isRestoring) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto flex min-h-48 max-w-lg flex-col items-center justify-center gap-3 border-y border-border py-10 text-center text-muted-foreground"
      >
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium">{t("restoringRoom")}</p>
      </div>
    );
  }

  if (room) {
    if (room.status === "waiting") {
      return (
        <>
          {errorAlert}
          <RoomLobby
            game={game}
            room={room}
            myId={myId}
            actionLoading={actionLoading}
            onStart={() => { void sendAction("start"); }}
            onLeave={() => { void handleLeaveRoom(); }}
          />
        </>
      );
    }

    const RoomComponent = shouldShowRoomCompatibilityNotice(room)
      ? RoomCompatibilityNotice
      : ROOM_GAME_MAP[game.id];
    if (RoomComponent) {
      return (
        <>
          {errorAlert}
          <RoomComponent
            game={game}
            room={room}
            myId={myId}
            actionLoading={actionLoading}
            onAction={sendAction}
            onLeave={() => { void handleLeaveRoom(); }}
          />
        </>
      );
    }

    return (
      <>
        {errorAlert}
        <div className="mx-auto max-w-lg border-y border-border py-10 text-center text-foreground">
          <p className="font-semibold">{t("notFound")}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => { void handleLeaveRoom(); }}
          >
            {t("backToList")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-foreground">
      <header className="flex items-start gap-3 border-b border-border pb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("back")}
          onClick={view === "join" ? () => {
            setJoinCode("");
            setView("choice");
          } : onExit}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-bold">{game.emoji} {game.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("playWithFriends")}</p>
        </div>
      </header>

      {errorAlert}

      {view === "choice" ? (
        <div className="grid gap-3">
          <button
            type="button"
            disabled={actionLoading}
            className="flex min-h-24 items-center gap-4 rounded-lg border border-border bg-card p-4 text-left text-card-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            onClick={() => { void createRoom(game.id); }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Home className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{t("createRoomTitle")}</span>
              <span className="mt-1 block break-words text-sm text-muted-foreground">{t("createRoomDesc")}</span>
            </span>
          </button>

          {allowJoin && (
            <button
              type="button"
              className="flex min-h-24 items-center gap-4 rounded-lg border border-border bg-card p-4 text-left text-card-foreground transition-colors hover:bg-secondary"
              onClick={() => setView("join")}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{t("joinRoomTitle")}</span>
                <span className="mt-1 block break-words text-sm text-muted-foreground">{t("joinRoomDesc")}</span>
              </span>
            </button>
          )}
        </div>
      ) : (
        <form
          className="space-y-4 border-y border-border py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleJoinRoom();
          }}
        >
          <label htmlFor="question-game-room-code" className="text-sm font-semibold">
            {t("joinCodeDesc")}
          </label>
          <Input
            id="question-game-room-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={joinCode}
            onChange={(event) => setJoinCode(
              event.target.value.replace(/[^0-9]/g, "").slice(0, 4),
            )}
            className="h-16 text-center text-3xl font-bold"
            autoFocus
          />
          <Button
            type="submit"
            disabled={joinCode.length !== 4 || actionLoading}
            className="w-full"
          >
            {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {actionLoading ? t("joiningRoom") : t("joinRoomButton")}
          </Button>
        </form>
      )}

      {actionLoading && view === "choice" && (
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("creatingRoom")}
        </p>
      )}
    </div>
  );
}
