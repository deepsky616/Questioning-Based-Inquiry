import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    gameRoom: {},
    gameRoomCreateAttempt: {},
  };
  return {
    tx,
    transaction: vi.fn(),
    auth: vi.fn(),
    createGameRoom: vi.fn(),
    consumeCreateLimit: vi.fn(),
    cleanupIfDue: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/game-room-store", () => ({ createGameRoom: mocks.createGameRoom }));
vi.mock("@/lib/game-room-create-rate-limit", () => ({
  consumeGameRoomCreateLimit: mocks.consumeCreateLimit,
}));
vi.mock("@/lib/game-room-cleanup-service", () => ({
  cleanupExpiredGameRoomsIfDue: mocks.cleanupIfDue,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}));

import { POST } from "@/app/api/question-games/rooms/route";

function createRoom() {
  return POST(new Request("http://localhost/api/question-games/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "dice" }),
  }) as never);
}

beforeEach(() => {
  mocks.transaction.mockReset().mockImplementation(
    (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.tx.$queryRaw.mockReset().mockResolvedValue([{ lock: "" }]);
  mocks.tx.user.findUnique.mockReset().mockResolvedValue({
    id: "user-1",
    name: "학생",
    role: "STUDENT",
  });
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "user-1", name: "학생" } });
  mocks.createGameRoom.mockReset().mockResolvedValue({
    code: "1234",
    gameId: "dice",
    hostId: "user-1",
    status: "waiting",
    players: [],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  mocks.consumeCreateLimit.mockReset().mockResolvedValue(true);
  mocks.cleanupIfDue.mockReset().mockResolvedValue(null);
  mocks.loggerWarn.mockReset();
  mocks.loggerError.mockReset();
});

describe("질문놀이 방 생성 보호", () => {
  it("사용자별 분당 열 번 제한을 먼저 적용한다", async () => {
    mocks.consumeCreateLimit.mockResolvedValue(false);

    const response = await createRoom();

    expect(response.status).toBe(429);
    expect(mocks.consumeCreateLimit).toHaveBeenCalledWith("user-1", mocks.tx);
    expect(mocks.cleanupIfDue).not.toHaveBeenCalled();
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
  });

  it("허용된 생성 요청은 방을 만든 뒤 기회 정리도 시도한다", async () => {
    const response = await createRoom();

    expect(response.status).toBe(200);
    expect(mocks.consumeCreateLimit).toHaveBeenCalledWith("user-1", mocks.tx);
    expect(mocks.cleanupIfDue).toHaveBeenCalledOnce();
    expect(mocks.createGameRoom).toHaveBeenCalledOnce();
  });

  it("생성 제한 저장소가 실패하면 닫힌 상태로 실패하고 내부 오류를 기록하지 않는다", async () => {
    mocks.consumeCreateLimit.mockRejectedValue(new Error("민감한 저장소 오류"));

    const response = await createRoom();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "방 생성 요청을 확인할 수 없습니다",
    });
    expect(mocks.cleanupIfDue).not.toHaveBeenCalled();
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith("질문놀이 방 생성 제한 오류", {
      errorCount: 1,
    });
  });

  it("기회 정리가 실패해도 오류 수만 기록하고 방 생성은 계속한다", async () => {
    mocks.cleanupIfDue.mockRejectedValue(new Error("민감한 저장소 오류"));

    const response = await createRoom();

    expect(response.status).toBe(200);
    expect(mocks.createGameRoom).toHaveBeenCalledOnce();
    expect(mocks.loggerWarn).toHaveBeenCalledWith("질문놀이 방 기회 정리 오류", {
      errorCount: 1,
    });
  });
});
