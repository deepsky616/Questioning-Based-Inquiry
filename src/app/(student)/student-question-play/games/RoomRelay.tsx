"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, LogOut, Play, Send } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getRoomTurnGameText,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";
import { isQuestionGameCommandId } from "@/lib/question-game-room-engine";
import {
  readRelayPublicState,
  type RelayRoomState,
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

function chainMatches(room: GameRoom, state: RelayRoomState): boolean {
  return room.topic === state.topic &&
    room.chain.length === state.questions.length &&
    room.chain.every((item, index) => {
      const record = state.questions[index];
      return record !== undefined &&
        item.question === record.question &&
        item.playerId === record.playerId &&
        item.playerName === record.playerName &&
        item.round === record.round &&
        item.roundId === record.roundId;
    });
}

function roomMatchesState(
  game: BuiltInGame,
  room: GameRoom,
  state: RelayRoomState,
  myId: string,
): boolean {
  const ids = room.players.map(({ id }) => id);
  const me = room.players.find(({ id }) => id === myId);
  if (
    game.id !== "relay" ||
    room.gameId !== "relay" ||
    !isQuestionGameCommandId(room.playId) ||
    !me ||
    state.playerNames[myId] !== me.name ||
    new Set(ids).size !== ids.length ||
    !room.players.every(({ id, name }) => state.playerNames[id] === name) ||
    !chainMatches(room, state)
  ) {
    return false;
  }
  if (state.phase === "done") return room.status === "ended";
  if (ids.length < 2 || ids.length > 8) return false;
  if (state.phase === "setup") {
    return room.status === "playing" &&
      state.roundTargetPlayerIds.length === 0;
  }
  return room.status === "playing" &&
    Boolean(state.roundId) &&
    sameValues(state.roundTargetPlayerIds, ids);
}

function endMessage(
  reason: RelayRoomState["endReason"],
  text: ReturnType<typeof getRoomTurnGameText>,
): string {
  if (reason === "host") return text.endHost;
  if (reason === "insufficient-players") return text.endInsufficient;
  return text.endCompleted;
}

export default function RoomRelay({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: Props) {
  const locale = resolveQuestionGameLocale(useLocale());
  const text = getRoomTurnGameText(locale);
  const state = readRelayPublicState(room.gameState);
  const valid = state !== null && roomMatchesState(game, room, state, myId);
  const currentPlayerId = state?.turnOrder[state.currentTurnIdx] ?? "";
  const currentPlayerName = state?.playerNames[currentPlayerId] ?? "";
  const lastQuestion = state?.questions.at(-1)?.question ?? "";
  const inputContext = state?.phase === "setup"
    ? `${room.playId ?? ""}:setup:${room.hostId}`
    : `${room.playId ?? ""}:${state?.roundId ?? ""}:${currentPlayerId}:${lastQuestion}`;
  const [topic, setTopic] = useState("");
  const [question, setQuestion] = useState("");
  const retryRef = useRef<{
    context: string;
    field: "topic" | "question";
    value: string;
  } | null>(null);
  const acknowledgementRef = useRef(0);
  const {
    send,
    pendingKind,
    acknowledgementVersion,
  } = useRoomCommandRequest({
    room,
    gameId: "relay",
    state: valid ? state : null,
    readState: readRelayPublicState,
    onAction,
    lifetimeParts: [currentPlayerId || room.hostId, inputContext],
  });
  const requestPending = actionLoading || pendingKind !== null;

  useEffect(() => {
    setTopic("");
    setQuestion("");
    retryRef.current = null;
  }, [inputContext]);

  useEffect(() => {
    if (acknowledgementRef.current === acknowledgementVersion) return;
    acknowledgementRef.current = acknowledgementVersion;
    const retry = retryRef.current;
    if (!retry || retry.context !== inputContext) return;
    if (retry.field === "topic") {
      setTopic((current) => current.trim() === retry.value ? "" : current);
    } else {
      setQuestion((current) => current.trim() === retry.value ? "" : current);
    }
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
          actionLoading={actionLoading}
          onAction={onAction}
          onLeave={onLeave}
        />
      </div>
    );
  }

  const isHost = room.hostId === myId;
  const isMyTurn = currentPlayerId === myId;
  const activeState = state;
  const playId = room.playId;

  async function submitTopic() {
    const value = topic.trim();
    if (!value || !isHost || activeState.phase !== "setup" || requestPending) return;
    retryRef.current = { context: inputContext, field: "topic", value };
    const outcome = await send(
      "relay-set-topic",
      { playId, topic: value },
      [playId, value],
    );
    if (outcome === "confirmed") {
      setTopic((current) => current.trim() === value ? "" : current);
      retryRef.current = null;
    } else if (outcome === "stale") {
      retryRef.current = null;
    }
  }

  async function submitQuestion() {
    const value = question.trim();
    if (!value || !isMyTurn || activeState.phase !== "question" || requestPending) return;
    retryRef.current = { context: inputContext, field: "question", value };
    const outcome = await send(
      "relay-submit-question",
      {
        playId,
        roundId: activeState.roundId,
        locale,
        question: value,
      },
      [playId, activeState.roundId ?? "", lastQuestion, value],
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
        subtitle={text.relaySubtitle}
        onLeave={onLeave}
        leave={text.leave}
        disabled={requestPending}
      />

      {state.phase === "setup" ? (
        <section className="space-y-3 border-b border-border pb-5">
          {isHost ? (
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              void submitTopic();
            }}>
              <label htmlFor="relay-topic" className="text-sm font-semibold">{text.relayTopicLabel}</label>
              <Input
                id="relay-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={text.relayTopicPlaceholder}
                maxLength={80}
              />
              <Button type="submit" disabled={!topic.trim() || requestPending} className="w-full sm:w-auto">
                <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                {pendingKind === "relay-set-topic" ? text.sending : text.relayStart}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{text.waitingHost}</p>
          )}
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{text.relayTopicLabel}</p>
              <p className="break-words font-semibold">{state.topic}</p>
            </div>
            <div className="min-w-0 text-left sm:text-right" aria-live="polite">
              <p className="text-sm font-semibold">{text.roundProgress(state.round, state.maxRounds, state.completedRounds)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {text.submissionProgress(state.roundSubmittedPlayerIds.length, state.roundTargetPlayerIds.length)}
              </p>
              <p className="text-sm text-muted-foreground">
                {isMyTurn ? text.currentTurn(currentPlayerName) : text.waitingTurn(currentPlayerName)}
              </p>
            </div>
          </section>

          {isMyTurn && (
            <form className="space-y-3 border-b border-border pb-5" onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion();
            }}>
              <label htmlFor="relay-question-input" className="text-sm font-semibold">
                {text.relayQuestionLabel}
              </label>
              <Textarea
                id="relay-question-input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={text.relayQuestionPlaceholder}
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
                {pendingKind === "relay-submit-question" ? text.sending : text.questionSubmit}
              </Button>
            </form>
          )}
        </>
      )}

      <section className="space-y-3" aria-labelledby="relay-records-title">
        <h2 id="relay-records-title" className="text-base font-semibold">{text.sharedRecords}</h2>
        {state.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{text.noRecords}</p>
        ) : (
          <ol className="space-y-2">
            {state.questions.map((record) => (
              <li key={`${record.roundId}:${record.playerId}`} className="min-w-0 border border-border bg-card p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{record.round} · {record.playerName}</p>
                <p className="mt-1 break-words text-sm">{record.question}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {isHost && state.completedRounds >= 1 && (
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
