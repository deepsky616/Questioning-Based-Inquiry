"use client";

import { useEffect, useRef, useState } from "react";
import { Dices, Flag, LogOut, Send } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getQuestionDiceTypes,
  getRoomTurnGameText,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";
import { isQuestionGameCommandId } from "@/lib/question-game-room-engine";
import {
  readDicePublicState,
  type DiceRoomState,
} from "@/lib/question-game-room-engines/turn-games";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
} from "@/lib/question-games-data";
import RoomResult from "./RoomResult";
import { useRoomCommandRequest } from "./useRoomCommandRequest";

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value));
}

function roomMatchesState(
  game: BuiltInGame,
  room: GameRoom,
  state: DiceRoomState,
  myId: string,
): boolean {
  const ids = room.players.map(({ id }) => id);
  const me = room.players.find(({ id }) => id === myId);
  if (
    game.id !== "dice" ||
    room.gameId !== "dice" ||
    !isQuestionGameCommandId(room.playId) ||
    !me ||
    state.playerNames[myId] !== me.name ||
    new Set(ids).size !== ids.length ||
    !room.players.every(({ id, name }) => state.playerNames[id] === name)
  ) {
    return false;
  }
  if (state.phase === "done") return room.status === "ended";
  if (ids.length < 2 || ids.length > 8) return false;
  return room.status === "playing" &&
    Boolean(state.roundId) &&
    sameValues(state.roundTargetPlayerIds, ids);
}

function endMessage(
  reason: DiceRoomState["endReason"],
  text: ReturnType<typeof getRoomTurnGameText>,
): string {
  if (reason === "host") return text.endHost;
  if (reason === "insufficient-players") return text.endInsufficient;
  return text.endCompleted;
}

