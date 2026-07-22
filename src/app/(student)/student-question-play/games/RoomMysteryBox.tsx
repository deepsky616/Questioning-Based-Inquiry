"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  PackageOpen,
  Play,
  RotateCcw,
  Send,
  Target,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  getLocalizedText,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";
import {
  readMysteryPublicState,
  type MysteryHistoryItem,
  type MysteryPublicRoomState,
} from "@/lib/question-game-room-engines/mystery";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
  RoomActionResult,
} from "@/lib/question-games-data";
import { RoomHeader } from "./roomShared";
import RoomResult from "./RoomResult";

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

type RequestKind =
  | "mystery-start"
  | "mystery-ask"
  | "mystery-guess"
  | "restart";

interface RetryRequest {
  kind: RequestKind;
  commandId: string;
  identity: string;
  signature: string;
  value: string;
}

function roomIdentity(room: Pick<GameRoom, "code" | "createdAt">) {
  return `${room.code}:${room.createdAt}`;
}

function requestSignature(
  identity: string,
  kind: RequestKind,
  value: string,
  playId?: string,
  roundId?: string,
) {
  return [identity, kind, playId ?? "", roundId ?? "", value].join(":");
}

type GameTranslate = (key: string, values?: Record<string, string | number>) => string;

function answerLabel(answer: "yes" | "no" | "unknown", t: GameTranslate) {
  return answer === "yes" ? t("answerYes") : answer === "no" ? t("answerNo") : t("answerNotSure");
}

function historyResultLabel(item: MysteryHistoryItem, t: GameTranslate) {
  if (item.kind === "question") return answerLabel(item.answer, t);
  return item.correct ? t("guessCorrect") : t("guessNotCorrect");
}

