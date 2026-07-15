import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom, RoomStatus } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => {
  const tx = {
    gameRoomPresence: { findFirst: vi.fn() },
  };
  return {
    tx,
    findRooms: vi.fn(),
    findPresences: vi.fn(),
    deleteCreateAttempts: vi.fn(),
    transaction: vi.fn(),
    loadLockedGameRoom: vi.fn(),
    deleteGameRoom: vi.fn(),
    loggerInfo: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    gameRoom: { findMany: mocks.findRooms },
    gameRoomPresence: { findMany: mocks.findPresences },
    gameRoomCreateAttempt: { deleteMany: mocks.deleteCreateAttempts },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/game-room-store", () => ({
  deleteGameRoom: mocks.deleteGameRoom,
  loadLockedGameRoom: mocks.loadLockedGameRoom,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.loggerInfo },
}));

import {
  cleanupExpiredGameRooms,
  cleanupExpiredGameRoomsIfDue,
} from "@/lib/game-room-cleanup-service";

const NOW = new Date("2026-07-15T03:00:00.000Z");

function roomRecord({
  code,
  status,
  createdAt,
  version,
}: {
  code: string;
  status: RoomStatus;
  createdAt: number;
  version: number;
}) {
  const room: GameRoom = {
    code,
    gameId: "dice",
    hostId: "host",
    status,
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: createdAt }],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version,
    createdAt,
    updatedAt: createdAt,
  };
  return { code, data: room };
}

beforeEach(() => {
  mocks.findRooms.mockReset().mockResolvedValue([]);
  mocks.findPresences.mockReset().mockResolvedValue([]);
  mocks.deleteCreateAttempts.mockReset().mockResolvedValue({ count: 0 });
  mocks.loadLockedGameRoom.mockReset();
  mocks.tx.gameRoomPresence.findFirst.mockReset().mockResolvedValue(null);
  mocks.transaction.mockReset().mockImplementation(
    (callback: (client: unknown) => unknown) => callback(mocks.tx),
  );
  mocks.deleteGameRoom.mockReset().mockResolvedValue({ kind: "deleted", room: null });
  mocks.loggerInfo.mockReset();
});

