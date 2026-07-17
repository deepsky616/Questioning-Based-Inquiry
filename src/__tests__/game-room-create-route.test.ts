import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_QUESTION_GAME_IDS,
  type BuiltInQuestionGameId,
} from "@/lib/question-game-rules";

const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
  },
  auth: vi.fn(),
  transaction: vi.fn(),
  createGameRoom: vi.fn(),
  consumeCreateLimit: vi.fn(),
  cleanupIfDue: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/game-room-store", () => ({
  createGameRoom: mocks.createGameRoom,
}));
vi.mock("@/lib/game-room-create-rate-limit", () => ({
  consumeGameRoomCreateLimit: mocks.consumeCreateLimit,
}));
vi.mock("@/lib/game-room-cleanup-service", () => ({
  cleanupExpiredGameRoomsIfDue: mocks.cleanupIfDue,
}));

import { POST } from "@/app/api/question-games/rooms/route";

function createRoom(gameId: string) {
  return POST(
    new Request("http://localhost/api/question-games/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    }) as never,
  );
}

beforeEach(() => {
  mocks.transaction.mockReset().mockImplementation(
    (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.tx.$queryRaw.mockReset().mockResolvedValue([{ lock: "" }]);
  mocks.tx.user.findUnique.mockReset().mockResolvedValue({
    id: "user-1",
    name: "학생",
    role: "STUDENT",
  });
  mocks.auth.mockReset().mockResolvedValue({
    user: { id: "user-1", name: "학생" },
  });
  mocks.createGameRoom.mockReset().mockImplementation(
    async ({ gameId }: { gameId: BuiltInQuestionGameId }) => ({
      code: "1234",
      gameId,
    }),
  );
  mocks.consumeCreateLimit.mockReset().mockResolvedValue(true);
  mocks.cleanupIfDue.mockReset().mockResolvedValue(null);
});

describe("친구 방 생성 놀이 식별값", () => {
  it("놀이 식별값이 없으면 기존 입력 오류를 반환한다", async () => {
    const response = await createRoom("");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "gameId가 필요합니다",
    });
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
  });

  it("알 수 없는 놀이 식별값은 저장소를 호출하지 않고 거부한다", async () => {
    const response = await createRoom("unknown");

    expect(response.status).toBe(400);
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
  });

  it.each(BUILT_IN_QUESTION_GAME_IDS)("%s 방을 생성한다", async (gameId) => {
    const response = await createRoom(gameId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      room: { gameId },
    });
    expect(mocks.createGameRoom).toHaveBeenCalledWith({
      gameId,
      hostId: "user-1",
      hostName: "학생",
    }, mocks.tx);
  });
});
