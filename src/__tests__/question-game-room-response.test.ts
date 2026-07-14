import { describe, expect, it } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import {
  readRoomCommandResult,
  toPublicGameRoom,
} from "@/lib/question-game-room-response";

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "memory",
    hostId: "host",
    status: "playing",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("toPublicGameRoom", () => {
  it("비공개 상태를 원본 변경 없이 제거한다", () => {
    const room = makeRoom({
      gameState: { phase: "play", private: { answer: "사과" } },
    });

    const publicRoom = toPublicGameRoom(room);

    expect(publicRoom.gameState).toEqual({ phase: "play" });
    expect(room.gameState.private).toEqual({ answer: "사과" });
  });
});

describe("readRoomCommandResult", () => {
  it("허용된 짧은 명령 결과만 읽는다", () => {
    expect(readRoomCommandResult({
      retryAfterMs: 1200,
      roll: 5,
      replayed: true,
      ignored: "값",
    })).toEqual({ retryAfterMs: 1200, roll: 5, replayed: true });
  });

  it.each([
    ["배열", [{ retryAfterMs: 1200 }]],
    ["과대 문자열", "x".repeat(10_000)],
  ])("%s 결과는 버린다", (_kind, value) => {
    expect(readRoomCommandResult(value)).toBeUndefined();
  });
});
