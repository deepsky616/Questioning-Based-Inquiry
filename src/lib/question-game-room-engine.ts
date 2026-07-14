import {
  QUESTION_GAME_LIMITS,
  isBuiltInQuestionGameId,
  type BuiltInQuestionGameId,
} from "@/lib/question-game-rules";
import type { GameRoom } from "@/lib/question-games-data";

const RECENT_COMMAND_LIMIT = 64;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface EngineStateBase {
  stateVersion: 2;
  phase: string;
  recentCommandIds: string[];
  roundId?: string;
  round?: number;
  maxRounds?: number;
  endReason?: string;
  [key: string]: unknown;
}

export interface QuestionGameRoomCommandInput {
  room: GameRoom;
  userId: string;
  userName: string;
  action: string;
  body: unknown;
  now: number;
  random: () => number;
  randomUUID: () => string;
}

export interface QuestionGameRoomEngineContext
  extends Omit<QuestionGameRoomCommandInput, "body" | "room"> {
  room: GameRoom;
  body: Record<string, unknown>;
  state: EngineStateBase | null;
}

export type QuestionGameRoomEngineApplyResult =
  | { kind: "changed"; room: GameRoom; result?: Record<string, unknown> }
  | {
      kind: "replayed" | "invalid" | "forbidden" | "conflict" | "corrupt";
      reason?: string;
      result?: Record<string, unknown>;
    };

export interface QuestionGameRoomLeaveContext {
  room: GameRoom;
  userId: string;
  now?: number;
  random?: () => number;
  randomUUID?: () => string;
}

export interface QuestionGameRoomEngine {
  createInitialState: (
    context: QuestionGameRoomEngineContext,
  ) => EngineStateBase;
  applyCommand: (
    context: QuestionGameRoomEngineContext,
  ) => QuestionGameRoomEngineApplyResult;
  onPlayerLeave?: (context: QuestionGameRoomLeaveContext) => GameRoom;
}

export type QuestionGameRoomResult =
  | {
      kind: "changed";
      room: GameRoom;
      result?: Record<string, unknown>;
    }
  | {
      kind: "replayed" | "invalid" | "forbidden" | "conflict" | "corrupt";
      room: GameRoom;
      reason?: string;
      result?: Record<string, unknown>;
    };

const QUESTION_GAME_ROOM_ENGINES: Partial<
  Record<BuiltInQuestionGameId, QuestionGameRoomEngine>
> = {};