describe("cleanupExpiredGameRooms", () => {
  it("상태별 수명 기준으로 가장 오래된 후보를 최대 백 개 조회한다", async () => {
    await cleanupExpiredGameRooms({ now: NOW });

    expect(mocks.findRooms).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            updatedAt: { lte: new Date("2026-07-14T21:00:00.000Z") },
            data: { path: ["status"], equals: "waiting" },
            presences: {
              none: {
                lastSeenAt: { gte: new Date("2026-07-15T02:58:00.000Z") },
              },
            },
          },
          {
            updatedAt: { lte: new Date("2026-07-14T15:00:00.000Z") },
            data: { path: ["status"], equals: "playing" },
            presences: {
              none: {
                lastSeenAt: { gte: new Date("2026-07-15T02:58:00.000Z") },
              },
            },
          },
          {
            updatedAt: { lte: new Date("2026-07-14T03:00:00.000Z") },
            data: { path: ["status"], equals: "ended" },
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
      select: { code: true, data: true },
    });
    expect(mocks.deleteCreateAttempts).toHaveBeenCalledWith({
      where: {
        createdAt: { lte: new Date("2026-07-15T02:59:00.000Z") },
      },
    });
  });

  it("최근 접속한 대기 방은 보존하고 진행 방과 종료 방은 조건부 삭제한다", async () => {
    const rooms = [
      roomRecord({ code: "1111", status: "waiting", createdAt: 1_000, version: 2 }),
      roomRecord({ code: "2222", status: "playing", createdAt: 2_000, version: 4 }),
      roomRecord({ code: "3333", status: "ended", createdAt: 3_000, version: 6 }),
    ];
    mocks.findRooms.mockResolvedValue(rooms);
    mocks.loadLockedGameRoom
      .mockResolvedValueOnce(rooms[0].data)
      .mockResolvedValueOnce(rooms[1].data)
      .mockResolvedValueOnce(rooms[2].data);
    mocks.tx.gameRoomPresence.findFirst
      .mockResolvedValueOnce({ userId: "host" })
      .mockResolvedValueOnce(null);

    await expect(cleanupExpiredGameRooms({ now: NOW })).resolves.toEqual({
      deletedCount: 2,
      errorCount: 0,
    });

    expect(mocks.tx.gameRoomPresence.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        roomCode: "1111",
        roomCreatedAt: BigInt(1_000),
        lastSeenAt: { gte: new Date("2026-07-15T02:58:00.000Z") },
      },
      select: { userId: true },
    });
    expect(mocks.tx.gameRoomPresence.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        roomCode: "2222",
        roomCreatedAt: BigInt(2_000),
        lastSeenAt: { gte: new Date("2026-07-15T02:58:00.000Z") },
      },
      select: { userId: true },
    });
    expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(2);
    expect(mocks.deleteGameRoom).toHaveBeenNthCalledWith(1, {
      code: "2222",
      createdAt: 2_000,
      version: 4,
    }, mocks.tx);
    expect(mocks.deleteGameRoom).toHaveBeenNthCalledWith(2, {
      code: "3333",
      createdAt: 3_000,
      version: 6,
    }, mocks.tx);
    expect(mocks.loggerInfo).toHaveBeenCalledWith("질문놀이 방 정리", {
      deletedCount: 2,
      errorCount: 0,
    });
  });

  it("깨진 자료와 삭제 오류는 세기만 하고 다른 후보 정리를 계속한다", async () => {
    const rooms = [
      { code: "1111", data: { status: "waiting" } },
      roomRecord({ code: "2222", status: "playing", createdAt: 2_000, version: 4 }),
      roomRecord({ code: "3333", status: "ended", createdAt: 3_000, version: 6 }),
    ];
    mocks.findRooms.mockResolvedValue(rooms);
    mocks.loadLockedGameRoom
      .mockResolvedValueOnce(rooms[1].data)
      .mockResolvedValueOnce(rooms[2].data);
    mocks.deleteGameRoom
      .mockRejectedValueOnce(new Error("자료 저장소 오류"))
      .mockResolvedValueOnce({ kind: "deleted", room: null });

    await expect(cleanupExpiredGameRooms({ now: NOW })).resolves.toEqual({
      deletedCount: 1,
      errorCount: 2,
    });
    expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(2);
    expect(mocks.loggerInfo).toHaveBeenCalledWith("질문놀이 방 정리", {
      deletedCount: 1,
      errorCount: 2,
    });
  });

  it("삭제 직전 방이 바뀌거나 사라지면 오류로 기록하지 않는다", async () => {
    const rooms = [
      roomRecord({ code: "2222", status: "playing", createdAt: 2_000, version: 4 }),
      roomRecord({ code: "3333", status: "ended", createdAt: 3_000, version: 6 }),
    ];
    mocks.findRooms.mockResolvedValue(rooms);
    mocks.loadLockedGameRoom
      .mockResolvedValueOnce(rooms[0].data)
      .mockResolvedValueOnce(rooms[1].data);
    mocks.deleteGameRoom
      .mockResolvedValueOnce({ kind: "conflict", room: roomRecord({
        code: "2222",
        status: "playing",
        createdAt: 2_000,
        version: 5,
      }).data })
      .mockResolvedValueOnce({ kind: "missing", room: null });

    await expect(cleanupExpiredGameRooms({ now: NOW })).resolves.toEqual({
      deletedCount: 0,
      errorCount: 0,
    });
  });

  it("후보 조회 뒤 접속이 생긴 대기 방은 잠근 거래 안에서 다시 확인해 보존한다", async () => {
    const room = roomRecord({ code: "1111", status: "waiting", createdAt: 1_000, version: 2 });
    mocks.findRooms.mockResolvedValue([room]);
    mocks.loadLockedGameRoom.mockResolvedValue(room.data);
    mocks.tx.gameRoomPresence.findFirst.mockResolvedValue({ userId: "host" });

    await expect(cleanupExpiredGameRooms({ now: NOW })).resolves.toEqual({
      deletedCount: 0,
      errorCount: 0,
    });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.loadLockedGameRoom).toHaveBeenCalledWith("1111", mocks.tx);
    expect(mocks.tx.gameRoomPresence.findFirst).toHaveBeenCalledOnce();
    expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
  });

  it("오래된 생성 시도 정리가 실패해도 방 정리를 계속하고 방 삭제 수만 반환한다", async () => {
    const room = roomRecord({ code: "3333", status: "ended", createdAt: 3_000, version: 6 });
    mocks.findRooms.mockResolvedValue([room]);
    mocks.loadLockedGameRoom.mockResolvedValue(room.data);
    mocks.deleteCreateAttempts.mockRejectedValue(new Error("생성 시도 정리 오류"));

    await expect(cleanupExpiredGameRooms({ now: NOW })).resolves.toEqual({
      deletedCount: 1,
      errorCount: 1,
    });

    expect(mocks.deleteGameRoom).toHaveBeenCalledOnce();
  });
});

describe("cleanupExpiredGameRoomsIfDue", () => {
  it("같은 실행 환경에서는 정리 기회를 일정 시간에 한 번만 연다", async () => {
    const first = new Date("2099-01-01T00:00:00.000Z");
    const shortlyAfter = new Date("2099-01-01T00:01:00.000Z");

    await expect(cleanupExpiredGameRoomsIfDue({ now: first })).resolves.toEqual({
      deletedCount: 0,
      errorCount: 0,
    });
    await expect(cleanupExpiredGameRoomsIfDue({ now: shortlyAfter })).resolves.toBeNull();
    expect(mocks.findRooms).toHaveBeenCalledTimes(1);
  });
});
