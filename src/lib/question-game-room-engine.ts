import {
  QUESTION_GAME_LIMITS,
  isBuiltInQuestionGameId,
  type BuiltInQuestionGameId,
} from "@/lib/question-game-rules";
import type { MysteryAnswerResolution } from "@/lib/mystery-box-rules";
import type {
  GameRoom,
  RoomCommandResult,
} from "@/lib/question-games-data";
import { memoryQuestionGameRoomEngine } from "@/lib/question-game-room-engines/memory";
import { mysteryQuestionGameRoomEngine } from "@/lib/question-game-room-engines/mystery";
import { ladderQuestionGameRoomEngine } from "@/lib/question-game-room-engines/ladder";
import {
  diceQuestionGameRoomEngine,
  kabaQuestionGameRoomEngine,
  relayQuestionGameRoomEngine,
  storyDiceQuestionGameRoomEngine,
} from "@/lib/question-game-room-engines/turn-games";
import { isCompletedVersion2QuestionGameRoom } from "@/lib/question-game-room-award-ledger";

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
  endReason?: "completed" | "host" | "insufficient-players";
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
  mysteryAnswerResolution?: MysteryAnswerResolution;
}

export interface QuestionGameRoomEngineContext
  extends Omit<QuestionGameRoomCommandInput, "body" | "room"> {
  room: GameRoom;
  body: Record<string, unknown>;
  state: EngineStateBase | null;
}

type QuestionGameEngineFailure<
  Kind extends "invalid" | "forbidden" | "conflict" | "corrupt",
> = {
  kind: Kind;
  room: GameRoom;
  message: string;
};

export type QuestionGameEngineResult =
  | { kind: "changed"; room: GameRoom; result?: RoomCommandResult }
  | { kind: "replayed"; room: GameRoom; result?: RoomCommandResult }
  | {
      kind: "resolution-required";
      room: GameRoom;
      resolution: Omit<MysteryAnswerResolution, "answer">;
      message: string;
    }
  | QuestionGameEngineFailure<"invalid">
  | QuestionGameEngineFailure<"forbidden">
  | QuestionGameEngineFailure<"conflict">
  | QuestionGameEngineFailure<"corrupt">;

export type QuestionGameRoomEngineApplyResult = QuestionGameEngineResult;

export interface QuestionGameRoomLeaveContext {
  room: GameRoom;
  userId: string;
  wasCurrentTurn?: boolean;
  wasInTurnOrderExactlyOnce?: boolean;
  now?: number;
  random?: () => number;
  randomUUID?: () => string;
  pointAwardSettled?: boolean;
}

