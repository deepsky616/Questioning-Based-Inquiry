import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameAwardResult } from "@/lib/game-award-result";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn((): Response | null => null),
  loadGameRoom: vi.fn(),
  saveGameRoom: vi.fn(),
  deleteGameRoom: vi.fn(),
  loadVerifiedGameAwardResult: vi.fn(),
  QuestionGameAwardPublishError: class QuestionGameAwardPublishError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
      this.name = "QuestionGameAwardPublishError";
    }
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/game-room-store", () => ({
  loadGameRoom: mocks.loadGameRoom,
  saveGameRoom: mocks.saveGameRoom,
  deleteGameRoom: mocks.deleteGameRoom,
  isStaleRoomAction: (room: GameRoom, expectedVersion: unknown) =>
    typeof expectedVersion === "number" && room.version !== expectedVersion,
}));
vi.mock("@/lib/memory-room-roll", () => ({
  recordMemoryRoll: vi.fn(),
  settleMemoryRollingRoom: (room: GameRoom) => room,
}));
vi.mock("@/lib/question-game-award-publish-service", () => ({
  QuestionGameAwardPublishError: mocks.QuestionGameAwardPublishError,
  loadVerifiedGameAwardResult: mocks.loadVerifiedGameAwardResult,
}));

import { PATCH } from "@/app/api/question-games/rooms/[code]/route";

const PLAY_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const AWARD: GameAwardResult = {
  awards: [
    {
      studentId: "student-1",
      bonusType: "PARTICIPATION",
      points: 1,
      reason: "게임 참여",
    },
    {
      studentId: "student-1",
      bonusType: "COMPLETION",
      points: 5,
      reason: "게임 완료",
    },
  ],
  bestQuestion: {
    studentId: "student-1",
    question: "별은 왜 빛나나요?",
    reason: "탐구할 거리가 분명해요.",
  },
  summary: "질문을 끝까지 완성했어요.",
};
const REORDERED_AWARD: GameAwardResult = {
  summary: "질문을 끝까지 완성했어요.",
  bestQuestion: {
    reason: "탐구할 거리가 분명해요.",
    question: "별은 왜 빛나나요?",
    studentId: "student-1",
  },
  awards: [
    {
      reason: "게임 완료",
      points: 5,
      bonusType: "COMPLETION",
      studentId: "student-1",
    },
    {
      reason: "게임 참여",
      points: 1,
      bonusType: "PARTICIPATION",
      studentId: "student-1",
    },
  ],
};

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "teacher-1",
    status: "ended",
    players: [
      { id: "teacher-1", name: "교사", isHost: true, joinedAt: 1 },
      { id: "student-1", name: "학생", isHost: false, joinedAt: 2 },
    ],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {
      stateVersion: 2,
      game: "dice",
      phase: "done",
      endReason: "completed",
    },
    version: 7,
    createdAt: 100,
    updatedAt: 200,
    playId: PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    ...overrides,
  };
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "publish-award-result",
    commandId: COMMAND_ID,
    expectedCreatedAt: 100,
    expectedVersion: 7,
    playId: PLAY_ID,
    ...overrides,
  };
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/question-games/rooms/1234", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

