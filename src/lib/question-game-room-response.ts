import type {
  GameRoom,
  RoomCommandResult,
} from "@/lib/question-games-data";
import { toPublicMysteryState } from "@/lib/question-game-room-engines/mystery";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toPublicGameRoom(room: GameRoom): GameRoom {
  if (
    room.gameId === "mystery-box" ||
    room.gameState?.game === "mystery-box"
  ) {
    return { ...room, gameState: toPublicMysteryState(room.gameState) };
  }
  const { private: _private, ...gameState } = room.gameState ?? {};
  return { ...room, gameState };
}

export function readRoomCommandResult(
  value: unknown,
): RoomCommandResult | undefined {
  if (!isRecord(value)) return undefined;

  const result: RoomCommandResult = {};
  if (
    isFiniteNumber(value.retryAfterMs) &&
    Number.isInteger(value.retryAfterMs) &&
    value.retryAfterMs >= 0
  ) {
    result.retryAfterMs = value.retryAfterMs;
  }
  if (isFiniteNumber(value.roll)) result.roll = value.roll;
  if (typeof value.replayed === "boolean") result.replayed = value.replayed;

  return Object.keys(result).length > 0 ? result : undefined;
}
