"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Home,
  KeyRound,
  Loader2,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoomTurnNotice } from "@/components/question-games/RoomTurnNotice";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
} from "@/lib/question-games-data";
import { activeQuestionGamePlayerIds } from "@/lib/question-game-turn";
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
    actionNotice,
    actionLoading,
    isRestoring,
    connectionState,
    createRoom,
    joinRoom,
    sendAction,
    leaveRoom,
    refreshRoom,
    clearActionNotice,
    clearError,
  } = useRoom(game.id);
  const [view, setView] = useState<"choice" | "join">("choice");
  const [joinCode, setJoinCode] = useState("");
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);
  const previousConnectionStateRef = useRef(connectionState);
  const previousRoomIdentityRef = useRef<string | null>(null);
  const roomIdentity = room ? `${room.code}:${room.createdAt}` : null;

  useEffect(() => {
    if (previousRoomIdentityRef.current !== roomIdentity) {
      previousRoomIdentityRef.current = roomIdentity;
      previousConnectionStateRef.current = connectionState;
      setShowRecoveryNotice(false);
      return;
    }

    const previous = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;
    if (
      room &&
      connectionState === "connected" &&
      (previous === "delayed" || previous === "offline")
    ) {
      setShowRecoveryNotice(true);
    }
  }, [connectionState, room, roomIdentity]);

  useEffect(() => {
    if (!showRecoveryNotice) return;
    const timer = window.setTimeout(() => setShowRecoveryNotice(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [showRecoveryNotice]);

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => clearActionNotice?.(), 5_000);
    return () => window.clearTimeout(timer);
  }, [actionNotice, clearActionNotice]);

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

  const activeErrorAlert = error ? (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-950 shadow-lg dark:border-red-700 dark:bg-red-950 dark:text-red-100"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words text-sm font-semibold">{error}</p>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 text-current hover:bg-red-100 dark:hover:bg-red-900"
        aria-label={t("dismissRoomError")}
        title={t("dismissRoomError")}
        onClick={clearError}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  ) : null;

  const connectionNotice = room && (
    connectionState === "delayed" || connectionState === "offline"
  ) ? (
    <div
      aria-label={t("roomConnectionStatus")}
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      role="status"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        {connectionState === "offline"
          ? t("roomConnectionOffline")
          : t("roomConnectionDelayed")}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={actionLoading}
        onClick={refreshRoom}
      >
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        {t("roomConnectionRetry")}
      </Button>
    </div>
  ) : null;

  const recoveryNotice = room && showRecoveryNotice ? (
    <div
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
      role="status"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="text-sm">{t("roomConnectionRecovered")}</p>
    </div>
  ) : null;

  const replayNotice = room && actionNotice?.kind === "replayed" ? (
    <div
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-3 text-secondary-foreground"
      role="status"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="text-sm">{t("roomActionAlreadyProcessed")}</p>
    </div>
  ) : null;

  const activePlayerIds = room ? activeQuestionGamePlayerIds(room) : [];
  const isMyTurn = activePlayerIds.includes(myId);
  const roomNotices = room && (
    connectionNotice || recoveryNotice || replayNotice || isMyTurn
  ) ? (
    <div className="mb-4 space-y-2">
      {connectionNotice}
      {recoveryNotice}
      {replayNotice}
      <RoomTurnNotice
        active={isMyTurn}
        turnKey={`${roomIdentity}:${room.playId ?? "waiting"}:${myId}`}
      />
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
          {roomNotices}
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
          {roomNotices}
          <RoomComponent
            game={game}
            room={room}
            myId={myId}
            actionLoading={actionLoading}
            onAction={sendAction}
            onLeave={() => { void handleLeaveRoom(); }}
          />
          {activeErrorAlert}
        </>
      );
    }

    return (
      <>
        {roomNotices}
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
