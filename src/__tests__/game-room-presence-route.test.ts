import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn((): Response | null => null),
  updateGameRoomPresence: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/game-room-presence-service", () => ({
  updateGameRoomPresence: mocks.updateGameRoomPresence,
}));

import { POST } from "@/app/api/question-games/rooms/[code]/presence/route";

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "host",
    status: "playing",
    players: [
      { id: "host", name: "방장", isHost: true, joinedAt: 1 },
      { id: "student", name: "학생", isHost: false, joinedAt: 2 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {
      stateVersion: 2,
      phase: "play",
      turnOrder: ["host", "student"],
      currentTurnIdx: 0,
      private: { answer: "비밀" },
    },
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function post(body: unknown = { expectedCreatedAt: 1_000 }) {
  return POST(
    new Request("http://localhost/api/question-games/rooms/1234/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

beforeEach(() => {
  vi.useRealTimers();
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "student", name: "학생" } });
  mocks.checkRateLimit.mockReset().mockReturnValue(null);
  mocks.updateGameRoomPresence.mockReset().mockResolvedValue({
    kind: "room",
    room: makeRoom(),
  });
});

describe("질문놀이 방 접속 확인", () => {
  it("로그인하지 않은 요청을 거절한다", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(401);
    expect(mocks.updateGameRoomPresence).not.toHaveBeenCalled();
  });

  it("사용자별 분당 열 번으로 제한한다", async () => {
    const limited = Response.json({ error: "제한" }, { status: 429 });
    mocks.checkRateLimit.mockReturnValue(limited);

    const response = await post();

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "game-room-presence:student",
      10,
    );
    expect(mocks.updateGameRoomPresence).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 1.5, -1, "1000"])(
    "잘못된 방 생성 시각 %s를 거절한다",
    async (expectedCreatedAt) => {
      const response = await post({ expectedCreatedAt });

      expect(response.status).toBe(400);
      expect(mocks.updateGameRoomPresence).not.toHaveBeenCalled();
    },
  );

  it("다른 수명의 방을 갱신하지 않고 최신 공개 방과 충돌을 반환한다", async () => {
    mocks.updateGameRoomPresence.mockResolvedValue({
      kind: "conflict",
      room: makeRoom({ createdAt: 2_000 }),
    });

    const response = await post();

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(mocks.updateGameRoomPresence).toHaveBeenCalledWith({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
    });
  });

  it("방 참가자가 아닌 사용자를 거절한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "outsider", name: "다른 사람" } });
    mocks.updateGameRoomPresence.mockResolvedValue({ kind: "forbidden" });

    const response = await post();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.not.toHaveProperty("room");
  });

  it("방 수명도 다를 때 비참가자에게 방 본문 없이 먼저 권한 오류를 반환한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "outsider", name: "다른 사람" } });
    mocks.updateGameRoomPresence.mockResolvedValue({ kind: "forbidden" });

    const response = await post();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "방 참가자만 접속을 확인할 수 있어요",
    });
    expect(mocks.updateGameRoomPresence).toHaveBeenCalledWith({
      code: "1234",
      userId: "outsider",
      expectedCreatedAt: 1_000,
    });
  });

  it("거래 처리 오류는 방 본문 없는 서버 오류로 반환한다", async () => {
    mocks.updateGameRoomPresence.mockRejectedValue(new Error("저장 오류"));
    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "접속 상태를 확인할 수 없습니다",
    });
  });
});
