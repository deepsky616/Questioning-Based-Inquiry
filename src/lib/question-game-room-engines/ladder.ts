import { checkProfanity } from "@/lib/profanity";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import { isQuestionFormForLocale } from "@/lib/question-game-i18n";
import {
  assignLadderTopics,
  generateLadderGrid,
  type LadderGrid,
} from "@/lib/question-ladder";
import type {
  EngineStateBase,
  QuestionGameEngineResult,
  QuestionGameRoomEngine,
  QuestionGameRoomEngineContext,
  QuestionGameRoomLeaveContext,
} from "@/lib/question-game-room-engine";
import type { GameRoom, RoomPlayer } from "@/lib/question-games-data";

export interface LadderAssignment {
  playerId: string;
  playerName: string;
  startColumn: number;
  destinationColumn: number;
  topic: string;
}

export interface LadderQuestion {
  roundId: string;
  round: number;
  playerId: string;
  playerName: string;
  topic: string;
  question: string;
  locale: "ko" | "en";
}

export interface LadderRoomState extends EngineStateBase {
  game: "ladder";
  phase: "setup" | "compose" | "done";
  round: number;
  maxRounds: 3;
  topicPool: string[];
  roundTopics: string[];
  grid: boolean[][];
  roundPlayerIds: string[];
  assignments: LadderAssignment[];
  questions: LadderQuestion[];
}

const MAX_ROUNDS = QUESTION_GAME_RULES.ladder.targets.room.count;
const MAX_PLAYERS = QUESTION_GAME_RULES.ladder.multiplayer.max;
const MIN_PLAYERS = QUESTION_GAME_RULES.ladder.multiplayer.min;
const MAX_STORED_QUESTIONS = MAX_PLAYERS * MAX_ROUNDS;
const RECENT_COMMAND_LIMIT = 64;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATE_REQUIRED_KEYS = [
  "stateVersion",
  "game",
  "phase",
  "recentCommandIds",
  "round",
  "maxRounds",
  "topicPool",
  "roundTopics",
  "grid",
  "roundPlayerIds",
  "assignments",
  "questions",
] as const;
const STATE_OPTIONAL_KEYS = ["roundId", "endReason"] as const;
const ASSIGNMENT_KEYS = [
  "playerId",
  "playerName",
  "startColumn",
  "destinationColumn",
  "topic",
] as const;
const QUESTION_KEYS = [
  "roundId",
  "round",
  "playerId",
  "playerName",
  "topic",
  "question",
  "locale",
] as const;
const PREPARE_BODY_KEYS = [
  "commandId",
  "expectedCreatedAt",
  "expectedVersion",
  "playId",
  "topics",
] as const;
const SUBMIT_BODY_KEYS = [
  "commandId",
  "expectedCreatedAt",
  "expectedVersion",
  "playId",
  "roundId",
  "locale",
  "question",
] as const;
const ACTION_BODY_OPTIONAL_KEYS = ["action"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  ) && keys.every((key) => allowed.has(key));
}

function hasExactActionBody(
  context: QuestionGameRoomEngineContext,
  required: readonly string[],
): boolean {
  return hasExactKeys(context.body, required, ACTION_BODY_OPTIONAL_KEYS) &&
    (context.body.action === undefined || context.body.action === context.action);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isStoredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim();
}

function isStoredPlayerId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStoredPlayerName(value: unknown): value is string {
  return typeof value === "string";
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isStringList(
  value: unknown,
  check: (item: unknown) => item is string,
): value is string[] {
  return Array.isArray(value) &&
    Array.from({ length: value.length }, (_, index) => value[index])
      .every(check);
}

function isLadderAssignment(value: unknown): value is LadderAssignment {
  return isRecord(value) &&
    hasExactKeys(value, ASSIGNMENT_KEYS) &&
    isStoredPlayerId(value.playerId) &&
    isStoredPlayerName(value.playerName) &&
    Number.isInteger(value.startColumn) &&
    (value.startColumn as number) >= 0 &&
    Number.isInteger(value.destinationColumn) &&
    (value.destinationColumn as number) >= 0 &&
    isStoredText(value.topic, QUESTION_GAME_LIMITS.topic);
}

function isLadderQuestion(value: unknown): value is LadderQuestion {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, QUESTION_KEYS) ||
    !isUuid(value.roundId) ||
    !Number.isInteger(value.round) ||
    (value.round as number) < 1 ||
    (value.round as number) > MAX_ROUNDS ||
    !isStoredPlayerId(value.playerId) ||
    !isStoredPlayerName(value.playerName) ||
    !isStoredText(value.topic, QUESTION_GAME_LIMITS.topic) ||
    !isStoredText(value.question, QUESTION_GAME_LIMITS.question) ||
    (value.locale !== "ko" && value.locale !== "en")
  ) {
    return false;
  }
  return isQuestionFormForLocale(value.question, value.locale) &&
    !checkProfanity(value.question).flagged;
}

