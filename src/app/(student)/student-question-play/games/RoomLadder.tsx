"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Route,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getQuestionGameText,
  resolveQuestionGameLocale,
} from "@/lib/question-game-i18n";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import {
  readLadderState,
  type LadderRoomState,
} from "@/lib/question-game-room-engines/ladder";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
  RoomActionResult,
} from "@/lib/question-games-data";
import LadderBoard from "./LadderBoard";
import LadderQuestionComposer from "./LadderQuestionComposer";
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

type RequestKind = "ladder-prepare" | "ladder-submit-question";

interface RetryRequest {
  kind: RequestKind;
  commandId: string;
  execution: string;
  lifetime: string;
  signature: string;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function roomExecution(
  room: Pick<GameRoom, "code" | "createdAt" | "playId">,
) {
  return JSON.stringify([room.code, room.createdAt, room.playId ?? ""]);
}

function roomLifetime(room: GameRoom, state: LadderRoomState | null) {
  return JSON.stringify([
    room.code,
    room.createdAt,
    room.playId ?? "",
    state?.phase ?? "invalid",
    state?.roundId ?? "",
    room.players.map(({ id, name }) => [id, name]),
  ]);
}

function requestSignature(
  lifetime: string,
  kind: RequestKind,
  playId: string,
  value: unknown,
  roundId?: string,
) {
  return JSON.stringify([lifetime, kind, playId, roundId ?? "", value]);
}

function responseMatchesExecution(
  result: RoomActionResult | null,
  request: RetryRequest,
) {
  if (!result?.room) return false;
  return result.room.gameId === "ladder" &&
    roomExecution(result.room) === request.execution;
}

function responseConfirmsCommand(
  result: RoomActionResult | null,
  request: RetryRequest,
) {
  if (!responseMatchesExecution(result, request) || !result?.room) return false;
  return readLadderState(result.room.gameState)
    ?.recentCommandIds.includes(request.commandId) === true;
}

function hasUniqueRoomPlayers(room: GameRoom) {
  return new Set(room.players.map(({ id }) => id)).size === room.players.length;
}

function playerMatchesAssignment(
  state: LadderRoomState,
  player: GameRoom["players"][number],
) {
  return state.assignments.some((assignment) =>
    assignment.playerId === player.id && assignment.playerName === player.name
  );
}

function currentPlayersMatchTargets(
  room: GameRoom,
  state: LadderRoomState,
) {
  const targetIds = new Set(state.roundTargetPlayerIds);
  return targetIds.size === room.players.length &&
    room.players.every((player) =>
      targetIds.has(player.id) && playerMatchesAssignment(state, player)
    );
}

function currentPlayersAreFinalRoundSubset(
  room: GameRoom,
  state: LadderRoomState,
) {
  const roundPlayerIds = new Set(state.roundPlayerIds);
  const targetIds = new Set(state.roundTargetPlayerIds);
  return room.players.every((player) =>
    roundPlayerIds.has(player.id) &&
    targetIds.has(player.id) &&
    playerMatchesAssignment(state, player)
  );
}

function roomShellMatchesState(
  room: GameRoom,
  state: LadderRoomState,
) {
  if (
    room.gameId !== "ladder" ||
    !isUuidV4(room.playId) ||
    !hasUniqueRoomPlayers(room)
  ) {
    return false;
  }
  if (state.phase === "setup") {
    return room.status === "playing" &&
      room.players.length >= QUESTION_GAME_RULES.ladder.multiplayer.min &&
      room.players.length <= QUESTION_GAME_RULES.ladder.multiplayer.max;
  }
  if (state.phase === "done") {
    if (room.status !== "ended") return false;
    if (state.endReason === "insufficient-players") {
      if (room.players.length >= QUESTION_GAME_RULES.ladder.multiplayer.min) {
        return false;
      }
      return state.round === 0
        ? state.roundTargetPlayerIds.length === 0
        : currentPlayersMatchTargets(room, state);
    }
    return state.endReason === "completed" &&
      currentPlayersAreFinalRoundSubset(room, state);
  }
  if (room.status !== "playing" || !state.roundId) return false;

  return currentPlayersMatchTargets(room, state);
}

export default function RoomLadder({
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
  const text = getQuestionGameText(locale);
  const state = readLadderState(room.gameState);
  const execution = roomExecution(room);
  const lifetime = roomLifetime(room, state);
  const lifetimeRef = useRef(lifetime);
  const pendingRef = useRef<RetryRequest | null>(null);
  const retriesRef = useRef<Partial<Record<RequestKind, RetryRequest>>>({});
  const [topicInputs, setTopicInputs] = useState<string[]>(() =>
    Array.from({ length: room.players.length }, () => ""));
  const [topicErrors, setTopicErrors] = useState<(string | null)[]>(() =>
    Array.from({ length: room.players.length }, () => null));
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<RequestKind | null>(null);
  const [acknowledgementVersion, setAcknowledgementVersion] = useState(0);
  const isHost = room.hostId === myId;
  const requestPending = actionLoading || pendingKind !== null;

  useLayoutEffect(() => {
    lifetimeRef.current = lifetime;
  }, [lifetime]);

  useEffect(() => {
    pendingRef.current = null;
    retriesRef.current = {};
    setPendingKind(null);
    setPrepareError(null);
    setAcknowledgementVersion(0);
  }, [lifetime]);

  useEffect(() => {
    setTopicInputs(Array.from({ length: room.players.length }, () => ""));
    setTopicErrors(Array.from({ length: room.players.length }, () => null));
    setPrepareError(null);
  }, [lifetime, room.players.length]);

  useEffect(() => {
    if (!state) return;
    for (const request of Object.values(retriesRef.current)) {
      if (
        !request ||
        request.lifetime !== lifetime ||
        !state.recentCommandIds.includes(request.commandId)
      ) {
        continue;
      }

      if (retriesRef.current[request.kind] === request) {
        delete retriesRef.current[request.kind];
      }
      if (pendingRef.current === request) {
        pendingRef.current = null;
        setPendingKind(null);
      }
      if (request.kind === "ladder-submit-question") {
        setAcknowledgementVersion((version) => version + 1);
      } else {
        setPrepareError(null);
      }
    }
  }, [lifetime, state]);

  async function sendRequest(
    kind: RequestKind,
    body: Record<string, unknown>,
    signatureValue: unknown,
    playId: string,
    roundId?: string,
  ) {
    if (pendingRef.current) return false;

    const signature = requestSignature(
      lifetime,
      kind,
      playId,
      signatureValue,
      roundId,
    );
    const previous = retriesRef.current[kind];
    const request: RetryRequest =
      previous?.lifetime === lifetime && previous.signature === signature
        ? previous
        : {
            kind,
            commandId: crypto.randomUUID(),
            execution,
            lifetime,
            signature,
          };

    retriesRef.current[kind] = request;
    pendingRef.current = request;
    setPendingKind(kind);

    let result: RoomActionResult | null = null;
    try {
      result = await onAction(kind, body, {
        commandId: request.commandId,
        expectedRoom: { code: room.code, createdAt: room.createdAt },
      });
    } catch {
      result = null;
    }

    const sameLifetime = lifetimeRef.current === request.lifetime;
    const confirmed = sameLifetime && responseMatchesExecution(result, request) && (
      result?.ok === true || responseConfirmsCommand(result, request)
    );
    if (confirmed && retriesRef.current[kind] === request) {
      delete retriesRef.current[kind];
    }
    if (pendingRef.current === request) {
      pendingRef.current = null;
      if (sameLifetime) setPendingKind(null);
    }
    return confirmed;
  }

  function updateTopic(index: number, value: string) {
    setTopicInputs((current) => current.map((topic, topicIndex) =>
      topicIndex === index ? value : topic));
    setTopicErrors((current) => current.map((error, topicIndex) =>
      topicIndex === index ? null : error));
    setPrepareError(null);
  }

  async function prepareLadder() {
    if (!state || state.phase !== "setup" || !room.playId || !isHost) return;
    const topics = topicInputs.map((topic) => topic.trim());
    const errors = topics.map((topic) => {
      if (!topic) {
        return t("enterATopic");
      }
      if (topic.length > QUESTION_GAME_LIMITS.topic) {
        return t("useTopicCharactersOrFewer", { topic: QUESTION_GAME_LIMITS.topic });
      }
      return null;
    });
    setTopicErrors(errors);
    if (errors.some(Boolean)) return;

    setPrepareError(null);
    const confirmed = await sendRequest(
      "ladder-prepare",
      { playId: room.playId, topics },
      topics,
      room.playId,
    );
    if (!confirmed && lifetimeRef.current === lifetime) {
      setPrepareError(t("couldNotPrepareTheLadder"));
    }
  }

  const shellMatchesState = state !== null && roomShellMatchesState(room, state);
  if (!state || !shellMatchesState) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={t("checkingSharedLadder")}
          onLeave={onLeave}
          disabled={requestPending}
        />
        <section className="border-y border-border bg-card px-4 py-6 text-center text-card-foreground sm:px-6">
          <AlertTriangle
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-amber-700 dark:text-amber-300"
          />
          <p className="mt-3 font-black text-foreground">
            {t("theSharedLadderCouldNot")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("waitForTheRoomTo")}
          </p>
        </section>
      </div>
    );
  }

