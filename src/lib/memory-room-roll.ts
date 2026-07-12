import { saveGameRoom } from "@/lib/game-room-store";
import {
  isMemoryRollRoundId,
  resolveMemoryRollRoundId,
} from "@/lib/memory-game-data";
import type { GameRoom } from "@/lib/question-games-data";

export type MemoryRollConflictReason =
  | "round"
  | "value"
  | "phase"
  | "retry-exhausted";

export type MemoryRollResult =
  | { kind: "saved"; room: GameRoom; roll: number; replayed: false }
  | { kind: "replayed"; room: GameRoom; roll: number; replayed: true }
  | { kind: "conflict"; room: GameRoom; reason: MemoryRollConflictReason }
  | { kind: "invalid"; room: GameRoom; reason: "game" | "roll" | "round" }
  | { kind: "forbidden"; room: GameRoom }
  | { kind: "missing"; room: null }
  | { kind: "corrupt"; room: GameRoom };

export interface RecordMemoryRollInput {
  initialRoom: GameRoom;
  userId: string;
  roll: unknown;
  rollRoundId: unknown;
}

type MemoryRollEvaluation =
  | MemoryRollResult
  | { kind: "candidate"; room: GameRoom; roll: number };

function isDiceRollMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isDiceRoll)
  );
}