function hasValidCurrentRound(state: LadderRoomState): boolean {
  const playerCount = state.roundPlayerIds.length;
  if (
    playerCount < MIN_PLAYERS ||
    playerCount > MAX_PLAYERS ||
    !isUnique(state.roundPlayerIds) ||
    state.topicPool.length < playerCount ||
    state.topicPool.length > MAX_PLAYERS ||
    state.roundTopics.length !== playerCount ||
    state.assignments.length !== playerCount ||
    !state.roundTopics.every((topic, index) => topic === state.topicPool[index])
  ) {
    return false;
  }

  let expectedAssignments;
  try {
    expectedAssignments = assignLadderTopics(state.roundTopics, state.grid);
  } catch {
    return false;
  }
  return state.assignments.every((assignment, index) => {
    const expected = expectedAssignments[index];
    return expected !== undefined &&
      assignment.playerId === state.roundPlayerIds[index] &&
      assignment.startColumn === expected.startColumn &&
      assignment.destinationColumn === expected.destinationColumn &&
      assignment.topic === expected.topic;
  });
}

function hasValidQuestions(state: LadderRoomState): boolean {
  if (state.questions.length > MAX_STORED_QUESTIONS) return false;

  const keys = new Set<string>();
  const counts = new Map<string, number>();
  const roundIds = new Map<number, string>();
  const idRounds = new Map<string, number>();
  const currentAssignments = new Map(
    state.assignments.map((assignment) => [assignment.playerId, assignment]),
  );

  for (const question of state.questions) {
    if (question.round > state.round) return false;
    const key = `${question.roundId}\u0000${question.playerId}`;
    if (keys.has(key)) return false;
    keys.add(key);

    const priorRoundId = roundIds.get(question.round);
    if (priorRoundId !== undefined && priorRoundId !== question.roundId) {
      return false;
    }
    const priorRound = idRounds.get(question.roundId);
    if (priorRound !== undefined && priorRound !== question.round) return false;
    roundIds.set(question.round, question.roundId);
    idRounds.set(question.roundId, question.round);

    const count = (counts.get(question.playerId) ?? 0) + 1;
    if (count > MAX_ROUNDS) return false;
    counts.set(question.playerId, count);

    if (question.round === state.round) {
      const assignment = currentAssignments.get(question.playerId);
      if (
        question.roundId !== state.roundId ||
        assignment === undefined ||
        question.playerName !== assignment.playerName ||
        question.topic !== assignment.topic
      ) {
        return false;
      }
    }
  }
  return true;
}

function hasRequiredRoundHistory(state: LadderRoomState): boolean {
  for (let round = 1; round < state.round; round += 1) {
    if (state.questions.filter((question) => question.round === round).length <
      MIN_PLAYERS) {
      return false;
    }
  }
  return state.phase !== "done" || state.endReason !== "completed" ||
    state.questions.filter((question) => question.round === state.round).length >=
      MIN_PLAYERS;
}

function hasEmptyRoundData(state: LadderRoomState): boolean {
  return state.topicPool.length === 0 &&
    state.roundTopics.length === 0 &&
    state.grid.length === 0 &&
    state.roundPlayerIds.length === 0 &&
    state.assignments.length === 0 &&
    state.questions.length === 0 &&
    state.roundId === undefined;
}

function hasValidPhase(state: LadderRoomState): boolean {
  if (state.round === 0) {
    return hasEmptyRoundData(state) &&
      (state.phase === "setup"
        ? state.endReason === undefined
        : state.phase === "done" &&
          state.endReason === "insufficient-players");
  }
  if (
    state.round < 1 ||
    state.round > MAX_ROUNDS ||
    !isUuid(state.roundId) ||
    !hasValidCurrentRound(state) ||
    !hasValidQuestions(state) ||
    !hasRequiredRoundHistory(state)
  ) {
    return false;
  }
  if (state.phase === "compose") return state.endReason === undefined;
  if (state.phase !== "done") return false;
  return state.endReason === "insufficient-players" ||
    (state.endReason === "completed" && state.round === MAX_ROUNDS);
}

