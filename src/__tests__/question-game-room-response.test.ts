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

  it("내보낸 학생 목록을 공개 응답에서 제거한다", () => {
    const room = makeRoom({ blockedPlayerIds: ["student"] });

    const publicRoom = toPublicGameRoom(room);

    expect(publicRoom.blockedPlayerIds).toBeUndefined();
    expect(room.blockedPlayerIds).toEqual(["student"]);
  });

  it("미스터리 박스의 중첩 비공개 복사본과 알 수 없는 키를 제거한다", () => {
    const marker = "copied-secret";
    const gameState = {
      stateVersion: 2,
      game: "mystery-box",
      phase: "play",
      recentCommandIds: [],
      roundId: "11111111-1111-4111-8111-111111111111",
      round: 1,
      maxRounds: 20,
      turnOrder: ["host"],
      currentTurnIdx: 0,
      history: [{
        kind: "question",
        playerId: "host",
        playerName: "방장",
        locale: "ko",
        question: "먹을 수 있나요?",
        answer: "yes",
        private: { itemId: marker },
      }],
      scores: { host: 1 },
      private: { itemId: "apple", copied: { itemId: marker } },
      answer: { ko: marker, en: marker, itemId: marker },
      itemId: marker,
      copied: { itemId: marker },
    };
    const room = makeRoom({ gameId: "memory", gameState });

    const publicRoom = toPublicGameRoom(room);

    expect(JSON.stringify(publicRoom.gameState)).not.toContain(marker);
    expect(publicRoom.gameState).not.toHaveProperty("private");
    expect(publicRoom.gameState).not.toHaveProperty("answer");
    expect(publicRoom.gameState).not.toHaveProperty("itemId");
    expect(publicRoom.gameState.history).toEqual([{
      kind: "question",
      playerId: "host",
      playerName: "방장",
      locale: "ko",
      question: "먹을 수 있나요?",
      answer: "yes",
    }]);
    expect(JSON.stringify(gameState)).toContain(marker);
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