export default function RoomMysteryBox({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: Props) {
  const rawLocale = useLocale();
  const locale = resolveQuestionGameLocale(rawLocale);
  const t = useTranslations("gamePlay");
  const state = readMysteryPublicState(room.gameState);
  const identity = roomIdentity(room);
  const identityRef = useRef(identity);
  const pendingRef = useRef<RetryRequest | null>(null);
  const retriesRef = useRef<Partial<Record<RequestKind, RetryRequest>>>({});
  const [questionInput, setQuestionInput] = useState("");
  const [questionError, setQuestionError] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [pendingKind, setPendingKind] = useState<RequestKind | null>(null);
  const isHost = room.hostId === myId;
  const requestPending = actionLoading || pendingKind !== null;

  useLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    pendingRef.current = null;
    retriesRef.current = {};
    setPendingKind(null);
    setQuestionInput("");
    setQuestionError("");
    setGuessInput("");
  }, [identity]);

  useEffect(() => {
    if (!state) return;
    for (const retry of Object.values(retriesRef.current)) {
      if (
        !retry ||
        retry.identity !== identity ||
        !state.recentCommandIds.includes(retry.commandId)
      ) {
        continue;
      }

      delete retriesRef.current[retry.kind];
      if (retry.kind === "mystery-ask") {
        setQuestionInput((current) => current.trim() === retry.value ? "" : current);
      }
      if (retry.kind === "mystery-guess") {
        setGuessInput((current) => current.trim() === retry.value ? "" : current);
      }
    }
  }, [identity, state]);

  async function sendRequest(
    kind: RequestKind,
    body: Record<string, unknown>,
    value: string,
    playId?: string,
    roundId?: string,
  ) {
    if (pendingRef.current || actionLoading) return;

    const signature = requestSignature(
      identity,
      kind,
      value,
      playId,
      roundId,
    );
    const previous = retriesRef.current[kind];
    const request: RetryRequest =
      previous?.signature === signature && previous.identity === identity
        ? previous
        : {
            kind,
            commandId: crypto.randomUUID(),
            identity,
            signature,
            value,
          };

    retriesRef.current[kind] = request;
    pendingRef.current = request;
    setPendingKind(kind);

    let result: RoomActionResult | null = null;
    try {
      result = await onAction(
        kind,
        body,
        {
          commandId: request.commandId,
          expectedRoom: { code: room.code, createdAt: room.createdAt },
        },
      );
    } catch {
      result = null;
    }

    if (identityRef.current !== request.identity) return;
    if (result?.ok) {
      if (retriesRef.current[kind] === request) {
        delete retriesRef.current[kind];
      }
      if (kind === "mystery-ask") {
        setQuestionError("");
        setQuestionInput((current) => current.trim() === value ? "" : current);
      }
      if (kind === "mystery-guess") {
        setGuessInput((current) => current.trim() === value ? "" : current);
      }
    } else if (kind === "mystery-ask") {
      setQuestionError(
        result?.status === 422
          ? t("mysteryQuestionRewriteInline")
          : t("mysteryQuestionRetryInline"),
      );
    }

    if (pendingRef.current === request) {
      pendingRef.current = null;
      setPendingKind(null);
    }
  }

  const shellMatchesState = state !== null && (
    state.phase === "done"
      ? room.status === "ended"
      : room.status === "playing"
  );

  if (!state || !shellMatchesState) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={t("checkingSharedGame")}
          onLeave={onLeave}
          disabled={requestPending}
        />
        <section className="border-y border-border bg-card px-4 py-6 text-center text-card-foreground">
          <p className="font-black">
            {t("theSharedGameCouldNot")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("waitForTheRoomTo")}
          </p>
        </section>
      </div>
    );
  }

  if (state.phase === "setup") {
    const startLocked = requestPending || !room.playId;
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={t("readyToChooseASecret")}
          onLeave={onLeave}
          disabled={requestPending}
        />
        <section className="space-y-5 border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
          <PackageOpen className="mx-auto h-14 w-14 text-pink-600 dark:text-pink-300" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-black text-foreground">
              {t("mysteryBox")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("theServerWillChooseOne")}
            </p>
          </div>
          {isHost ? (
            <Button
              type="button"
              onClick={() => {
                if (!room.playId) return;
                void sendRequest(
                  "mystery-start",
                  { playId: room.playId },
                  "",
                  room.playId,
                );
              }}
              disabled={startLocked}
              className="w-full rounded-lg bg-pink-700 py-5 font-black text-white hover:bg-pink-800 dark:bg-pink-400 dark:text-slate-950 dark:hover:bg-pink-300"
            >
              {pendingKind === "mystery-start" ? (
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {t("startMysteryBox")}
            </Button>
          ) : (
            <p className="border-y border-border bg-background py-4 text-sm font-semibold text-muted-foreground">
              {t("waitUntilTheHostStarts")}
            </p>
          )}
        </section>
      </div>
    );
  }

  if (state.phase === "done") {
    if (state.endReason === "completed") {
      const names = new Map(
        (room.pointParticipants ?? room.players).map(({ id, name }) => [id, name]),
      );
      for (const item of state.history) {
        if (!names.has(item.playerId)) names.set(item.playerId, item.playerName);
      }
      return (
        <RoomResult
          game={game}
          room={room}
          myId={myId}
          scoreLabel={t("questions2")}
          scoreUnit={t("questions3")}
          scores={Object.entries(state.scores).map(([playerId, score]) => ({
            playerId,
            name: names.get(playerId) ?? playerId,
            score,
          }))}
          questions={state.history
            .filter((item) => item.kind === "question")
            .map((item) => ({
              playerId: item.playerId,
              playerName: item.playerName,
              question: item.question,
            }))}
          details={<MysteryCompletedDetails state={state} locale={locale} />}
          actionLoading={requestPending}
          onAction={onAction}
          onLeave={onLeave}
          onRestart={() => void sendRequest("restart", {}, "")}
          restartLabel={t("restart")}
          waitingLabel={t("waitUntilTheHostRestarts")}
        />
      );
    }
    return (
      <MysteryResult
        game={game}
        room={room}
        myId={myId}
        state={state}
        actionLoading={requestPending}
        pendingKind={pendingKind}
        onRestart={() => void sendRequest("restart", {}, "")}
        onLeave={onLeave}
        locale={locale}
      />
    );
  }

  const currentPlayerId = state.turnOrder[state.currentTurnIdx];
  const currentPlayer = room.players.find(({ id }) => id === currentPlayerId);
  const isMyTurn = currentPlayerId === myId;
  const canSubmit = Boolean(
    isMyTurn &&
    room.playId &&
    state.roundId &&
    !requestPending &&
    state.history.length < state.maxRounds
  );
  const remaining = Math.max(0, state.maxRounds - state.history.length);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <RoomHeader
        game={game}
        room={room}
        subtitle={t("activityRoundOfMaxrounds", { round: state.round, maxRounds: state.maxRounds })}
        onLeave={onLeave}
        disabled={requestPending}
      />

      <section className="border-y border-border bg-card px-4 py-4 text-card-foreground sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-black text-foreground">
              {t("currentTurnName", { name: currentPlayer?.name ?? "" })}
            </p>
            <p aria-live="polite" className="mt-1 text-sm font-semibold text-muted-foreground">
              {requestPending
                ? (t("sendingActivity"))
                : isMyTurn
                  ? (t("yourTurn2"))
                  : (t("waitingForYourTurn"))}
            </p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-lg bg-muted px-3 py-2 text-sm font-black text-foreground">
              {t("usedLength", { length: state.history.length })}
            </span>
            <span className="rounded-lg bg-pink-100 px-3 py-2 text-sm font-black text-pink-950 dark:bg-pink-950 dark:text-pink-100">
              {t("remainingLeft2", { remaining: remaining })}
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {room.players.map((player) => {
            const active = player.id === currentPlayerId;
            return (
              <div
                key={player.id}
                className={active
                  ? "flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs text-background"
                  : "flex shrink-0 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground"}
              >
                <span className="font-bold">{player.name}</span>
                <span className="font-black">{state.scores[player.id] ?? 0}</span>
              </div>
            );
          })}
        </div>
      </section>

      <MysteryHistory history={state.history} locale={locale} />

      <section className="grid gap-5 border-y border-border bg-card px-4 py-5 text-card-foreground md:grid-cols-2 sm:px-6">
        <div className="space-y-3">
          <div>
            <label htmlFor="room-mystery-question" className="font-black text-foreground">
              {t("yesOrNoQuestion")}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("askOneSimpleQuestionEnding")}
            </p>
          </div>
          <textarea
            id="room-mystery-question"
            aria-describedby={questionError ? "room-mystery-question-error" : undefined}
            aria-invalid={questionError ? true : undefined}
            value={questionInput}
            maxLength={QUESTION_GAME_LIMITS.question}
            disabled={!canSubmit}
            onChange={(event) => {
              const value = event.target.value;
              setQuestionInput(value);
              setQuestionError("");
              const retry = retriesRef.current["mystery-ask"];
              if (retry && retry.value !== value.trim()) {
                delete retriesRef.current["mystery-ask"];
              }
            }}
            className="h-28 w-full resize-none rounded-lg border-2 border-input bg-background p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-pink-500 disabled:cursor-not-allowed disabled:bg-muted"
            placeholder={t("canItBeEaten")}
          />
          {questionError ? (
            <p
              id="room-mystery-question-error"
              role="alert"
              className="text-sm font-semibold text-destructive"
            >
              {questionError}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              const value = questionInput.trim();
              if (!canSubmit || !value || !room.playId || !state.roundId) return;
              void sendRequest(
                "mystery-ask",
                {
                  playId: room.playId,
                  roundId: state.roundId,
                  locale,
                  question: value,
                },
                value,
                room.playId,
                state.roundId,
              );
            }}
            disabled={!canSubmit || !questionInput.trim()}
            className="w-full rounded-lg bg-violet-700 font-black text-white hover:bg-violet-800 dark:bg-violet-400 dark:text-slate-950 dark:hover:bg-violet-300"
          >
            {pendingKind === "mystery-ask" ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("sendQuestion")}
          </Button>
        </div>

        <div className="space-y-3 md:border-l md:border-border md:pl-5">
          <div>
            <label htmlFor="room-mystery-guess" className="font-black text-foreground">
              {t("answerGuess")}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("aWrongGuessUsesOne")}
            </p>
          </div>
          <input
            id="room-mystery-guess"
            type="text"
            value={guessInput}
            maxLength={QUESTION_GAME_LIMITS.shortWord}
            disabled={!canSubmit}
            onChange={(event) => {
              const value = event.target.value;
              setGuessInput(value);
              const retry = retriesRef.current["mystery-guess"];
              if (retry && retry.value !== value.trim()) {
                delete retriesRef.current["mystery-guess"];
              }
            }}
            className="h-28 w-full rounded-lg border-2 border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-pink-500 disabled:cursor-not-allowed disabled:bg-muted"
            placeholder={t("writeTheObjectName")}
          />
          <Button
            type="button"
            onClick={() => {
              const value = guessInput.trim();
              if (!canSubmit || !value || !room.playId || !state.roundId) return;
              void sendRequest(
                "mystery-guess",
                {
                  playId: room.playId,
                  roundId: state.roundId,
                  locale,
                  guess: value,
                },
                value,
                room.playId,
                state.roundId,
              );
            }}
            disabled={!canSubmit || !guessInput.trim()}
            className="w-full rounded-lg bg-pink-700 font-black text-white hover:bg-pink-800 dark:bg-pink-400 dark:text-slate-950 dark:hover:bg-pink-300"
          >
            {pendingKind === "mystery-guess" ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Target className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("sendGuess")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function MysteryHistory({
  history,
  locale,
}: {
  history: MysteryHistoryItem[];
  locale: "ko" | "en";
}) {
  const t = useTranslations("gamePlay");
  return (
    <section className="border-y border-border bg-card px-4 py-4 text-card-foreground sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black text-foreground">
          {t("sharedActivityHistory")}
        </h2>
        <span className="text-xs font-semibold text-muted-foreground">{history.length}</span>
      </div>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("noActivityYet")}
        </p>
      ) : (
        <ol className="mt-3 max-h-72 divide-y divide-border overflow-y-auto border-y border-border">
          {history.map((item, index) => (
            <li key={`${index}:${item.playerId}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3 text-sm">
              <span className="font-black text-muted-foreground">{index + 1}</span>
              <div className="min-w-0">
                <p className="font-bold text-foreground">{item.playerName}</p>
                <p className="mt-1 break-words text-foreground">
                  {item.kind === "question" ? item.question : item.guess}
                </p>
                {item.kind === "question" && item.answerSource === "fallback" && (
                  <p
                    className="mt-2 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-200"
                    role="status"
                  >
                    {t("mysteryFallbackSaved")}
                  </p>
                )}
              </div>
              <span className={item.kind === "question" && item.answer === "yes"
                ? "rounded-lg bg-emerald-100 px-2 py-1 font-black text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
                : item.kind === "question" && item.answer === "no"
                  ? "rounded-lg bg-rose-100 px-2 py-1 font-black text-rose-950 dark:bg-rose-950 dark:text-rose-100"
                  : "rounded-lg bg-muted px-2 py-1 font-black text-foreground"}
              >
                {historyResultLabel(item, t)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MysteryCompletedDetails({
  state,
  locale,
}: {
  state: MysteryPublicRoomState;
  locale: "ko" | "en";
}) {
  const t = useTranslations("gamePlay");
  const names = new Map<string, string>();
  for (const item of state.history) {
    if (!names.has(item.playerId)) names.set(item.playerId, item.playerName);
  }
  const winnerName = state.winnerId ? names.get(state.winnerId) ?? "" : "";
  const answer = state.answer
    ? getLocalizedText(state.answer, locale, "")
    : "";
  const questionCount = state.history.filter(({ kind }) => kind === "question").length;
  const heading = state.winnerId
    ? (t("theAnswerWasFound"))
    : (t("allTwentyActivitiesWereUsed"));

  return (
    <div className="space-y-4">
      <section className="space-y-5 border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
        <PackageOpen
          className="mx-auto h-14 w-14 text-pink-600 dark:text-pink-300"
          aria-hidden="true"
        />
        <div>
          <h1 className="text-2xl font-black text-foreground">{heading}</h1>
          {state.winnerId && (
            <p className="mt-2 font-bold text-pink-700 dark:text-pink-300">
              {t("winnernameFoundTheAnswer", { winnerName: winnerName })}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {t("lengthActivitiesQuestioncountQuestions", { length: state.history.length, questionCount: questionCount })}
          </p>
        </div>
        {answer && (
          <div className="border-y border-pink-300 bg-pink-50 py-5 text-pink-950 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-50">
            <p className="text-sm font-semibold">
              {t("revealedAnswer")}
            </p>
            <p className="mt-1 text-3xl font-black">{answer}</p>
          </div>
        )}
      </section>
      <MysteryHistory history={state.history} locale={locale} />
    </div>
  );
}

function MysteryResult({
  game,
  room,
  myId,
  state,
  actionLoading,
  pendingKind,
  onRestart,
  onLeave,
  locale,
}: {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  state: MysteryPublicRoomState;
  actionLoading: boolean;
  pendingKind: RequestKind | null;
  onRestart: () => void;
  onLeave: () => void;
  locale: "ko" | "en";
}) {
  const t = useTranslations("gamePlay");
  const names = new Map(room.players.map(({ id, name }) => [id, name]));
  for (const item of state.history) {
    if (!names.has(item.playerId)) names.set(item.playerId, item.playerName);
  }
  const winnerName = state.winnerId ? names.get(state.winnerId) ?? "" : "";
  const answer = state.answer
    ? getLocalizedText(state.answer, locale, "")
    : "";
  const questionCount = state.history.filter(({ kind }) => kind === "question").length;
  const endedBeforeStart = state.endReason === "insufficient-players" && state.round === 0;
  const endedDuringPlay = state.endReason === "insufficient-players" && state.round > 0;
  const heading = state.winnerId
    ? (t("theAnswerWasFound"))
    : endedBeforeStart
      ? (t("notEnoughPlayersBeforeStarting"))
      : endedDuringPlay
        ? (t("notEnoughPlayersToContinue"))
        : (t("allTwentyActivitiesWereUsed"));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <RoomHeader
        game={game}
        room={room}
        subtitle={t("mysteryBoxResult")}
        onLeave={onLeave}
        disabled={actionLoading}
      />
      <section className="space-y-5 border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
        <PackageOpen className="mx-auto h-14 w-14 text-pink-600 dark:text-pink-300" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-black text-foreground">{heading}</h1>
          {state.winnerId && (
            <p className="mt-2 font-bold text-pink-700 dark:text-pink-300">
              {t("winnernameFoundTheAnswer", { winnerName: winnerName })}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {t("lengthActivitiesQuestioncountQuestions", { length: state.history.length, questionCount: questionCount })}
          </p>
        </div>
        {answer && (
          <div className="border-y border-pink-300 bg-pink-50 py-5 text-pink-950 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-50">
            <p className="text-sm font-semibold">{t("revealedAnswer")}</p>
            <p className="mt-1 text-3xl font-black">{answer}</p>
          </div>
        )}
        {Object.entries(state.scores).length > 0 && (
          <div className="divide-y divide-border border-y border-border text-left">
            {Object.entries(state.scores).map(([playerId, score]) => (
              <p key={playerId} className="flex items-center justify-between gap-3 py-3 text-sm text-foreground">
                <span className="font-bold">{names.get(playerId) ?? playerId}</span>
                <span className="font-black">
                  {t("scoreQuestions", { score: score })}
                </span>
              </p>
            ))}
          </div>
        )}
        {room.hostId === myId ? (
          <Button
            type="button"
            onClick={onRestart}
            disabled={actionLoading}
            className="w-full rounded-lg bg-pink-700 py-5 font-black text-white hover:bg-pink-800 dark:bg-pink-400 dark:text-slate-950 dark:hover:bg-pink-300"
          >
            {pendingKind === "restart" ? (
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="mr-2 h-5 w-5" aria-hidden="true" />
            )}
            {t("restart")}
          </Button>
        ) : (
          <p className="border-y border-border bg-background py-4 text-sm font-semibold text-muted-foreground">
            {t("waitUntilTheHostRestarts")}
          </p>
        )}
      </section>
      <MysteryHistory history={state.history} locale={locale} />
    </div>
  );
}