export function createLadderState(): LadderRoomState {
  return {
    stateVersion: 2,
    game: "ladder",
    phase: "setup",
    recentCommandIds: [],
    round: 0,
    maxRounds: MAX_ROUNDS,
    topicPool: [],
    roundTopics: [],
    grid: [],
    roundPlayerIds: [],
    assignments: [],
    questions: [],
  };
}

export function readLadderState(value: unknown): LadderRoomState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, STATE_REQUIRED_KEYS, STATE_OPTIONAL_KEYS) ||
    value.stateVersion !== 2 ||
    value.game !== "ladder" ||
    (value.phase !== "setup" &&
      value.phase !== "compose" &&
      value.phase !== "done") ||
    !isStringList(value.recentCommandIds, isUuid) ||
    value.recentCommandIds.length > RECENT_COMMAND_LIMIT ||
    !isUnique(value.recentCommandIds) ||
    !Number.isInteger(value.round) ||
    (value.round as number) < 0 ||
    value.maxRounds !== MAX_ROUNDS ||
    !isStringList(
      value.topicPool,
      (item): item is string => isStoredText(item, QUESTION_GAME_LIMITS.topic),
    ) ||
    !isStringList(
      value.roundTopics,
      (item): item is string => isStoredText(item, QUESTION_GAME_LIMITS.topic),
    ) ||
    !Array.isArray(value.grid) ||
    !Array.isArray(value.roundPlayerIds) ||
    !isStringList(
      value.roundPlayerIds,
      isStoredPlayerId,
    ) ||
    !Array.isArray(value.assignments) ||
    !value.assignments.every(isLadderAssignment) ||
    !Array.isArray(value.questions) ||
    !value.questions.every(isLadderQuestion) ||
    (value.roundId !== undefined && !isUuid(value.roundId)) ||
    (value.endReason !== undefined &&
      value.endReason !== "completed" &&
      value.endReason !== "insufficient-players")
  ) {
    return null;
  }

  const state = value as unknown as LadderRoomState;
  return hasValidPhase(state) ? state : null;
}

function invalid(
  context: QuestionGameRoomEngineContext,
  message: string,
): QuestionGameEngineResult {
  return { kind: "invalid", room: context.room, message };
}

function conflict(
  context: QuestionGameRoomEngineContext,
  message: string,
): QuestionGameEngineResult {
  return { kind: "conflict", room: context.room, message };
}

function corrupt(
  context: QuestionGameRoomEngineContext,
  message: string,
): QuestionGameEngineResult {
  return { kind: "corrupt", room: context.room, message };
}

function changed(
  context: QuestionGameRoomEngineContext,
  state: LadderRoomState,
  status: "playing" | "ended" = "playing",
): QuestionGameEngineResult {
  if (!readLadderState(state)) {
    return corrupt(context, "질문 사다리 판정 결과가 손상되었습니다");
  }
  return {
    kind: "changed",
    room: { ...context.room, status, gameState: state },
  };
}

function hasValidRoomPlayers(players: readonly RoomPlayer[]): boolean {
  return players.length >= MIN_PLAYERS &&
    players.length <= MAX_PLAYERS &&
    isUnique(players.map(({ id }) => id)) &&
    players.every(({ id, name }) =>
      isStoredPlayerId(id) && isStoredPlayerName(name)
    );
}

function matchesRoomState(room: GameRoom, state: LadderRoomState): boolean {
  if (!hasValidRoomPlayers(room.players)) return false;
  if (state.phase === "setup") {
    return room.status === "playing";
  }
  if (state.phase === "done") return room.status === "ended";
  if (room.status !== "playing") return false;

  const assignmentById = new Map(
    state.assignments.map((assignment) => [assignment.playerId, assignment]),
  );
  return room.players.every((player) => {
    const assignment = assignmentById.get(player.id);
    return assignment?.playerName === player.name;
  });
}