  if (state.phase === "setup") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={t("preparingLadderTopics")}
          onLeave={onLeave}
          disabled={requestPending}
        />
        {isHost ? (
          <section className="space-y-5 border-y border-border bg-card px-4 py-6 text-card-foreground sm:px-6">
            <div>
              <h2 className="text-lg font-black text-foreground">
                {text.ladderSetupTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("enterOneTopicForEach", { length: room.players.length })}
              </p>
            </div>
            <div className="space-y-4">
              {topicInputs.map((topic, index) => {
                const errorId = `room-ladder-topic-error-${index}`;
                return (
                  <div className="space-y-1.5" key={room.players[index]?.id ?? index}>
                    <label
                      className="block text-sm font-bold text-foreground"
                      htmlFor={`room-ladder-topic-${index}`}
                    >
                      {text.ladderTopicInputLabel(index + 1)}
                    </label>
                    <Input
                      aria-describedby={topicErrors[index] ? errorId : undefined}
                      className="bg-background text-foreground"
                      disabled={pendingKind !== null}
                      id={`room-ladder-topic-${index}`}
                      onChange={(event) => updateTopic(index, event.target.value)}
                      placeholder={text.defaultTopic(String.fromCharCode(65 + index))}
                      value={topic}
                    />
                    {topicErrors[index] && (
                      <p
                        className="text-sm font-bold text-rose-700 dark:text-rose-300"
                        id={errorId}
                        role="alert"
                      >
                        {topicErrors[index]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {prepareError && (
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">
                {prepareError}
              </p>
            )}
            <Button
              className="w-full bg-emerald-700 py-5 font-black text-white hover:bg-emerald-800 dark:bg-emerald-300 dark:text-emerald-950 dark:hover:bg-emerald-200"
              disabled={pendingKind !== null || !room.playId}
              onClick={() => void prepareLadder()}
              type="button"
            >
              {pendingKind === "ladder-prepare" ? (
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Route className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {t("prepareLadder")}
            </Button>
          </section>
        ) : (
          <section className="border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
            <Clock3
              aria-hidden="true"
              className="mx-auto h-10 w-10 text-violet-700 dark:text-violet-300"
            />
            <p className="mt-3 font-black text-foreground">
              {t("theHostIsPreparingThe")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pleaseWaitAMoment")}
            </p>
          </section>
        )}
      </div>
    );
  }

  if (state.phase === "done") {
    if (state.endReason === "completed") {
      const resultPlayers = new Map(
        (room.pointParticipants ?? room.players).map(
          ({ id, name }) => [id, name],
        ),
      );
      for (const question of state.questions) {
        if (!resultPlayers.has(question.playerId)) {
          resultPlayers.set(question.playerId, question.playerName);
        }
      }
      return (
        <RoomResult
          game={game}
          room={room}
          myId={myId}
          scoreLabel={t("questions2")}
          scoreUnit={t("text")}
          scores={[...resultPlayers].map(([playerId, name]) => ({
            playerId,
            name,
            score: state.questions.filter(
              (question) => question.playerId === playerId,
            ).length,
          }))}
          questions={state.questions.map((question) => ({
            playerId: question.playerId,
            playerName: question.playerName,
            question: question.question,
          }))}
          details={<LadderResultDetails state={state} locale={locale} />}
          actionLoading={requestPending}
          onAction={onAction}
          onLeave={onLeave}
        />
      );
    }
    return (
      <LadderInsufficientResult
        game={game}
        room={room}
        locale={locale}
        onLeave={onLeave}
        disabled={requestPending}
      />
    );
  }

  const myAssignment = state.assignments.find(
    ({ playerId }) => playerId === myId,
  );
  if (!myAssignment || !state.roundId || !room.playId) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          onLeave={onLeave}
          disabled={requestPending}
        />
        <section className="border-y border-border bg-card px-4 py-6 text-center text-card-foreground">
          <p className="font-black text-foreground">
            {t("yourLadderAssignmentCouldNot")}
          </p>
        </section>
      </div>
    );
  }

  const playId = room.playId;
  const roundId = state.roundId;
  const currentQuestions = state.questions.filter(
    (question) => question.roundId === roundId,
  );
  const currentQuestionByPlayer = new Map(
    currentQuestions.map((question) => [question.playerId, question]),
  );
  const myQuestion = currentQuestionByPlayer.get(myId);
  const targetAssignments = state.roundTargetPlayerIds.map((playerId) =>
    state.assignments.find((assignment) => assignment.playerId === playerId));
  const submittedCount = targetAssignments.filter((assignment) =>
    assignment && currentQuestionByPlayer.has(assignment.playerId)).length;
  const roundKey = [
    lifetime,
    acknowledgementVersion,
  ].join(":");

  async function submitQuestion(question: string) {
    return sendRequest(
      "ladder-submit-question",
      {
        playId,
        roundId,
        locale,
        question,
      },
      question,
      playId,
      roundId,
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <RoomHeader
        game={game}
        room={room}
        subtitle={text.ladderRoundProgress(state.round, state.maxRounds)}
        onLeave={onLeave}
        disabled={requestPending}
      />

      <section className="border-y border-border bg-card px-4 py-4 text-card-foreground sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              {t("yourAssignedTopic")}
            </p>
            <h2 className="mt-1 break-words text-xl font-black text-foreground">
              {myAssignment.topic}
            </h2>
          </div>
          <span className="shrink-0 bg-violet-100 px-3 py-2 text-sm font-black text-violet-950 dark:bg-violet-950 dark:text-violet-100">
            {text.ladderRoundProgress(state.round, state.maxRounds)}
          </span>
        </div>
      </section>

      <LadderBoard
        assignments={state.assignments}
        grid={state.grid}
        locale={locale}
        selectedStartColumn={myAssignment.startColumn}
      />

      <section
        aria-label={t("currentRoundSubmissions")}
        className="border-y border-border bg-card px-4 py-4 text-card-foreground sm:px-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black text-foreground">
            {t("currentRoundSubmissions")}
          </h2>
          <span className="text-sm font-bold text-muted-foreground">
            {submittedCount} / {state.roundTargetPlayerIds.length}
          </span>
        </div>
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {targetAssignments.map((assignment) => {
            if (!assignment) return null;
            const submitted = currentQuestionByPlayer.has(assignment.playerId);
            return (
              <li
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]"
                key={assignment.playerId}
              >
                {submitted ? (
                  <CheckCircle2
                    aria-label={t("submitted")}
                    className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
                  />
                ) : (
                  <Clock3
                    aria-label={t("waiting")}
                    className="h-5 w-5 text-amber-700 dark:text-amber-300"
                  />
                )}
                <span className="break-words font-bold text-foreground">
                  {assignment.playerName}
                </span>
                <span className="col-start-2 break-words text-muted-foreground sm:col-start-auto">
                  {assignment.topic}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {myQuestion ? (
        <section className="border-y border-emerald-400 bg-emerald-50 px-4 py-5 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50 sm:px-6">
          <div className="flex items-center gap-2 font-black">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            <h2>
              {t("yourCurrentRoundQuestionIs")}
            </h2>
          </div>
          <p className="mt-3 break-words text-sm leading-6">{myQuestion.question}</p>
          <p className="mt-2 text-sm font-semibold">
            {t("youCanFollowTheOther")}
          </p>
        </section>
      ) : (
        <LadderQuestionComposer
          locale={locale}
          onConfirm={submitQuestion}
          roundKey={roundKey}
          topic={myAssignment.topic}
        />
      )}
    </div>
  );
}

function LadderInsufficientResult({
  game,
  room,
  locale,
  onLeave,
  disabled,
}: {
  game: BuiltInGame;
  room: GameRoom;
  locale: "ko" | "en";
  onLeave: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("gamePlay");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <RoomHeader
        game={game}
        room={room}
        subtitle={t("ladderEnded")}
        onLeave={onLeave}
        disabled={disabled}
      />
      <section className="border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto h-12 w-12 text-amber-700 dark:text-amber-300"
        />
        <h1 className="mt-3 text-xl font-black text-foreground">
          {t("theLadderEndedBecauseThere")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("leaveTheRoomWhenYou")}
        </p>
      </section>
    </div>
  );
}

function LadderResultDetails({
  state,
  locale,
}: {
  state: LadderRoomState;
  locale: "ko" | "en";
}) {
  const t = useTranslations("gamePlay");
  const text = getQuestionGameText(locale);

  const orderedQuestions = [...state.questions].sort(
    (left, right) => left.round - right.round,
  );
  const playerResults = new Map<string, {
    playerName: string;
    count: number;
  }>();
  for (const question of orderedQuestions) {
    const current = playerResults.get(question.playerId);
    playerResults.set(question.playerId, {
      playerName: question.playerName,
      count: (current?.count ?? 0) + 1,
    });
  }

  return (
    <section className="border-y border-border bg-card px-4 py-7 text-card-foreground sm:px-6">
        <CheckCircle2
          aria-hidden="true"
          className="mx-auto h-12 w-12 text-emerald-700 dark:text-emerald-300"
        />
        <div className="mt-3 text-center">
          <h1 className="text-2xl font-black text-foreground">
            {text.ladderDoneTitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {text.ladderDoneDescription}
          </p>
        </div>

        <section className="mt-6">
          <h2 className="font-black text-foreground">
            {t("questionsPerStudent")}
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {[...playerResults.entries()].map(([playerId, result]) => (
              <li
                className="flex min-w-0 items-start justify-between gap-4 py-3 text-sm"
                key={playerId}
              >
                <span className="min-w-0 break-words font-bold text-foreground">
                  {result.playerName}
                </span>
                <span className="shrink-0 font-black text-violet-700 dark:text-violet-300">
                  {t("countQuestions", { count: result.count })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="font-black text-foreground">
            {t("questionsByRound")}
          </h2>
          <div className="mt-3 space-y-5">
            {Array.from({ length: state.maxRounds }, (_, index) => index + 1)
              .map((round) => {
                const roundQuestions = orderedQuestions.filter(
                  (question) => question.round === round,
                );
                return (
                  <section className="border-t border-border pt-3" key={round}>
                    <h3 className="text-sm font-black text-foreground">
                      {t("roundRound", { round: round })}
                    </h3>
                    <ol className="mt-2 divide-y divide-border">
                      {roundQuestions.map((question) => (
                        <li
                          className="min-w-0 py-3"
                          key={`${question.roundId}:${question.playerId}`}
                        >
                          <p className="break-words text-sm font-bold text-foreground">
                            {question.playerName}
                          </p>
                          <p className="mt-1 break-words text-xs font-semibold text-muted-foreground">
                            {question.topic}
                          </p>
                          <p className="mt-2 break-words text-sm leading-6 text-foreground">
                            {question.question}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
          </div>
        </section>
    </section>
  );
}
