"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Dices, Flag, LogOut, Play, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getLocalizedText,
  getRoomTurnGameText,
  getStoryDiceCategoryLabel,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";
import { isQuestionGameCommandId } from "@/lib/question-game-room-engine";
import {
  readStoryDicePublicState,
  type StoryDiceRoomState,
} from "@/lib/question-game-room-engines/turn-games";
import type { DiceCategory } from "@/lib/story-dice-data";
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

const WORD_CATEGORIES: DiceCategory[] = ["protagonist", "place", "event"];

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value));
}

function roomMatchesState(
  game: BuiltInGame,
  room: GameRoom,
  state: StoryDiceRoomState,
  myId: string,
): boolean {
  const ids = room.players.map(({ id }) => id);
  const me = room.players.find(({ id }) => id === myId);
  if (
    game.id !== "story-dice" ||
    room.gameId !== "story-dice" ||
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
  const expectedTargets = ids.filter((id) => id !== state.taggerId);
  return room.status === "playing" &&
    ids.includes(state.taggerId) &&
    Boolean(state.roundId) &&
    sameValues(state.roundTargetPlayerIds, expectedTargets);
}

function endMessage(
  reason: StoryDiceRoomState["endReason"],
  text: ReturnType<typeof getRoomTurnGameText>,
): string {
  if (reason === "host") return text.endHost;
  if (reason === "insufficient-players") return text.endInsufficient;
  return text.endCompleted;
}

export default function RoomStoryDice({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: Props) {
  const locale = resolveQuestionGameLocale(useLocale());
  const t = useTranslations("gamePlay");
  const text = getRoomTurnGameText(locale);
  const state = readStoryDicePublicState(room.gameState);
  const valid = state !== null && roomMatchesState(game, room, state, myId);
  const currentQuestionerId = state?.turnOrder[state.currentTurnIdx] ?? "";
  const actorId = state?.phase === "setup"
    ? room.hostId
    : state?.phase === "roll" || state?.phase === "story" || state?.phase === "answer"
      ? state?.taggerId ?? ""
      : currentQuestionerId;
  const pendingQuestion = state?.pendingQuestion?.question ?? "";
  const inputContext = [
    room.playId ?? "",
    state?.phase ?? "invalid",
    state?.roundId ?? "",
    actorId,
    pendingQuestion,
    state?.rolledWords?.protagonist ?? "",
    state?.rolledWords?.place ?? "",
    state?.rolledWords?.event ?? "",
  ].join(":");
  const [input, setInput] = useState("");
  const retryRef = useRef<{ context: string; value: string } | null>(null);
  const acknowledgementRef = useRef(0);
  const {
    send,
    pendingKind,
    acknowledgementVersion,
  } = useRoomCommandRequest({
    room,
    gameId: "story-dice",
    state: valid ? state : null,
    readState: readStoryDicePublicState,
    onAction,
    lifetimeParts: [actorId, inputContext],
  });
  const requestPending = actionLoading || pendingKind !== null;

  useEffect(() => {
    setInput("");
    retryRef.current = null;
  }, [inputContext]);

  useEffect(() => {
    if (acknowledgementRef.current === acknowledgementVersion) return;
    acknowledgementRef.current = acknowledgementVersion;
    const retry = retryRef.current;
    if (!retry || retry.context !== inputContext) return;
    setInput((current) => current.trim() === retry.value ? "" : current);
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
    score: state.pairs.filter((pair) =>
      pair.playerId === player.id || pair.taggerId === player.id
    ).length,
  }));
  const remainingTargetCount = Math.max(
    0,
    state.roundTargetPlayerIds.length - state.roundSubmittedPlayerIds.length,
  );
  const remainingRoundCount = Math.max(0, state.maxRounds - state.round);
  const targetTotal = state.phase === "done"
    ? state.pairs.length
    : state.pairs.length + remainingTargetCount +
      remainingRoundCount * state.roundTargetPlayerIds.length;
  if (state.phase === "done") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-foreground">
        <p role="status" className="border border-border bg-secondary p-3 text-center text-sm font-semibold rounded-lg">
          {endMessage(state.endReason, text)}
        </p>
        <p className="text-center text-sm font-semibold">
          {text.storyGoal(state.pairs.length, targetTotal)}
        </p>
        <RoomResult
          game={game}
          room={room}
          myId={myId}
          scoreLabel={t("turns")}
          scoreUnit=""
          scores={scores}
          questions={state.pairs}
          actionLoading={actionLoading}
          onAction={onAction}
          onLeave={onLeave}
        />
      </div>
    );
  }

  const isHost = room.hostId === myId;
  const isActor = actorId === myId;
  const activeState = state;
  const playId = room.playId;
  const actorName = state.playerNames[actorId] ?? "";
  const taggerName = state.playerNames[state.taggerId] ?? "";

  async function prepare() {
    if (!isHost || activeState.phase !== "setup" || requestPending) return;
    await send(
      "story-prepare",
      { playId },
      [playId, "story-prepare"],
    );
  }

  async function roll() {
    if (!isActor || activeState.phase !== "roll" || requestPending) return;
    await send(
      "story-roll",
      { playId, roundId: activeState.roundId },
      [playId, activeState.roundId ?? "", activeState.taggerId],
    );
  }

  async function submitInput() {
    const value = input.trim();
    if (!value || !isActor || requestPending) return;
    let action: string;
    let body: Record<string, unknown>;
    if (activeState.phase === "story") {
      action = "story-submit-story";
      body = { playId, roundId: activeState.roundId, story: value };
    } else if (activeState.phase === "question") {
      action = "story-submit-question";
      body = { playId, roundId: activeState.roundId, locale, question: value };
    } else if (activeState.phase === "answer") {
      action = "story-submit-answer";
      body = { playId, roundId: activeState.roundId, answer: value };
    } else {
      return;
    }
    retryRef.current = { context: inputContext, value };
    const outcome = await send(
      action,
      body,
      [playId, activeState.roundId ?? "", activeState.phase, pendingQuestion, value],
    );
    if (outcome === "confirmed") {
      setInput((current) => current.trim() === value ? "" : current);
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

  const prompt = state.phase === "story"
    ? text.storyPrompt
    : state.phase === "question"
      ? text.storyQuestionPrompt
      : text.storyAnswerPrompt;
  const placeholder = state.phase === "story"
    ? text.storyPlaceholder
    : state.phase === "question"
      ? text.storyQuestionPlaceholder
      : text.storyAnswerPlaceholder;
  const submitLabel = state.phase === "story"
    ? text.storySubmit
    : state.phase === "question"
      ? text.storyQuestionSubmit
      : text.storyAnswerSubmit;

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-foreground">
      <GameHeader
        game={game}
        subtitle={text.storySubtitle}
        onLeave={onLeave}
        leave={text.leave}
        disabled={requestPending}
      />

      {state.phase === "setup" ? (
        <section className="space-y-3 border-b border-border pb-5">
          {isHost ? (
            <Button type="button" onClick={prepare} disabled={requestPending} className="w-full sm:w-auto">
              <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              {pendingKind === "story-prepare" ? text.sending : text.storyPrepare}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{text.waitingHost}</p>
          )}
        </section>
      ) : (
        <>
          <section className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-4" aria-live="polite">
            <div>
              <p className="text-sm font-semibold">{text.storyTagger(taggerName)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {text.roundProgress(state.round, state.maxRounds, state.completedRounds)}
              </p>
            </div>
            <div className="min-w-0 text-left sm:text-right">
              <p className="text-sm font-semibold">{text.storyGoal(state.pairs.length, targetTotal)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {text.submissionProgress(state.roundSubmittedPlayerIds.length, state.roundTargetPlayerIds.length)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isActor ? text.currentTurn(actorName) : text.waitingTurn(actorName)}
              </p>
            </div>
          </section>

          <section className="space-y-3 border-b border-border pb-5" aria-labelledby="story-word-pool">
            <h2 id="story-word-pool" className="text-base font-semibold">{text.storyWordPool}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {WORD_CATEGORIES.map((category) => (
                <div key={category} className="border border-border bg-card p-3 rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground">{getStoryDiceCategoryLabel(locale, category)}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {state.words[category].map((word) => (
                      <li key={word} className="break-words bg-secondary px-2 py-1 text-xs rounded-md">
                        {getLocalizedText(state.words.wordText[word], locale, word)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {state.rolledWords && (
            <section className="space-y-2 border-b border-border pb-5">
              <h2 className="text-base font-semibold">{text.storyRolled}</h2>
              <div className="flex flex-wrap gap-2">
                {WORD_CATEGORIES.map((category) => {
                  const word = state.rolledWords?.[category] ?? "";
                  return (
                    <span key={category} className="min-w-0 break-words border border-border bg-secondary px-3 py-2 text-sm font-semibold rounded-lg">
                      {getLocalizedText(state.words.wordText[word], locale, word)}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {state.phase === "roll" && isActor && (
            <Button type="button" onClick={roll} disabled={requestPending} className="w-full sm:w-auto">
              <Dices className="mr-2 h-4 w-4" aria-hidden="true" />
              {pendingKind === "story-roll" ? text.sending : text.storyRoll}
            </Button>
          )}

          {(state.phase === "story" || state.phase === "question" || state.phase === "answer") && isActor && (
            <form className="space-y-3 border-b border-border pb-5" onSubmit={(event) => {
              event.preventDefault();
              void submitInput();
            }}>
              <label htmlFor="story-turn-input" className="text-sm font-semibold">{prompt}</label>
              <Textarea
                id="story-turn-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={placeholder}
                maxLength={state.phase === "question" ? 200 : 500}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button type="submit" disabled={!input.trim() || requestPending} className="w-full sm:w-auto">
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                {pendingKind?.startsWith("story-submit") ? text.sending : submitLabel}
              </Button>
            </form>
          )}
        </>
      )}

      <section className="space-y-3" aria-labelledby="story-records-title">
        <h2 id="story-records-title" className="text-base font-semibold">{text.sharedRecords}</h2>
        {!state.story && state.pairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{text.noRecords}</p>
        ) : (
          <div className="space-y-2">
            {state.story && (
              <div className="min-w-0 border border-border bg-card p-3 rounded-lg">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {text.storyRecord} · {state.story.playerName}
                </p>
                <p className="mt-1 break-words text-sm">{state.story.story}</p>
              </div>
            )}
            {state.pairs.map((pair) => (
              <div key={`${pair.roundId}:${pair.playerId}`} className="min-w-0 border border-border bg-card p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{pair.round} · {pair.playerName}</p>
                <p className="mt-1 break-words text-sm font-semibold">{pair.question}</p>
                <p className="mt-2 break-words border-t border-border pt-2 text-sm">{pair.answer}</p>
              </div>
            ))}
            {state.pendingQuestion && (
              <div className="min-w-0 border border-input bg-background p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">{state.pendingQuestion.playerName}</p>
                <p className="mt-1 break-words text-sm font-semibold">{state.pendingQuestion.question}</p>
              </div>
            )}
          </div>
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