function buildAssignments(
  players: readonly RoomPlayer[],
  topics: readonly string[],
  grid: LadderGrid,
): LadderAssignment[] {
  return assignLadderTopics(topics, grid).map((assignment, index) => ({
    playerId: players[index].id,
    playerName: players[index].name,
    ...assignment,
  }));
}

function nextRoundState(
  state: LadderRoomState,
  players: readonly RoomPlayer[],
  random: (() => number) | undefined,
  randomUUID: (() => string) | undefined,
): LadderRoomState {
  if (!hasValidRoomPlayers(players) || !random || !randomUUID) {
    throw new Error("missing ladder transition dependency");
  }
  const roundTopics = state.topicPool.slice(0, players.length);
  if (roundTopics.length !== players.length) {
    throw new Error("missing ladder topics");
  }
  const grid = generateLadderGrid(players.length, random);
  const roundId = randomUUID();
  if (!isUuid(roundId)) throw new Error("invalid ladder round id");
  const { endReason: _endReason, ...activeState } = state;
  return {
    ...activeState,
    phase: "compose",
    round: state.round + 1,
    roundId,
    roundTopics,
    grid,
    roundPlayerIds: players.map(({ id }) => id),
    assignments: buildAssignments(players, roundTopics, grid),
  };
}

function prepareLadder(
  context: QuestionGameRoomEngineContext,
  state: LadderRoomState,
): QuestionGameEngineResult {
  if (context.userId !== context.room.hostId) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "방장만 질문 사다리 주제를 준비할 수 있습니다",
    };
  }
  if (state.phase !== "setup") {
    return conflict(context, "질문 사다리를 준비할 단계가 아닙니다");
  }
  if (!hasExactActionBody(context, PREPARE_BODY_KEYS)) {
    return invalid(context, "질문 사다리 준비 자료가 올바르지 않습니다");
  }
  if (!matchesRoomState(context.room, state)) {
    return corrupt(context, "질문 사다리 참가자 상태가 손상되었습니다");
  }
  if (!Array.isArray(context.body.topics) ||
    context.body.topics.length !== context.room.players.length) {
    return invalid(context, "참가자 수와 같은 주제를 입력해 주세요");
  }
  const rawTopics = context.body.topics;
  const topicPool = Array.from(
    { length: rawTopics.length },
    (_, index) => {
      const topic = rawTopics[index];
      return typeof topic === "string" ? topic.trim() : null;
    },
  );
  if (topicPool.some((topic) =>
    topic === null ||
    topic.length === 0 ||
    topic.length > QUESTION_GAME_LIMITS.topic
  )) {
    return invalid(context, "주제를 팔십 자 이내로 입력해 주세요");
  }

  try {
    const roundTopics = topicPool as string[];
    const grid = generateLadderGrid(context.room.players.length, context.random);
    const roundId = context.randomUUID();
    const nextState: LadderRoomState = {
      ...state,
      phase: "compose",
      round: 1,
      roundId,
      topicPool: [...roundTopics],
      roundTopics,
      grid,
      roundPlayerIds: context.room.players.map(({ id }) => id),
      assignments: buildAssignments(context.room.players, roundTopics, grid),
    };
    return changed(context, nextState);
  } catch {
    return corrupt(context, "서버 사다리 자료를 만들 수 없습니다");
  }
}

function hasSubmitted(
  questions: readonly LadderQuestion[],
  roundId: string,
  playerId: string,
): boolean {
  return questions.some((question) =>
    question.roundId === roundId && question.playerId === playerId
  );
}

function activeRoundPlayerIds(
  state: LadderRoomState,
  players: readonly RoomPlayer[],
): string[] {
  const activeIds = new Set(players.map(({ id }) => id));
  return state.roundPlayerIds.filter((playerId) => activeIds.has(playerId));
}

function allActivePlayersSubmitted(
  state: LadderRoomState,
  players: readonly RoomPlayer[],
  questions: readonly LadderQuestion[],
): boolean {
  if (!state.roundId) return false;
  const targets = activeRoundPlayerIds(state, players);
  return targets.length >= MIN_PLAYERS &&
    targets.every((playerId) =>
      hasSubmitted(questions, state.roundId as string, playerId)
    );
}

