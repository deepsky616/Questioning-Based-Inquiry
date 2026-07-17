import type { GameRoom } from "@/lib/question-games-data";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function currentTurnPlayerId(state: Record<string, unknown>): string | null {
  const turnOrder = stringArray(state.turnOrder);
  const currentTurnIdx = state.currentTurnIdx;
  return Number.isInteger(currentTurnIdx) &&
      (currentTurnIdx as number) >= 0 &&
      (currentTurnIdx as number) < turnOrder.length
    ? turnOrder[currentTurnIdx as number] ?? null
    : null;
}

function activeLadderPlayers(state: Record<string, unknown>): string[] {
  if (state.phase !== "compose" || typeof state.roundId !== "string") return [];

  const submitted = new Set(
    Array.isArray(state.questions)
      ? state.questions.flatMap((item) =>
          isRecord(item) &&
            item.roundId === state.roundId &&
            typeof item.playerId === "string"
            ? [item.playerId]
            : [],
        )
      : [],
  );
  return stringArray(state.roundTargetPlayerIds).filter(
    (playerId) => !submitted.has(playerId),
  );
}

function activeMemoryPlayers(
  room: GameRoom,
  state: Record<string, unknown>,
): string[] {
  if (state.phase === "setup") return [room.hostId];
  if (state.phase === "rolling") {
    const diceRolls = isRecord(state.diceRolls) ? state.diceRolls : {};
    return room.players
      .map(({ id }) => id)
      .filter((playerId) => typeof diceRolls[playerId] !== "number");
  }
  if (state.phase !== "play") return [];
  const playerId = currentTurnPlayerId(state);
  return playerId ? [playerId] : [];
}

function activeStoryDicePlayers(
  room: GameRoom,
  state: Record<string, unknown>,
): string[] {
  if (state.phase === "setup") return [room.hostId];
  if (
    state.phase === "roll" ||
    state.phase === "story" ||
    state.phase === "answer"
  ) {
    return typeof state.taggerId === "string" ? [state.taggerId] : [];
  }
  if (state.phase !== "question") return [];
  const playerId = currentTurnPlayerId(state);
  return playerId ? [playerId] : [];
}

/** 현재 방 상태에서 바로 행동할 수 있는 참가자를 반환한다. */
export function activeQuestionGamePlayerIds(room: GameRoom): string[] {
  if (room.status !== "playing" || !isRecord(room.gameState)) return [];

  const state = room.gameState;
  let candidateIds: string[] = [];
  if (room.gameId === "memory") {
    candidateIds = activeMemoryPlayers(room, state);
  } else if (room.gameId === "story-dice") {
    candidateIds = activeStoryDicePlayers(room, state);
  } else if (room.gameId === "ladder") {
    candidateIds = state.phase === "setup"
      ? [room.hostId]
      : activeLadderPlayers(state);
  } else if (room.gameId === "relay" || room.gameId === "kaba") {
    if (state.phase === "setup") candidateIds = [room.hostId];
    else if (state.phase === "question") {
      const playerId = currentTurnPlayerId(state);
      candidateIds = playerId ? [playerId] : [];
    }
  } else if (room.gameId === "dice") {
    if (state.phase === "roll" || state.phase === "question") {
      const playerId = currentTurnPlayerId(state);
      candidateIds = playerId ? [playerId] : [];
    }
  } else if (room.gameId === "mystery-box") {
    if (state.phase === "setup") candidateIds = [room.hostId];
    else if (state.phase === "play") {
      const playerId = currentTurnPlayerId(state);
      candidateIds = playerId ? [playerId] : [];
    }
  }

  const memberIds = new Set(room.players.map(({ id }) => id));
  return [...new Set(candidateIds)].filter((id) => memberIds.has(id));
}