describe("verified game award publication route", () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({
      user: { id: "teacher-1", name: "교사", role: "TEACHER" },
    });
    mocks.checkRateLimit.mockReset().mockReturnValue(null);
    mocks.loadGameRoom.mockReset().mockResolvedValue(makeRoom());
    mocks.loadVerifiedGameAwardResult.mockReset().mockResolvedValue(AWARD);
    mocks.saveGameRoom.mockReset().mockImplementation(async (room: GameRoom) => ({
      kind: "saved" as const,
      room: { ...room, version: room.version + 1 },
    }));
    mocks.deleteGameRoom.mockReset();
  });

  it("publishes only the verified logs at the room top level", async () => {
    const response = await patch(requestBody());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadVerifiedGameAwardResult).toHaveBeenCalledWith(
      {
        gameId: "dice",
        roomCode: "1234",
        roomCreatedAt: 100,
        playId: PLAY_ID,
      },
      new Set(["student-1"]),
    );
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      awardResult: AWARD,
      gameState: {
        stateVersion: 2,
        game: "dice",
        phase: "done",
        endReason: "completed",
      },
    }));
    expect(body.room.awardResult).toEqual(AWARD);
    expect(body.room.gameState).not.toHaveProperty("awardResult");
  });

  it.each([
    ["result", AWARD],
    ["awardResult", AWARD],
    ["patch", { awardResult: AWARD }],
    ["unexpected", true],
  ])("rejects the client supplied %s field", async (field, value) => {
    const response = await patch(requestBody({ [field]: value }));

    expect(response.status).toBe(400);
    expect(mocks.loadVerifiedGameAwardResult).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("returns a conflict when approved logs do not exist", async () => {
    mocks.loadVerifiedGameAwardResult.mockResolvedValue(null);

    const response = await patch(requestBody());

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("preserves a forbidden error for logs outside the room student scope", async () => {
    mocks.loadVerifiedGameAwardResult.mockRejectedValue(
      new mocks.QuestionGameAwardPublishError(
        "현재 방 참가 학생의 점수만 공개할 수 있습니다",
        403,
      ),
    );

    const response = await patch(requestBody());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "현재 방 참가 학생의 점수만 공개할 수 있습니다",
    });
    expect(mocks.loadVerifiedGameAwardResult).toHaveBeenCalledWith(
      expect.any(Object),
      new Set(["student-1"]),
    );
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("allows only a teacher who is the current room host", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "teacher-1", name: "학생 방장", role: "STUDENT" },
    });
    const studentResponse = await patch(requestBody());

    mocks.auth.mockResolvedValue({
      user: { id: "teacher-1", name: "교사", role: "TEACHER" },
    });
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ hostId: "student-1" }));
    const nonHostResponse = await patch(requestBody());

    expect(studentResponse.status).toBe(403);
    expect(nonHostResponse.status).toBe(403);
    expect(mocks.loadVerifiedGameAwardResult).not.toHaveBeenCalled();
  });

  it.each([
    { gameState: { stateVersion: 2, game: "dice", phase: "done", endReason: "host" } },
    { status: "playing" as const },
    { pointAwardKeyVersion: 1 as const },
    { pointEvidenceVersion: 1 as const },
    { playId: "33333333-3333-4333-8333-333333333333" },
  ])("rejects a room outside the completed version 2 execution", async (override) => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom(override));

    const response = await patch(requestBody());

    expect(response.status).toBe(409);
    expect(mocks.loadVerifiedGameAwardResult).not.toHaveBeenCalled();
  });

  it("rejects a stale room version before loading award logs", async () => {
    const response = await patch(requestBody({ expectedVersion: 6 }));

    expect(response.status).toBe(409);
    expect(mocks.loadVerifiedGameAwardResult).not.toHaveBeenCalled();
  });

  it("replays an already published matching result without another write", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ awardResult: AWARD }));

    const response = await patch(requestBody());

    expect(response.status).toBe(200);
    expect(mocks.loadVerifiedGameAwardResult).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("replays the same published result after a lost success response", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({
      version: 8,
      awardResult: REORDERED_AWARD,
    }));

    const response = await patch(requestBody({ expectedVersion: 7 }));

    expect(response.status).toBe(200);
    expect(mocks.loadVerifiedGameAwardResult).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("accepts a write collision only when the same execution result is present", async () => {
    mocks.saveGameRoom.mockResolvedValue({
      kind: "conflict",
      room: makeRoom({ version: 8, awardResult: REORDERED_AWARD }),
    });
    const replayResponse = await patch(requestBody());
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();

    mocks.saveGameRoom.mockClear();
    mocks.saveGameRoom.mockResolvedValue({
      kind: "conflict",
      room: makeRoom({ version: 8 }),
    });
    const conflictResponse = await patch(requestBody());

    expect(replayResponse.status).toBe(200);
    expect(conflictResponse.status).toBe(409);
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });
});
