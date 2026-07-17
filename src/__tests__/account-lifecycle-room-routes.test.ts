import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    gameRoomCreateAttempt: {
      deleteMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    gameRoom: {},
  };
  return {
    tx,
    auth: vi.fn(),
    transaction: vi.fn(),
    loadGameRoom: vi.fn(),
    loadLockedGameRoom: vi.fn(),
    saveGameRoom: vi.fn(),
    createGameRoom: vi.fn(),
    consumeCreateLimit: vi.fn(),
    cleanupIfDue: vi.fn(),
    checkRateLimit: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    gameRoomSettlement: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/game-room-create-rate-limit", () => ({
  consumeGameRoomCreateLimit: mocks.consumeCreateLimit,
}));
vi.mock("@/lib/game-room-cleanup-service", () => ({
  cleanupExpiredGameRoomsIfDue: mocks.cleanupIfDue,
}));
vi.mock("@/lib/game-room-store", () => ({
  loadGameRoom: mocks.loadGameRoom,
  loadLockedGameRoom: mocks.loadLockedGameRoom,
  saveGameRoom: mocks.saveGameRoom,
  createGameRoom: mocks.createGameRoom,
  deleteGameRoom: vi.fn(),
  deleteGameRoomPresence: vi.fn(),
  isStaleRoomAction: (room: GameRoom, expected: unknown) =>
    typeof expected === "number" && expected !== room.version,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/point-award-service", () => ({
  ensureQuestionGameRoomPoints: vi.fn(),
}));

import { POST as createRoom } from "@/app/api/question-games/rooms/route";
import { PATCH as updateRoom } from "@/app/api/question-games/rooms/[code]/route";

const waitingRoom: GameRoom = {
  code: "1234",
  gameId: "dice",
  hostId: "host",
  status: "waiting",
  players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  topic: "",
  chain: [],
  turnIndex: 0,
  gameState: {},
  version: 1,
  createdAt: 1,
  updatedAt: 1,
};

function requestCreate() {
  return createRoom(new Request("http://localhost/api/question-games/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: "dice" }),
  }) as never);
}

function requestJoin() {
  return updateRoom(
    new Request("http://localhost/api/question-games/rooms/1234", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: "user-1", name: "예전 학생", role: "STUDENT" },
  });
  mocks.transaction.mockImplementation(
    (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.tx.$queryRaw.mockResolvedValue([{ lock: "", now: new Date() }]);
  mocks.tx.user.findUnique.mockResolvedValue({
    id: "user-1",
    name: "현재 학생",
    role: "STUDENT",
  });
  mocks.loadGameRoom.mockResolvedValue(waitingRoom);
  mocks.loadLockedGameRoom.mockResolvedValue(waitingRoom);
  mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
    kind: "saved" as const,
    room: { ...room, version: room.version + 1 },
  }));
  mocks.consumeCreateLimit.mockResolvedValue(true);
  mocks.createGameRoom.mockResolvedValue({
    ...waitingRoom,
    hostId: "user-1",
    players: [{ id: "user-1", name: "학생", isHost: true, joinedAt: 1 }],
  });
  mocks.cleanupIfDue.mockResolvedValue(null);
  mocks.checkRateLimit.mockReturnValue(null);
});

describe("질문놀이 계정 생명주기 경계", () => {
  it("현재 자료에 없는 사용자는 방에 참가시키지 않는다", async () => {
    mocks.tx.user.findUnique.mockResolvedValue(null);

    const response = await requestJoin();

    expect(response.status).toBe(403);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("참가는 생명주기 잠금, 방 행 잠금, 현재 사용자 확인, 저장 순서를 지킨다", async () => {
    const response = await requestJoin();

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.loadGameRoom).not.toHaveBeenCalled();
    expect(mocks.loadLockedGameRoom).toHaveBeenCalledWith("1234", mocks.tx);
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        players: expect.arrayContaining([
          expect.objectContaining({ id: "user-1", name: "현재 학생" }),
        ]),
      }),
      mocks.tx,
    );
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadLockedGameRoom.mock.invocationCallOrder[0],
    );
    expect(mocks.loadLockedGameRoom.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.user.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveGameRoom.mock.invocationCallOrder[0],
    );
  });

  it("현재 역할이 허용되지 않은 사용자는 방을 만들지 않는다", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ id: "user-1", role: "REMOVED" });

    const response = await requestCreate();

    expect(response.status).toBe(403);
    expect(mocks.consumeCreateLimit).not.toHaveBeenCalled();
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
  });

  it("생명주기 잠금과 사용자 확인, 생성 제한, 방 삽입을 한 거래로 묶는다", async () => {
    const response = await requestCreate();

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.consumeCreateLimit).toHaveBeenCalledWith("user-1", mocks.tx);
    expect(mocks.createGameRoom).toHaveBeenCalledWith({
      gameId: "dice",
      hostId: "user-1",
      hostName: "현재 학생",
    }, mocks.tx);
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.user.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.consumeCreateLimit.mock.invocationCallOrder[0],
    );
    expect(mocks.consumeCreateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createGameRoom.mock.invocationCallOrder[0],
    );
  });
});