function submitLadderQuestion(
  context: QuestionGameRoomEngineContext,
  state: LadderRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "compose" || !state.roundId) {
    return conflict(context, "질문을 제출할 단계가 아닙니다");
  }
  if (!hasExactActionBody(context, SUBMIT_BODY_KEYS)) {
    return invalid(context, "질문 제출 자료가 올바르지 않습니다");
  }
  if (!matchesRoomState(context.room, state)) {
    return corrupt(context, "질문 사다리 참가자 상태가 손상되었습니다");
  }
  const assignment = state.assignments.find(
    ({ playerId }) => playerId === context.userId,
  );
  if (
    !state.roundPlayerIds.includes(context.userId) ||
    !assignment ||
    !context.room.players.some(({ id }) => id === context.userId)
  ) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "현재 라운드 참가자만 질문을 제출할 수 있습니다",
    };
  }
  if (hasSubmitted(state.questions, state.roundId, context.userId)) {
    return conflict(context, "이 라운드에는 이미 질문을 제출했습니다");
  }
  const locale = context.body.locale;
  if (locale !== "ko" && locale !== "en") {
    return invalid(context, "질문 언어가 올바르지 않습니다");
  }
  if (typeof context.body.question !== "string") {
    return invalid(context, "질문이 올바르지 않습니다");
  }
  const question = context.body.question.trim();
  if (
    question.length === 0 ||
    question.length > QUESTION_GAME_LIMITS.question ||
    !isQuestionFormForLocale(question, locale)
  ) {
    return invalid(context, "질문을 이백 자 이내의 물음형으로 써 주세요");
  }
  if (checkProfanity(question).flagged) {
    return invalid(context, "비속어가 없는 질문으로 고쳐 주세요");
  }

  const questions: LadderQuestion[] = [
    ...state.questions,
    {
      roundId: state.roundId,
      round: state.round,
      playerId: assignment.playerId,
      playerName: assignment.playerName,
      topic: assignment.topic,
      question,
      locale,
    },
  ];
  if (!allActivePlayersSubmitted(state, context.room.players, questions)) {
    return changed(context, { ...state, questions });
  }
  if (state.round === state.maxRounds) {
    return changed(
      context,
      { ...state, phase: "done", endReason: "completed", questions },
      "ended",
    );
  }
  try {
    return changed(context, nextRoundState(
      { ...state, questions },
      context.room.players,
      context.random,
      context.randomUUID,
    ));
  } catch {
    return corrupt(context, "다음 질문 사다리 라운드를 만들 수 없습니다");
  }
}

export function applyLadderCommand(
  context: QuestionGameRoomEngineContext,
): QuestionGameEngineResult {
  const state = readLadderState(context.state);
  if (!state) {
    return corrupt(context, "질문 사다리 상태가 손상되었습니다");
  }
  if (context.action === "ladder-prepare") {
    return prepareLadder(context, state);
  }
  if (context.action === "ladder-submit-question") {
    return submitLadderQuestion(context, state);
  }
  return invalid(context, "지원하지 않는 질문 사다리 명령입니다");
}

function ladderPlayerLeft(context: QuestionGameRoomLeaveContext): GameRoom {
  const state = readLadderState(context.room.gameState);
  if (!state) throw new Error("corrupt ladder state");
  if (state.phase === "done" || state.phase === "setup") {
    return context.room;
  }
  if (context.room.status !== "playing") {
    throw new Error("invalid ladder room status");
  }

  const activeIds = new Set(context.room.players.map(({ id }) => id));
  if (!context.room.players.every(({ id }) => state.roundPlayerIds.includes(id)) ||
    activeIds.size !== context.room.players.length) {
    throw new Error("corrupt ladder participants");
  }
  if (!allActivePlayersSubmitted(state, context.room.players, state.questions)) {
    return context.room;
  }
  if (state.round === state.maxRounds) {
    const nextState: LadderRoomState = {
      ...state,
      phase: "done",
      endReason: "completed",
    };
    if (!readLadderState(nextState)) throw new Error("corrupt ladder result");
    return { ...context.room, status: "ended", gameState: nextState };
  }

  const nextState = nextRoundState(
    state,
    context.room.players,
    context.random,
    context.randomUUID,
  );
  if (!readLadderState(nextState)) throw new Error("corrupt ladder result");
  return { ...context.room, gameState: nextState };
}

export const ladderQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createLadderState,
  applyCommand: applyLadderCommand,
  onPlayerLeave: ladderPlayerLeft,
};