export default function RoomDice({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: Props) {
  const locale = resolveQuestionGameLocale(useLocale());
  const text = getRoomTurnGameText(locale);
  const state = readDicePublicState(room.gameState);
  const valid = state !== null && roomMatchesState(game, room, state, myId);
  const currentPlayerId = state?.turnOrder[state.currentTurnIdx] ?? "";
  const currentPlayerName = state?.playerNames[currentPlayerId] ?? "";
  const inputContext = state?.phase === "question"
    ? `${room.playId ?? ""}:${state.roundId ?? ""}:${currentPlayerId}:${state.currentFace ?? 0}`
    : `${room.playId ?? ""}:${state?.roundId ?? ""}:${currentPlayerId}:${state?.phase ?? "invalid"}`;
  const [question, setQuestion] = useState("");
  const retryRef = useRef<{ context: string; value: string } | null>(null);
  const acknowledgementRef = useRef(0);
  const {
    send,
    pendingKind,
    acknowledgementVersion,
  } = useRoomCommandRequest({
    room,
    gameId: "dice",
    state: valid ? state : null,
    readState: readDicePublicState,
    onAction,
    lifetimeParts: [currentPlayerId, inputContext],
  });
  const requestPending = actionLoading || pendingKind !== null;

  useEffect(() => {
    setQuestion("");
    retryRef.current = null;
  }, [inputContext]);

  useEffect(() => {
    if (acknowledgementRef.current === acknowledgementVersion) return;
    acknowledgementRef.current = acknowledgementVersion;
    const retry = retryRef.current;
    if (!retry || retry.context !== inputContext) return;
    setQuestion((current) => current.trim() === retry.value ? "" : current);
    retryRef.current = null;
  }, [acknowledgementVersion, inputContext]);

  if (!valid || !state || !room.playId) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 text-foreground">
        <GameHeader
          game={game}
          subtitle={text.safeState}
          onLeave={onLeave}
          leave={text.leave}
          disabled={requestPending}
        />
        <p role="status" className="border border-border bg-card p-4 text-sm text-muted-foreground rounded-lg">
          {text.safeState}
        </p>
      </div>
    );
  }

  const scores = room.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    score: state.questions.filter(({ playerId }) => playerId === player.id).length,
  }));
  if (state.phase === "done") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-foreground">
        <p role="status" className="border border-border bg-secondary p-3 text-center text-sm font-semibold rounded-lg">
          {endMessage(state.endReason, text)}
        </p>
        <RoomResult
          game={game}
          room={room}
          myId={myId}
          scoreLabel={locale === "en" ? "Questions" : "질문 수"}
          scoreUnit=""
          scores={scores}
          questions={state.questions}
          onAction={onAction}
          onLeave={onLeave}
        />
      </div>
    );
  }

  const isMyTurn = currentPlayerId === myId;
  const activeState = state;
  const playId = room.playId;
  const dieType = state.currentFace === null
    ? null
    : getQuestionDiceTypes(locale).find(({ face }) => face === state.currentFace);

  async function roll() {
    if (!isMyTurn || activeState.phase !== "roll" || requestPending) return;
    await send(
      "dice-roll",
      { playId, roundId: activeState.roundId },
      [playId, activeState.roundId ?? "", currentPlayerId],
    );
  }

  async function submitQuestion() {
    const value = question.trim();
    if (!value || !isMyTurn || activeState.phase !== "question" || requestPending) return;
    retryRef.current = { context: inputContext, value };
    const outcome = await send(
      "dice-submit-question",
      {
        playId,
        roundId: activeState.roundId,
        locale,
        question: value,
      },
      [playId, activeState.roundId ?? "", activeState.currentFace ?? 0, value],
    );
    if (outcome === "confirmed") {
      setQuestion((current) => current.trim() === value ? "" : current);
      retryRef.current = null;
    } else if (outcome === "stale") {
      retryRef.current = null;
    }
  }

  async function endEarly() {
    if (requestPending || !window.confirm(text.earlyEndConfirm)) return;
    await send(
      "end-game-early",
      { playId, roundId: activeState.roundId },
      [playId, activeState.roundId ?? "", "end-game-early"],
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-foreground">
      <GameHeader
        game={game}
        subtitle={text.diceSubtitle}
        onLeave={onLeave}
        leave={text.leave}
        disabled={requestPending}
      />

      <section className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-4" aria-live="polite">
        <div>
          <p className="text-sm font-semibold">{text.roundProgress(state.round, state.maxRounds, state.completedRounds)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {text.submissionProgress(state.roundSubmittedPlayerIds.length, state.roundTargetPlayerIds.length)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{isMyTurn ? text.currentTurn(currentPlayerName) : text.waitingTurn(currentPlayerName)}</p>
      </section>

      <section className="space-y-4 border-b border-border pb-5" aria-label={locale === "en" ? "Current turn" : "현재 차례"}>
        {state.phase === "roll" && isMyTurn && (
          <Button type="button" onClick={roll} disabled={requestPending} className="w-full sm:w-auto">
            <Dices className="mr-2 h-4 w-4" aria-hidden="true" />
            {pendingKind === "dice-roll" ? text.sending : text.diceRoll}
          </Button>
        )}
        {state.phase === "question" && state.currentFace !== null && (
          <div className="min-w-0 space-y-2 bg-secondary p-4 rounded-lg">
            <p className="font-semibold">{text.diceFace(state.currentFace)}</p>
            {dieType && <p className="break-words text-sm text-muted-foreground">{dieType.type} · {dieType.shortDesc}</p>}
          </div>
        )}
        {state.phase === "question" && isMyTurn && (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            void submitQuestion();
          }}>
            <label htmlFor="dice-question-input" className="text-sm font-semibold">
              {text.diceQuestionLabel}
            </label>
            <Textarea
              id="dice-question-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={text.diceQuestionPlaceholder}
              maxLength={200}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" disabled={!question.trim() || requestPending} className="w-full sm:w-auto">
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              {pendingKind === "dice-submit-question" ? text.sending : text.questionSubmit}
            </Button>
          </form>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="dice-records-title">
        <h2 id="dice-records-title" className="text-base font-semibold">{text.sharedRecords}</h2>
        {state.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{text.noRecords}</p>
        ) : (
          <ol className="space-y-2">
            {state.questions.map((record) => (
              <li key={`${record.roundId}:${record.playerId}`} className="min-w-0 border border-border bg-card p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{record.round} · {record.playerName} · {text.diceFace(record.face)}</p>
                <p className="mt-1 break-words text-sm">{record.question}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {room.hostId === myId && state.completedRounds >= 1 && (
        <Button type="button" variant="outline" onClick={endEarly} disabled={requestPending} className="border-border">
          <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
          {text.earlyEnd}
        </Button>
      )}
    </div>
  );
}

function GameHeader({
  game,
  subtitle,
  leave,
  onLeave,
  disabled,
}: {
  game: BuiltInGame;
  subtitle: string;
  leave: string;
  onLeave: () => void;
  disabled: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold">{game.emoji} {game.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onLeave} disabled={disabled}>
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        {leave}
      </Button>
    </header>
  );
}
