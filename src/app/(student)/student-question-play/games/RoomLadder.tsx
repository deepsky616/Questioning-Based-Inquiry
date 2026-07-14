"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Route,
} from "lucide-react";
import { useLocale } from "next-intl";
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
  identity: string;
  signature: string;
}

function roomIdentity(room: Pick<GameRoom, "code" | "createdAt">) {
  return `${room.code}:${room.createdAt}`;
}

function requestSignature(
  identity: string,
  kind: RequestKind,
  playId: string,
  value: unknown,
  roundId?: string,
) {
  return JSON.stringify([identity, kind, playId, roundId ?? "", value]);
}

function responseConfirmsCommand(
  result: RoomActionResult | null,
  request: RetryRequest,
) {
  if (!result?.room) return false;
  if (roomIdentity(result.room) !== request.identity) return false;
  return readLadderState(result.room.gameState)
    ?.recentCommandIds.includes(request.commandId) === true;
}

function roomShellMatchesState(
  room: GameRoom,
  state: LadderRoomState,
) {
  if (!room.playId) return false;
  if (state.phase === "setup") {
    return room.status === "playing" &&
      room.players.length >= QUESTION_GAME_RULES.ladder.multiplayer.min &&
      room.players.length <= QUESTION_GAME_RULES.ladder.multiplayer.max;
  }
  if (state.phase === "done") return room.status === "ended";
  if (room.status !== "playing" || !state.roundId) return false;

  const targetIds = new Set(state.roundTargetPlayerIds);
  const assignmentById = new Map(
    state.assignments.map((assignment) => [assignment.playerId, assignment]),
  );
  return targetIds.size === room.players.length &&
    room.players.every((player) =>
      targetIds.has(player.id) &&
      assignmentById.get(player.id)?.playerName === player.name
    );
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
  const text = getQuestionGameText(locale);
  const state = readLadderState(room.gameState);
  const identity = roomIdentity(room);
  const setupInputKey = `${identity}:${room.players.map(({ id }) => id).join(":")}`;
  const identityRef = useRef(identity);
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

  useLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    pendingRef.current = null;
    retriesRef.current = {};
    setPendingKind(null);
    setPrepareError(null);
    setAcknowledgementVersion(0);
  }, [identity]);

  useEffect(() => {
    setTopicInputs(Array.from({ length: room.players.length }, () => ""));
    setTopicErrors(Array.from({ length: room.players.length }, () => null));
    setPrepareError(null);
  }, [room.players.length, setupInputKey]);

  useEffect(() => {
    if (!state) return;
    for (const request of Object.values(retriesRef.current)) {
      if (
        !request ||
        request.identity !== identity ||
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
  }, [identity, state]);

  async function sendRequest(
    kind: RequestKind,
    body: Record<string, unknown>,
    signatureValue: unknown,
    playId: string,
    roundId?: string,
  ) {
    if (pendingRef.current || actionLoading) return false;

    const signature = requestSignature(
      identity,
      kind,
      playId,
      signatureValue,
      roundId,
    );
    const previous = retriesRef.current[kind];
    const request: RetryRequest =
      previous?.identity === identity && previous.signature === signature
        ? previous
        : {
            kind,
            commandId: crypto.randomUUID(),
            identity,
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

    const sameIdentity = identityRef.current === request.identity;
    const confirmed = sameIdentity && (
      result?.ok === true || responseConfirmsCommand(result, request)
    );
    if (confirmed && retriesRef.current[kind] === request) {
      delete retriesRef.current[kind];
    }
    if (pendingRef.current === request) {
      pendingRef.current = null;
      if (sameIdentity) setPendingKind(null);
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
        return locale === "en" ? "Enter a topic." : "주제를 입력해 주세요.";
      }
      if (topic.length > QUESTION_GAME_LIMITS.topic) {
        return locale === "en"
          ? `Use ${QUESTION_GAME_LIMITS.topic} characters or fewer.`
          : `${QUESTION_GAME_LIMITS.topic}자 이내로 입력해 주세요.`;
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
    if (!confirmed && identityRef.current === identity) {
      setPrepareError(locale === "en"
        ? "Could not prepare the ladder. Try again."
        : "사다리를 준비하지 못했어요. 다시 시도해 주세요.");
    }
  }

  const shellMatchesState = state !== null && roomShellMatchesState(room, state);
  if (!state || !shellMatchesState) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={locale === "en" ? "Checking shared ladder" : "공유 사다리 확인 중"}
          onLeave={onLeave}
        />
        <section className="border-y border-border bg-card px-4 py-6 text-center text-card-foreground sm:px-6">
          <AlertTriangle
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-amber-700 dark:text-amber-300"
          />
          <p className="mt-3 font-black text-foreground">
            {locale === "en"
              ? "The shared ladder could not be loaded safely."
              : "공유 사다리를 안전하게 불러오지 못했어요."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === "en"
              ? "Wait for the room to refresh or leave and join again."
              : "방이 새로 고쳐질 때까지 기다리거나 나간 뒤 다시 참가해 주세요."}
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
          subtitle={locale === "en" ? "Preparing ladder topics" : "사다리 주제 준비"}
          onLeave={onLeave}
        />
        {isHost ? (
          <section className="space-y-5 border-y border-border bg-card px-4 py-6 text-card-foreground sm:px-6">
            <div>
              <h2 className="text-lg font-black text-foreground">
                {text.ladderSetupTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {locale === "en"
                  ? `Enter one topic for each of the ${room.players.length} players.`
                  : `참가자 ${room.players.length}명에게 나눌 주제를 하나씩 입력해 주세요.`}
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
                      disabled={actionLoading || pendingKind !== null}
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
              disabled={actionLoading || pendingKind !== null || !room.playId}
              onClick={() => void prepareLadder()}
              type="button"
            >
              {pendingKind === "ladder-prepare" ? (
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Route className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {locale === "en" ? "Prepare ladder" : "사다리 준비"}
            </Button>
          </section>
        ) : (
          <section className="border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
            <Clock3
              aria-hidden="true"
              className="mx-auto h-10 w-10 text-violet-700 dark:text-violet-300"
            />
            <p className="mt-3 font-black text-foreground">
              {locale === "en"
                ? "The host is preparing the ladder topics."
                : "방장이 사다리 주제를 준비하고 있어요."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {locale === "en" ? "Please wait a moment." : "잠시만 기다려 주세요."}
            </p>
          </section>
        )}
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <LadderResult
        game={game}
        room={room}
        state={state}
        locale={locale}
        onLeave={onLeave}
      />
    );
  }

  const myAssignment = state.assignments.find(
    ({ playerId }) => playerId === myId,
  );
  if (!myAssignment || !state.roundId || !room.playId) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <RoomHeader game={game} room={room} onLeave={onLeave} />
        <section className="border-y border-border bg-card px-4 py-6 text-center text-card-foreground">
          <p className="font-black text-foreground">
            {locale === "en"
              ? "Your ladder assignment could not be loaded safely."
              : "내 사다리 배정을 안전하게 불러오지 못했어요."}
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
    identity,
    playId,
    roundId,
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
      />

      <section className="border-y border-border bg-card px-4 py-4 text-card-foreground sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              {locale === "en" ? "Your assigned topic" : "내 배정 주제"}
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
        aria-label={locale === "en" ? "Current round submissions" : "현재 라운드 제출 현황"}
        className="border-y border-border bg-card px-4 py-4 text-card-foreground sm:px-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black text-foreground">
            {locale === "en" ? "Current round submissions" : "현재 라운드 제출 현황"}
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
                    aria-label={locale === "en" ? "Submitted" : "제출 완료"}
                    className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
                  />
                ) : (
                  <Clock3
                    aria-label={locale === "en" ? "Waiting" : "제출 대기"}
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
              {locale === "en"
                ? "Your current-round question is submitted"
                : "현재 라운드 내 질문 제출 완료"}
            </h2>
          </div>
          <p className="mt-3 break-words text-sm leading-6">{myQuestion.question}</p>
          <p className="mt-2 text-sm font-semibold">
            {locale === "en"
              ? "You can follow the other students' submission status above."
              : "위에서 다른 학생의 제출 현황을 확인할 수 있어요."}
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

function LadderResult({
  game,
  room,
  state,
  locale,
  onLeave,
}: {
  game: BuiltInGame;
  room: GameRoom;
  state: LadderRoomState;
  locale: "ko" | "en";
  onLeave: () => void;
}) {
  const text = getQuestionGameText(locale);
  if (state.endReason === "insufficient-players") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={locale === "en" ? "Ladder ended" : "질문 사다리 종료"}
          onLeave={onLeave}
        />
        <section className="border-y border-border bg-card px-4 py-7 text-center text-card-foreground sm:px-6">
          <AlertTriangle
            aria-hidden="true"
            className="mx-auto h-12 w-12 text-amber-700 dark:text-amber-300"
          />
          <h1 className="mt-3 text-xl font-black text-foreground">
            {locale === "en"
              ? "The ladder ended because there were not enough players."
              : "참가자가 부족해 질문 사다리를 마쳤어요."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === "en"
              ? "Leave the room when you are ready."
              : "확인한 뒤 방을 나가 주세요."}
          </p>
        </section>
      </div>
    );
  }

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
    <div className="mx-auto max-w-4xl space-y-5">
      <RoomHeader
        game={game}
        room={room}
        subtitle={locale === "en" ? "Question ladder result" : "질문 사다리 결과"}
        onLeave={onLeave}
      />
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
            {locale === "en" ? "Questions per student" : "학생별 질문 수"}
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
                  {locale === "en" ? `${result.count} questions` : `질문 ${result.count}개`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="font-black text-foreground">
            {locale === "en" ? "Questions by round" : "라운드별 질문 기록"}
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
                      {locale === "en" ? `Round ${round}` : `${round}라운드`}
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
    </div>
  );
}