function isDiceRoll(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 6
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((item, index) => item === right[index]);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function settleMemoryRollingRoom(room: GameRoom): GameRoom {
  const state = room.gameState;
  if (
    room.gameId !== "memory" ||
    (state.phase !== "rolling" && state.phase !== "play") ||
    !isDiceRollMap(state.diceRolls)
  ) {
    return room;
  }

  const playerIds = new Set(room.players.map((player) => player.id));
  const diceRolls = Object.fromEntries(
    Object.entries(state.diceRolls).filter(([playerId]) =>
      playerIds.has(playerId),
    ),
  );
  const removedRoll =
    Object.keys(diceRolls).length !== Object.keys(state.diceRolls).length;

  if (state.phase === "play") {
    if (
      !isStringArray(state.turnOrder) ||
      !isNonNegativeInteger(state.currentTurnIdx) ||
      (state.turnOrder.length > 0 &&
        state.currentTurnIdx >= state.turnOrder.length)
    ) {
      return room;
    }

    const oldTurnOrder = state.turnOrder;
    const oldCurrentTurnIdx = state.currentTurnIdx;
    const oldCurrentPlayerId = oldTurnOrder[oldCurrentTurnIdx];
    const seen = new Set<string>();
    const turnOrder = oldTurnOrder.filter((playerId) => {
      if (!playerIds.has(playerId) || seen.has(playerId)) return false;
      seen.add(playerId);
      return true;
    });
    for (const player of room.players) {
      if (!seen.has(player.id)) {
        seen.add(player.id);
        turnOrder.push(player.id);
      }
    }

    let nextCurrentPlayerId: string | undefined = oldCurrentPlayerId;
    if (!nextCurrentPlayerId || !playerIds.has(nextCurrentPlayerId)) {
      nextCurrentPlayerId = undefined;
      for (let offset = 1; offset <= oldTurnOrder.length; offset += 1) {
        const candidate = oldTurnOrder[
          (oldCurrentTurnIdx + offset) % oldTurnOrder.length
        ];
        if (playerIds.has(candidate)) {
          nextCurrentPlayerId = candidate;
          break;
        }
      }
    }
    if (!nextCurrentPlayerId) nextCurrentPlayerId = turnOrder[0];
    const currentTurnIdx = Math.max(
      0,
      turnOrder.indexOf(nextCurrentPlayerId),
    );
    const currentPlayerLeft =
      oldCurrentPlayerId !== undefined && !playerIds.has(oldCurrentPlayerId);
    const lastRevealPlayerLeft =
      isRecord(state.lastReveal) &&
      typeof state.lastReveal.turnPlayerId === "string" &&
      !playerIds.has(state.lastReveal.turnPlayerId);
    const clearTurnArtifacts = currentPlayerLeft || lastRevealPlayerLeft;
    const changed =
      removedRoll ||
      !sameStringArray(turnOrder, oldTurnOrder) ||
      currentTurnIdx !== oldCurrentTurnIdx ||
      clearTurnArtifacts;

    if (!changed) return room;
    const nextState: Record<string, unknown> = {
      ...state,
      diceRolls,
      turnOrder,
      currentTurnIdx,
    };
    if (clearTurnArtifacts) {
      nextState.revealedIds = [];
      delete nextState.lastReveal;
    }
    return { ...room, gameState: nextState };
  }

  const rollRoundId = resolveMemoryRollRoundId(room, state.rollRoundId);
  if (!rollRoundId) return room;
  const addedRoundId = state.rollRoundId === undefined;

  const isComplete =
    room.players.length > 0 &&
    room.players.every((player) => diceRolls[player.id] !== undefined);

  if (!removedRoll && !addedRoundId && !isComplete) return room;

  const nextState: Record<string, unknown> = {
    ...state,
    diceRolls,
    rollRoundId,
  };

  if (isComplete) {
    nextState.phase = "play";
    nextState.currentTurnIdx = 0;
    nextState.turnOrder = [...room.players]
      .sort((a, b) => {
        const rollDiff = diceRolls[b.id] - diceRolls[a.id];
        if (rollDiff !== 0) return rollDiff;
        if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((player) => player.id);
  }

  return { ...room, gameState: nextState };
}

function evaluateMemoryRoll(
  room: GameRoom,
  input: RecordMemoryRollInput,
): MemoryRollEvaluation {
  if (room.gameId !== "memory") {
    return { kind: "invalid", room, reason: "game" };
  }
  if (!room.players.some((player) => player.id === input.userId)) {
    return { kind: "forbidden", room };
  }

  const state = room.gameState;
  if (typeof state.phase !== "string" || !isDiceRollMap(state.diceRolls)) {
    return { kind: "corrupt", room };
  }
  if (!isDiceRoll(input.roll)) {
    return { kind: "invalid", room, reason: "roll" };
  }
  if (!isMemoryRollRoundId(input.rollRoundId)) {
    return { kind: "invalid", room, reason: "round" };
  }

  const currentRoundId = resolveMemoryRollRoundId(room, state.rollRoundId);
  if (!currentRoundId) return { kind: "corrupt", room };
  if (input.rollRoundId !== currentRoundId) {
    return { kind: "conflict", room, reason: "round" };
  }

  const existing = state.diceRolls[input.userId];
  if (existing === input.roll) {
    return {
      kind: "replayed",
      room,
      roll: existing,
      replayed: true,
    };
  }
  if (existing !== undefined) {
    return { kind: "conflict", room, reason: "value" };
  }
  if (state.phase !== "rolling") {
    return { kind: "conflict", room, reason: "phase" };
  }

  const candidate = settleMemoryRollingRoom({
    ...room,
    gameState: {
      ...state,
      rollRoundId: currentRoundId,
      diceRolls: {
        ...state.diceRolls,
        [input.userId]: input.roll,
      },
    },
  });
  return { kind: "candidate", room: candidate, roll: input.roll };
}

const MEMORY_ROLL_WRITE_ATTEMPTS = 3;

export async function recordMemoryRoll(
  input: RecordMemoryRollInput,
): Promise<MemoryRollResult> {
  let room = input.initialRoom;

  for (
    let attempt = 0;
    attempt < MEMORY_ROLL_WRITE_ATTEMPTS;
    attempt += 1
  ) {
    const evaluated = evaluateMemoryRoll(room, input);
    if (evaluated.kind !== "candidate") return evaluated;

    const saved = await saveGameRoom(evaluated.room);
    if (saved.kind === "saved") {
      return {
        kind: "saved",
        room: saved.room,
        roll: evaluated.roll,
        replayed: false,
      };
    }
    if (saved.kind === "missing") return { kind: "missing", room: null };
    room = saved.room;
  }

  const final = evaluateMemoryRoll(room, input);
  if (final.kind !== "candidate") return final;
  return { kind: "conflict", room, reason: "retry-exhausted" };
}
