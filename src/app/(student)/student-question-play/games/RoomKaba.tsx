"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, LogOut, Play, Send } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getLocalizedText,
  getRoomTurnGameText,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";
import { isQuestionGameCommandId } from "@/lib/question-game-room-engine";
import {
  readKabaPublicState,
  type KabaRoomState,
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
  state: KabaRoomState,
  myId: string,
): boolean {
  const ids = room.players.map(({ id }) => id);
  const me = room.players.find(({ id }) => id === myId);
  if (
    game.id !== "kaba" ||
    room.gameId !== "kaba" ||
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
  if (state.phase === "setup") {
    return room.status === "playing" &&
      state.roundTargetPlayerIds.length === 0;
  }
  return room.status === "playing" &&
    Boolean(state.roundId) &&
    sameValues(state.roundTargetPlayerIds, ids) &&
    state.sentencePlan[state.attempts.length] !== undefined;
}

function endMessage(
  reason: KabaRoomState["endReason"],
  text: ReturnType<typeof getRoomTurnGameText>,
): string {
  if (reason === "host") return text.endHost;
  if (reason === "insufficient-players") return text.endInsufficient;
  return text.endCompleted;
}

export default function RoomKaba({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: Props) {
  const locale = resolveQuestionGameLocale(useLocale());
  const text = getRoomTurnGameText(locale);
  const state = readKabaPublicState(room.gameState);
  const valid = state !== null && roomMatchesState(game, room, state, myId);
  const currentPlayerId = state?.turnOrder[state.currentTurnIdx] ?? "";
  const currentPlayerName = state?.playerNames[currentPlayerId] ?? "";
  const prompt = state?.sentencePlan[state.attempts.length];
  const inputContext = state?.phase === "setup"
    ? `${room.playId ?? ""}:setup:${room.hostId}`
    : `${room.playId ?? ""}:${state?.roundId ?? ""}:${currentPlayerId}:${state?.attempts.length ?? -1}:${prompt?.key ?? ""}`;
  const [question, setQuestion] = useState("");
  const retryRef = useRef<{ context: string; value: string } | null>(null);
  const acknowledgementRef = useRef(0);
  const {
    send,
    pendingKind,
    acknowledgementVersion,
  } = useRoomCommandRequest({
    room,
    gameId: "kaba",
    state: valid ? state : null,
    readState: readKabaPublicState,
    onAction,
    lifetimeParts: [currentPlayerId || room.hostId, inputContext],
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

  const questions = state.attempts.map((attempt) => ({
    playerId: attempt.playerId,
    playerName: attempt.playerName,
    question: attempt.question,
  }));
  const scores = room.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    score: state.scores[player.id] ?? 0,
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
          scoreLabel={locale === "en" ? "Correct" : "맞힌 수"}
          scoreUnit=""
          scores={scores}
          questions={questions}
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

  async function prepare() {
    if (!isHost || activeState.phase !== "setup" || requestPending) return;
    await send(
      "kaba-prepare",
      { playId },
      [playId, "kaba-prepare"],
    );
  }

  async function submitQuestion() {
    const value = question.trim();
    if (!value || !isMyTurn || activeState.phase !== "question" || !prompt || requestPending) return;
    retryRef.current = { context: inputContext, value };
    const outcome = await send(
      "kaba-submit-question",
      {
        playId,
        roundId: activeState.roundId,
        locale,
        question: value,
      },
      [playId, activeState.roundId ?? "", prompt.key, value],
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
        subtitle={text.kabaSubtitle}
        onLeave={onLeave}
        leave={text.leave}
        disabled={requestPending}
      />

      {state.phase === "setup" ? (
        <section className="space-y-3 border-b border-border pb-5">
          {isHost ? (
            <Button type="button" onClick={prepare} disabled={requestPending} className="w-full sm:w-auto">
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              {pendingKind === "kaba-prepare" ? text.sending : text.kabaPrepare}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{text.waitingHost}</p>
          )}
        </section>
      ) : (
        <>
          <section className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-4" aria-live="polite">
            <div>
              <p className="text-sm font-semibold">{text.roundProgress(state.round, state.maxRounds, state.completedRounds)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {text.submissionProgress(state.roundSubmittedPlayerIds.length, state.roundTargetPlayerIds.length)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {isMyTurn ? text.currentTurn(currentPlayerName) : text.waitingTurn(currentPlayerName)}
            </p>
          </section>

          {prompt && (
            <section className="space-y-3 border-b border-border pb-5">
              <div className="min-w-0 bg-secondary p-4 rounded-lg">
                <p className="text-xs text-muted-foreground">{text.kabaSentence}</p>
                <p className="mt-1 break-words font-semibold">{getLocalizedText(prompt.text, locale, prompt.key)}</p>
              </div>
              {isMyTurn && (
                <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
                  event.preventDefault();
                  void submitQuestion();
                }}>
                  <div className="min-w-0 flex-1 space-y-2">
                    <label htmlFor="kaba-question-input" className="text-sm font-semibold">
                      {text.kabaQuestionLabel}
                    </label>
                    <Input
                      id="kaba-question-input"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder={text.kabaPlaceholder}
                      maxLength={200}
                    />
                  </div>
                  <Button type="submit" disabled={!question.trim() || requestPending} className="sm:shrink-0">
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                    {pendingKind === "kaba-submit-question" ? text.sending : text.questionSubmit}
                  </Button>
                </form>
              )}
            </section>
          )}
        </>
      )}

      <section className="space-y-3" aria-labelledby="kaba-records-title">
        <h2 id="kaba-records-title" className="text-base font-semibold">{text.sharedRecords}</h2>
        {state.attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{text.noRecords}</p>
        ) : (
          <ol className="space-y-2">
            {state.attempts.map((attempt) => (
              <li key={`${attempt.roundId}:${attempt.playerId}`} className="min-w-0 border border-border bg-card p-3 rounded-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{attempt.round} · {attempt.playerName}</span>
                  <span className={attempt.correct ? "text-primary" : "text-muted-foreground"}>
                    {attempt.correct ? text.correct : text.incorrect}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm">{attempt.question}</p>
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