export interface QuestionGameRoomRestartContext {
  pointAwardSettled?: boolean;
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

export type QuestionGameRoomResult = QuestionGameEngineResult;

const QUESTION_GAME_ROOM_ENGINES: Partial<
  Record<BuiltInQuestionGameId, QuestionGameRoomEngine>
> = {
  ladder: ladderQuestionGameRoomEngine,
  memory: memoryQuestionGameRoomEngine,
  "mystery-box": mysteryQuestionGameRoomEngine,
  "story-dice": storyDiceQuestionGameRoomEngine,
  dice: diceQuestionGameRoomEngine,
  relay: relayQuestionGameRoomEngine,
  kaba: kabaQuestionGameRoomEngine,
};

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

type QuestionGameFailureKind = Exclude<
  QuestionGameRoomResult["kind"],
  "changed" | "replayed" | "resolution-required"
>;

function unchanged(
  kind: "replayed",
  room: GameRoom,
  result?: RoomCommandResult,
): Extract<QuestionGameRoomResult, { kind: "replayed" }>;
function unchanged(
  kind: QuestionGameFailureKind,
  room: GameRoom,
  message: string,
): QuestionGameRoomResult;
function unchanged(
  kind: "replayed" | QuestionGameFailureKind,
  room: GameRoom,
  detail?: RoomCommandResult | string,
): QuestionGameRoomResult {
  if (kind === "replayed") {
    return detail === undefined
      ? { kind, room }
      : { kind, room, result: detail as RoomCommandResult };
  }
  return { kind, room, message: detail as string };
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
  if (
    value.endReason !== undefined &&
    value.endReason !== "completed" &&
    value.endReason !== "host" &&
    value.endReason !== "insufficient-players"
  ) {
    return null;
  }
  return value as EngineStateBase;
}

function isEmptyRecord(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

function isExactStartBody(body: Record<string, unknown>): boolean {
  const required = ["commandId", "expectedCreatedAt", "expectedVersion"];
  const allowed = new Set([...required, "action"]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(body, key)) &&
    Object.keys(body).every((key) => allowed.has(key)) &&
    (body.action === undefined || body.action === "start");
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
  const engine = isBuiltInQuestionGameId(input.room.gameId)
    ? QUESTION_GAME_ROOM_ENGINES[input.room.gameId]
    : undefined;
  return engine
    ? applyQuestionGameRoomCommandWithEngine(input, engine)
    : applyQuestionGameRoomCommandWithResolvedEngine(input, undefined);
}

export function applyQuestionGameRoomCommandWithEngine(
  input: QuestionGameRoomCommandInput,
  engine: QuestionGameRoomEngine,
): QuestionGameRoomResult {
  return applyQuestionGameRoomCommandWithResolvedEngine(input, engine);
}

function changedRoomWithCommand(
  room: GameRoom,
  candidate: GameRoom,
  commandId: string,
  now: number,
  result?: RoomCommandResult,
): QuestionGameRoomResult {
  const nextState = parseEngineState(candidate.gameState);
  if (!nextState) {
    return unchanged("corrupt", room, "놀이 판정 결과 상태가 손상되었습니다");
  }
  const nextRoom = withCompletionParticipants(room, {
    ...structuredClone(candidate),
    code: room.code,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    gameState: {
      ...nextState,
      recentCommandIds: appendRecentCommandId(
        nextState.recentCommandIds,
        commandId,
      ),
    },
  }, nextState, now);
  const nextStateBytes = serializedBytes(nextRoom.gameState);
  const nextRoomBytes = serializedBytes(nextRoom);
  if (
    nextStateBytes === null ||
    nextStateBytes > QUESTION_GAME_LIMITS.gameStateBytes
  ) {
    return unchanged("invalid", room, "놀이 상태가 너무 큽니다");
  }
  if (
    nextRoomBytes === null ||
    nextRoomBytes > QUESTION_GAME_LIMITS.roomBytes
  ) {
    return unchanged("invalid", room, "방 자료가 너무 큽니다");
  }
  return {
    kind: "changed",
    room: nextRoom,
    ...(result === undefined ? {} : { result }),
  };
}

function withCompletionParticipants(
  previousRoom: GameRoom,
  nextRoom: GameRoom,
  nextState: EngineStateBase | null,
  completionTime: number,
): GameRoom {
  const previousState = parseEngineState(previousRoom.gameState);
  const completedNow =
    nextRoom.status === "ended" &&
    nextState?.phase === "done" &&
    nextState.endReason === "completed" &&
    !(
      previousRoom.status === "ended" &&
      previousState?.phase === "done" &&
      previousState.endReason === "completed"
    );
  return completedNow
    ? {
        ...nextRoom,
        pointCompletedAt: isNonNegativeInteger(completionTime)
          ? completionTime
          : nextRoom.updatedAt,
        pointParticipants: structuredClone(nextRoom.players),
      }
    : previousRoom.pointCompletedAt !== undefined
      ? { ...nextRoom, pointCompletedAt: previousRoom.pointCompletedAt }
      : (() => {
          const {
            pointCompletedAt: _pointCompletedAt,
            ...roomWithoutCompletionTime
          } = nextRoom;
          return roomWithoutCompletionTime;
        })();
}

function applyQuestionGameRoomCommandWithResolvedEngine(
  input: QuestionGameRoomCommandInput,
  engine: QuestionGameRoomEngine | undefined,
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
    mysteryAnswerResolution,
  } = input;

  if (!room.players.some(({ id }) => id === userId)) {
    return unchanged("forbidden", room, "참가자가 아닙니다");
  }
  if (!isRecord(body)) {
    return unchanged("invalid", room, "명령 본문이 올바르지 않습니다");
  }

  const expectedCreatedAt = body.expectedCreatedAt;
  if (!isFiniteNumber(expectedCreatedAt)) {
    return unchanged("invalid", room, "방 생성 시각이 올바르지 않습니다");
  }
  if (expectedCreatedAt !== room.createdAt) {
    return unchanged("conflict", room, "방 생성 시각이 다릅니다");
  }

  const bodyBytes = serializedBytes(body);
  if (
    bodyBytes === null ||
    bodyBytes > QUESTION_GAME_LIMITS.commandBodyBytes
  ) {
    return unchanged("invalid", room, "명령 본문이 너무 큽니다");
  }
  const gameStateBytes = serializedBytes(room.gameState);
  if (
    gameStateBytes === null ||
    gameStateBytes > QUESTION_GAME_LIMITS.gameStateBytes
  ) {
    return unchanged("invalid", room, "놀이 상태가 너무 큽니다");
  }
  const roomBytes = serializedBytes(room);
  if (roomBytes === null || roomBytes > QUESTION_GAME_LIMITS.roomBytes) {
    return unchanged("invalid", room, "방 자료가 너무 큽니다");
  }

  if (!isQuestionGameCommandId(body.commandId)) {
    return unchanged("invalid", room, "명령 식별값이 올바르지 않습니다");
  }

  const state = isEmptyRecord(room.gameState)
    ? null
    : parseEngineState(room.gameState);
  if (state === null && !isEmptyRecord(room.gameState)) {
    return unchanged("corrupt", room, "놀이 상태가 손상되었습니다");
  }

  const isStart = action === "start";
  const isEmptyRestart = action === "restart" && state === null;
  if (isStart && !isExactStartBody(body)) {
    return unchanged("invalid", room, "시작 입력이 올바르지 않습니다");
  }
  if (!isStart && !isEmptyRestart && state !== null) {
    if (room.playId === undefined) {
      return unchanged("corrupt", room, "실행 식별값이 없습니다");
    }
    if (body.playId !== room.playId) {
      return unchanged("conflict", room, "실행 식별값이 다릅니다");
    }
  }

  if (state?.recentCommandIds.includes(body.commandId)) {
    return unchanged("replayed", room);
  }

  if (
    !isStart &&
    !isEmptyRestart &&
    state?.roundId &&
    body.roundId !== state.roundId
  ) {
    return unchanged("conflict", room, "라운드 식별값이 다릅니다");
  }

  if (!isNonNegativeInteger(body.expectedVersion)) {
    return unchanged("invalid", room, "기대 버전이 올바르지 않습니다");
  }
  const staleVersion = body.expectedVersion !== room.version;

  if (!isBuiltInQuestionGameId(room.gameId)) {
    return unchanged("corrupt", room, "놀이 식별값이 올바르지 않습니다");
  }
  if (!engine) {
    return unchanged("corrupt", room, "등록된 놀이 판정기가 없습니다");
  }

  if (isStart && staleVersion) {
    return unchanged("conflict", room, "기대 버전이 다릅니다");
  }

  let invalidRandomUUID = false;
  const checkedRandomUUID = () => {
    const value = randomUUID();
    if (!isQuestionGameCommandId(value)) {
      invalidRandomUUID = true;
      throw new Error("invalid random UUID");
    }
    return value;
  };

  if (isStart) {
    let startRoom: GameRoom;
    let initialState: EngineStateBase;
    try {
      startRoom = {
        ...structuredClone(room),
        status: "playing",
        playId: checkedRandomUUID(),
        pointAwardKeyVersion: 2,
        pointEvidenceVersion: 2,
        pointCompletedAt: undefined,
      };
      initialState = engine.createInitialState({
        room: structuredClone(startRoom),
        userId,
        userName,
        action,
        body: structuredClone(body),
        state: null,
        now,
        random,
        randomUUID: checkedRandomUUID,
        mysteryAnswerResolution,
      });
    } catch {
      return unchanged(
        "corrupt",
        room,
        invalidRandomUUID
          ? "서버 식별값이 올바르지 않습니다"
          : "놀이 판정에 실패했습니다",
      );
    }
    if (invalidRandomUUID) {
      return unchanged("corrupt", room, "서버 식별값이 올바르지 않습니다");
    }
    return changedRoomWithCommand(
      room,
      { ...startRoom, gameState: structuredClone(initialState) },
      body.commandId,
      now,
    );
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
      randomUUID: checkedRandomUUID,
      mysteryAnswerResolution,
    });
  } catch {
    return unchanged(
      "corrupt",
      room,
      invalidRandomUUID
        ? "서버 식별값이 올바르지 않습니다"
        : "놀이 판정에 실패했습니다",
    );
  }
  if (invalidRandomUUID) {
    return unchanged("corrupt", room, "서버 식별값이 올바르지 않습니다");
  }

  if (staleVersion) {
    return engineResult.kind === "replayed"
      ? unchanged("replayed", room, engineResult.result)
      : unchanged("conflict", room, "기대 버전이 다릅니다");
  }

  if (engineResult.kind === "replayed") {
    return unchanged("replayed", room, engineResult.result);
  }
  if (engineResult.kind === "resolution-required") {
    return {
      ...engineResult,
      room,
      resolution: structuredClone(engineResult.resolution),
    };
  }
  if (engineResult.kind !== "changed") {
    return unchanged(engineResult.kind, room, engineResult.message);
  }

  return changedRoomWithCommand(
    room,
    engineResult.room,
    body.commandId,
    now,
    engineResult.result,
  );
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
  const engine = isBuiltInQuestionGameId(input.room.gameId)
    ? QUESTION_GAME_ROOM_ENGINES[input.room.gameId]
    : undefined;
  return engine
    ? leaveQuestionGameRoomWithEngine(input, engine)
    : leaveQuestionGameRoomWithResolvedEngine(input, undefined);
}