export function hasQuestionGameRoomEngine(gameId: string): boolean {
  return (
    isBuiltInQuestionGameId(gameId) &&
    QUESTION_GAME_ROOM_ENGINES[gameId] !== undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function serializedBytes(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? null
      : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return null;
  }
}

function unchanged(
  kind: Exclude<QuestionGameRoomResult["kind"], "changed">,
  room: GameRoom,
  reason?: string,
): QuestionGameRoomResult {
  return reason === undefined ? { kind, room } : { kind, room, reason };
}

function parseEngineState(value: unknown): EngineStateBase | null {
  if (
    !isRecord(value) ||
    value.stateVersion !== 2 ||
    typeof value.phase !== "string" ||
    value.phase.length === 0 ||
    !Array.isArray(value.recentCommandIds) ||
    value.recentCommandIds.length > RECENT_COMMAND_LIMIT ||
    !value.recentCommandIds.every(isQuestionGameCommandId)
  ) {
    return null;
  }
  if (
    value.roundId !== undefined &&
    !isQuestionGameCommandId(value.roundId)
  ) {
    return null;
  }
  if (
    value.round !== undefined &&
    !isNonNegativeInteger(value.round)
  ) {
    return null;
  }
  if (
    value.maxRounds !== undefined &&
    !isNonNegativeInteger(value.maxRounds)
  ) {
    return null;
  }
  if (value.endReason !== undefined && typeof value.endReason !== "string") {
    return null;
  }
  return value as EngineStateBase;
}

function isEmptyRecord(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isQuestionGameCommandId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function appendRecentCommandId(
  commandIds: readonly string[],
  commandId: string,
): string[] {
  const retained = commandIds.slice(
    Math.max(0, commandIds.length - (RECENT_COMMAND_LIMIT - 1)),
  );
  return [...retained, commandId];
}

export function applyQuestionGameRoomCommand(
  input: QuestionGameRoomCommandInput,
): QuestionGameRoomResult {
  const {
    room,
    userId,
    userName,
    action,
    body,
    now,
    random,
    randomUUID,
  } = input;

  if (!room.players.some(({ id }) => id === userId)) {
    return unchanged("forbidden", room, "not-player");
  }
  if (!isRecord(body)) {
    return unchanged("invalid", room, "command-body");
  }

  const expectedCreatedAt = body.expectedCreatedAt;
  if (!isFiniteNumber(expectedCreatedAt)) {
    return unchanged("invalid", room, "expected-created-at");
  }
  if (expectedCreatedAt !== room.createdAt) {
    return unchanged("conflict", room, "created-at");
  }

  const bodyBytes = serializedBytes(body);
  if (
    bodyBytes === null ||
    bodyBytes > QUESTION_GAME_LIMITS.commandBodyBytes
  ) {
    return unchanged("invalid", room, "command-body-size");
  }
  const gameStateBytes = serializedBytes(room.gameState);
  if (
    gameStateBytes === null ||
    gameStateBytes > QUESTION_GAME_LIMITS.gameStateBytes
  ) {
    return unchanged("invalid", room, "game-state-size");
  }
  const roomBytes = serializedBytes(room);
  if (roomBytes === null || roomBytes > QUESTION_GAME_LIMITS.roomBytes) {
    return unchanged("invalid", room, "room-size");
  }

  if (!isQuestionGameCommandId(body.commandId)) {
    return unchanged("invalid", room, "command-id");
  }

  const state = isEmptyRecord(room.gameState)
    ? null
    : parseEngineState(room.gameState);
  if (state === null && !isEmptyRecord(room.gameState)) {
    return unchanged("corrupt", room, "game-state");
  }

  if (state?.recentCommandIds.includes(body.commandId)) {
    return unchanged("replayed", room);
  }

  if (!isNonNegativeInteger(body.expectedVersion)) {
    return unchanged("invalid", room, "expected-version");
  }
  if (body.expectedVersion !== room.version) {
    return unchanged("conflict", room, "expected-version");
  }

  const isStart = action === "start";
  const isEmptyRestart = action === "restart" && state === null;
  if (!isStart && !isEmptyRestart && room.status === "playing" && room.playId) {
    if (body.playId !== room.playId) {
      return unchanged("conflict", room, "play-id");
    }
    if (state?.roundId && body.roundId !== state.roundId) {
      return unchanged("conflict", room, "round-id");
    }
  }

  if (!isBuiltInQuestionGameId(room.gameId)) {
    return unchanged("corrupt", room, "game-id");
  }
  const engine = QUESTION_GAME_ROOM_ENGINES[room.gameId];
  if (!engine) {
    return unchanged("corrupt", room, "missing-engine");
  }

  let engineResult: QuestionGameRoomEngineApplyResult;
  try {
    engineResult = engine.applyCommand({
      room: structuredClone(room),
      userId,
      userName,
      action,
      body: structuredClone(body),
      state: state ? structuredClone(state) : null,
      now,
      random,
      randomUUID,
    });
  } catch {
    return unchanged("corrupt", room, "engine-error");
  }

  if (engineResult.kind !== "changed") {
    return {
      kind: engineResult.kind,
      room,
      ...(engineResult.reason === undefined
        ? {}
        : { reason: engineResult.reason }),
      ...(engineResult.result === undefined
        ? {}
        : { result: engineResult.result }),
    };
  }

  const nextState = parseEngineState(engineResult.room.gameState);
  if (!nextState) {
    return unchanged("corrupt", room, "engine-state");
  }
  const nextRoom: GameRoom = {
    ...structuredClone(engineResult.room),
    code: room.code,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    gameState: {
      ...nextState,
      recentCommandIds: appendRecentCommandId(
        nextState.recentCommandIds,
        body.commandId,
      ),
    },
  };
  const nextStateBytes = serializedBytes(nextRoom.gameState);
  const nextRoomBytes = serializedBytes(nextRoom);
  if (
    nextStateBytes === null ||
    nextStateBytes > QUESTION_GAME_LIMITS.gameStateBytes
  ) {
    return unchanged("invalid", room, "game-state-size");
  }
  if (
    nextRoomBytes === null ||
    nextRoomBytes > QUESTION_GAME_LIMITS.roomBytes
  ) {
    return unchanged("invalid", room, "room-size");
  }
  return {
    kind: "changed",
    room: nextRoom,
    ...(engineResult.result === undefined
      ? {}
      : { result: engineResult.result }),
  };
}

function adjustedTurnIndex(
  oldLength: number,
  oldIndex: number,
  removedIndex: number,
  newLength: number,
): number {
  if (newLength === 0) return 0;
  const currentIndex = Math.min(Math.max(oldIndex, 0), oldLength - 1);
  if (removedIndex < 0 || removedIndex > currentIndex) return currentIndex;
  if (removedIndex < currentIndex) return currentIndex - 1;
  return currentIndex >= newLength ? 0 : currentIndex;
}

export function leaveQuestionGameRoom(
  input: QuestionGameRoomLeaveContext,
): QuestionGameRoomResult {
  const { room, userId } = input;
  if (!room.players.some(({ id }) => id === userId)) {
    return unchanged("replayed", room);
  }

  const remainingPlayers = room.players.filter(({ id }) => id !== userId);
  const nextHostId = remainingPlayers.some(({ id }) => id === room.hostId)
    ? room.hostId
    : (remainingPlayers[0]?.id ?? "");
  const players = remainingPlayers.map((player) => ({
    ...player,
    isHost: player.id === nextHostId,
  }));

  const oldState = isRecord(room.gameState) ? room.gameState : {};
  const gameState: Record<string, unknown> = { ...oldState };
  if (
    Array.isArray(oldState.turnOrder) &&
    oldState.turnOrder.every((id) => typeof id === "string") &&
    isNonNegativeInteger(oldState.currentTurnIdx)
  ) {
    const oldTurnOrder = oldState.turnOrder;
    const removedTurnIndex = oldTurnOrder.indexOf(userId);
    const turnOrder = oldTurnOrder.filter((id) => id !== userId);
    gameState.turnOrder = turnOrder;
    gameState.currentTurnIdx = adjustedTurnIndex(
      oldTurnOrder.length,
      oldState.currentTurnIdx,
      removedTurnIndex,
      turnOrder.length,
    );
  }

  const shouldEnd = room.status === "playing" && players.length === 1;
  if (shouldEnd) {
    gameState.phase = "ended";
    gameState.endReason = "insufficient-players";
  }

  let nextRoom: GameRoom = {
    ...structuredClone(room),
    hostId: nextHostId,
    status: shouldEnd ? "ended" : room.status,
    players,
    gameState,
    version: room.version,
    updatedAt: room.updatedAt,
  };

  if (isBuiltInQuestionGameId(room.gameId)) {
    const onPlayerLeave = QUESTION_GAME_ROOM_ENGINES[room.gameId]?.onPlayerLeave;
    if (onPlayerLeave) {
      try {
        nextRoom = onPlayerLeave({ ...input, room: structuredClone(nextRoom) });
      } catch {
        return unchanged("corrupt", room, "leave-hook-error");
      }
      nextRoom = {
        ...structuredClone(nextRoom),
        code: room.code,
        createdAt: room.createdAt,
        version: room.version,
        updatedAt: room.updatedAt,
      };
    }
  }

  return { kind: "changed", room: nextRoom };
}

export function restartQuestionGameRoom(room: GameRoom): QuestionGameRoomResult {
  const alreadyRestarted =
    room.status === "waiting" &&
    room.topic === "" &&
    room.chain.length === 0 &&
    room.turnIndex === 0 &&
    isEmptyRecord(room.gameState) &&
    room.playId === undefined &&
    room.pointAwardKeyVersion === undefined &&
    room.pointEvidenceVersion === undefined;
  if (alreadyRestarted) {
    return unchanged("replayed", room);
  }

  const {
    playId: _playId,
    pointAwardKeyVersion: _pointAwardKeyVersion,
    pointEvidenceVersion: _pointEvidenceVersion,
    ...roomWithoutExecution
  } = structuredClone(room);
  return {
    kind: "changed",
    room: {
      ...roomWithoutExecution,
      status: "waiting",
      topic: "",
      chain: [],
      turnIndex: 0,
      gameState: {},
    },
  };
}