export function leaveQuestionGameRoomWithEngine(
  input: QuestionGameRoomLeaveContext,
  engine: QuestionGameRoomEngine,
): QuestionGameRoomResult {
  return leaveQuestionGameRoomWithResolvedEngine(input, engine);
}

function leaveQuestionGameRoomWithResolvedEngine(
  input: QuestionGameRoomLeaveContext,
  engine: QuestionGameRoomEngine | undefined,
): QuestionGameRoomResult {
  const { room, userId } = input;
  if (!room.players.some(({ id }) => id === userId)) {
    return unchanged("replayed", room);
  }

  const remainingPlayers = room.players.filter(({ id }) => id !== userId);
  if (
    remainingPlayers.length === 0 &&
    isCompletedVersion2QuestionGameRoom(room) &&
    input.pointAwardSettled !== true
  ) {
    return unchanged(
      "conflict",
      room,
      "포인트 지급을 확인한 뒤 방을 나갈 수 있습니다",
    );
  }
  const nextHostId = remainingPlayers.some(({ id }) => id === room.hostId)
    ? room.hostId
    : (remainingPlayers[0]?.id ?? "");
  const players = remainingPlayers.map((player) => ({
    ...player,
    isHost: player.id === nextHostId,
  }));

  if (room.status === "ended") {
    return {
      kind: "changed",
      room: {
        ...structuredClone(room),
        hostId: nextHostId,
        players: structuredClone(players),
      },
    };
  }

  const oldState = isRecord(room.gameState) ? room.gameState : {};
  const gameState: Record<string, unknown> = { ...oldState };
  let adjustedTurn:
    | { turnOrder: string[]; currentTurnIdx: number }
    | undefined;
  let wasCurrentTurn = false;
  let wasInTurnOrderExactlyOnce = false;
  if (
    Array.isArray(oldState.turnOrder) &&
    oldState.turnOrder.every((id) => typeof id === "string") &&
    isNonNegativeInteger(oldState.currentTurnIdx)
  ) {
    const oldTurnOrder = oldState.turnOrder;
    wasCurrentTurn = oldTurnOrder[oldState.currentTurnIdx] === userId;
    const removedTurnIndex = oldTurnOrder.indexOf(userId);
    wasInTurnOrderExactlyOnce = oldTurnOrder.filter(
      (playerId) => playerId === userId,
    ).length === 1;
    const turnOrder = oldTurnOrder.filter((id) => id !== userId);
    adjustedTurn = {
      turnOrder,
      currentTurnIdx: adjustedTurnIndex(
        oldTurnOrder.length,
        oldState.currentTurnIdx,
        removedTurnIndex,
        turnOrder.length,
      ),
    };
    gameState.turnOrder = adjustedTurn.turnOrder;
    gameState.currentTurnIdx = adjustedTurn.currentTurnIdx;
  }

  const shouldEnd = room.status === "playing" && players.length === 1;
  if (shouldEnd) {
    gameState.phase = "done";
    gameState.endReason = "insufficient-players";
  }

  const commonRoom: GameRoom = {
    ...structuredClone(room),
    hostId: nextHostId,
    status: shouldEnd ? "ended" : room.status,
    players,
    gameState,
    version: room.version,
    updatedAt: room.updatedAt,
  };

  let hookRoom = commonRoom;
  if (engine?.onPlayerLeave) {
    try {
      hookRoom = engine.onPlayerLeave({
        ...input,
        room: structuredClone(commonRoom),
        wasCurrentTurn,
        wasInTurnOrderExactlyOnce,
      });
    } catch {
      return unchanged("corrupt", room, "이탈 처리를 마치지 못했습니다");
    }
  }

  const hookState = isRecord(hookRoom.gameState)
    ? hookRoom.gameState
    : commonRoom.gameState;
  const finalState: Record<string, unknown> = { ...hookState };
  if (adjustedTurn) {
    const hookTurnOrder = Array.isArray(hookState.turnOrder) &&
      hookState.turnOrder.every((id) => typeof id === "string")
      ? hookState.turnOrder as string[]
      : null;
    const hookTurnIndex = isNonNegativeInteger(hookState.currentTurnIdx)
      ? hookState.currentTurnIdx
      : null;
    const activeIds = new Set(players.map(({ id }) => id));
    const hookTurnSet = new Set(hookTurnOrder ?? []);
    const adjustedTurnSet = new Set(adjustedTurn.turnOrder);
    const matchesAdjustedTurn =
      hookTurnOrder !== null &&
      hookTurnSet.size === adjustedTurnSet.size &&
      [...hookTurnSet].every((id) => adjustedTurnSet.has(id));
    const matchesAllPlayers =
      hookTurnOrder !== null &&
      hookTurnSet.size === activeIds.size &&
      [...hookTurnSet].every((id) => activeIds.has(id));
    const matchesStoryQuestioners =
      room.gameId === "story-dice" &&
      typeof hookState.taggerId === "string" &&
      hookTurnOrder !== null &&
      hookTurnSet.size === activeIds.size - 1 &&
      !hookTurnSet.has(hookState.taggerId) &&
      activeIds.has(hookState.taggerId) &&
      [...activeIds].every((id) =>
        id === hookState.taggerId || hookTurnSet.has(id)
      );
    const validHookTurn =
      hookTurnOrder !== null &&
      hookTurnSet.size === hookTurnOrder.length &&
      hookTurnOrder.every((id) => activeIds.has(id)) &&
      (matchesAdjustedTurn || matchesAllPlayers || matchesStoryQuestioners) &&
      hookTurnIndex !== null &&
      (hookTurnOrder.length === 0
        ? hookTurnIndex === 0
        : hookTurnIndex < hookTurnOrder.length);
    finalState.turnOrder = validHookTurn
      ? hookTurnOrder
      : adjustedTurn.turnOrder;
    finalState.currentTurnIdx = validHookTurn
      ? hookTurnIndex
      : adjustedTurn.currentTurnIdx;
  }
  if (shouldEnd) {
    finalState.phase = "done";
    finalState.endReason = "insufficient-players";
  }
  const nextState = parseEngineState(finalState);
  const nextRoom = withCompletionParticipants(room, {
    ...structuredClone(hookRoom),
    code: room.code,
    gameId: room.gameId,
    createdAt: room.createdAt,
    version: room.version,
    updatedAt: room.updatedAt,
    playId: room.playId,
    pointAwardKeyVersion: room.pointAwardKeyVersion,
    pointEvidenceVersion: room.pointEvidenceVersion,
    hostId: nextHostId,
    players: structuredClone(players),
    status: shouldEnd ? "ended" : hookRoom.status,
    gameState: finalState,
  }, nextState, input.now ?? room.updatedAt);

  return { kind: "changed", room: nextRoom };
}

export function restartQuestionGameRoom(
  room: GameRoom,
  context: QuestionGameRoomRestartContext = {},
): QuestionGameRoomResult {
  if (
    isCompletedVersion2QuestionGameRoom(room) &&
    context.pointAwardSettled !== true
  ) {
    return unchanged(
      "conflict",
      room,
      "포인트 지급을 확인한 뒤 다시 시작할 수 있습니다",
    );
  }
  const alreadyRestarted =
    room.status === "waiting" &&
    room.topic === "" &&
    room.chain.length === 0 &&
    room.turnIndex === 0 &&
    isEmptyRecord(room.gameState) &&
    room.playId === undefined &&
    room.pointAwardKeyVersion === undefined &&
    room.pointEvidenceVersion === undefined &&
    room.pointCompletedAt === undefined &&
    room.pointParticipants === undefined &&
    room.awardResult === undefined;
  if (alreadyRestarted) {
    return unchanged("replayed", room);
  }

  const {
    playId: _playId,
    pointAwardKeyVersion: _pointAwardKeyVersion,
    pointEvidenceVersion: _pointEvidenceVersion,
    pointCompletedAt: _pointCompletedAt,
    pointParticipants: _pointParticipants,
    awardResult: _awardResult,
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
