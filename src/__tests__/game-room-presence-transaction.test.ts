import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const prismaMock = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    gameRoom: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    gameRoomPresence: {
      createMany: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});

const engineMock = vi.hoisted(() => ({
  leaveQuestionGameRoom: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/question-game-room-engine", () => ({
  leaveQuestionGameRoom: engineMock.leaveQuestionGameRoom,
}));

import { updateGameRoomPresence } from "@/lib/game-room-presence-service";

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
    },
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    (callback: (client: typeof prismaMock.tx) => unknown) => callback(prismaMock.tx),
  );
  prismaMock.tx.$queryRaw.mockResolvedValue([{ data: makeRoom() }]);
  prismaMock.tx.$executeRaw.mockResolvedValue(0);
  prismaMock.tx.gameRoom.findUnique.mockResolvedValue(null);
  prismaMock.tx.gameRoom.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.tx.gameRoomPresence.createMany.mockResolvedValue({ count: 2 });
  prismaMock.tx.gameRoomPresence.upsert.mockResolvedValue({});
  prismaMock.tx.gameRoomPresence.findFirst
    .mockResolvedValueOnce({ userId: "host" })
    .mockResolvedValueOnce({ userId: "host" });
  prismaMock.tx.gameRoomPresence.deleteMany.mockResolvedValue({ count: 1 });
  engineMock.leaveQuestionGameRoom.mockImplementation(
    ({ room, userId }: { room: GameRoom; userId: string }) => ({
      kind: "changed",
      room: {
        ...room,
        hostId: "student",
        players: room.players
          .filter((player) => player.id !== userId)
          .map((player) => ({ ...player, isHost: true })),
        status: "ended",
        gameState: {
          ...room.gameState,
          phase: "done",
          endReason: "insufficient-players",
        },
      },
    }),
  );
});

describe("질문놀이 접속 확인 거래", () => {
  it("방 잠금부터 접속 갱신, 오래된 참가자 이탈 저장과 접속 삭제까지 한 거래에서 처리한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T01:00:00.000Z"));

    const result = await updateGameRoomPresence({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
      random: () => 0,
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    });

    expect(result.kind).toBe("room");
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.tx.$queryRaw).toHaveBeenCalledOnce();
    const query = (prismaMock.tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(query).toContain("SELECT");
    expect(query).toContain("FOR UPDATE");
    expect(prismaMock.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.tx.gameRoomPresence.createMany.mock.invocationCallOrder[0],
    );
    expect(prismaMock.tx.gameRoom.updateMany).toHaveBeenCalledOnce();
    expect(engineMock.leaveQuestionGameRoom).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host" }),
    );
    expect(prismaMock.tx.gameRoomPresence.deleteMany).toHaveBeenCalledWith({
      where: {
        roomCode: "1234",
        roomCreatedAt: BigInt(1_000),
        userId: "host",
      },
    });
  });

  it("잠근 최신 방의 비참가자는 수명 충돌보다 먼저 방 없는 권한 결과를 받는다", async () => {
    prismaMock.tx.$queryRaw.mockResolvedValue([{ data: makeRoom({
      createdAt: 2_000,
      players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    }) }]);

    const result = await updateGameRoomPresence({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
    });

    expect(result).toEqual({ kind: "forbidden" });
    expect(prismaMock.tx.gameRoomPresence.createMany).not.toHaveBeenCalled();
  });

  it("잠근 최신 방에서 내보낸 학생은 별도 권한 결과를 받는다", async () => {
    prismaMock.tx.$queryRaw.mockResolvedValue([{ data: makeRoom({
      players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
      blockedPlayerIds: ["student"],
    }) }]);

    const result = await updateGameRoomPresence({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
    });

    expect(result).toEqual({ kind: "removed" });
    expect(prismaMock.tx.gameRoomPresence.createMany).not.toHaveBeenCalled();
  });

  it("잠근 최신 방의 참가자는 수명이 다르면 접속 행을 건드리지 않고 충돌 방을 받는다", async () => {
    const replacement = makeRoom({ createdAt: 2_000 });
    prismaMock.tx.$queryRaw.mockResolvedValue([{ data: replacement }]);

    const result = await updateGameRoomPresence({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
    });

    expect(result).toEqual({ kind: "conflict", room: replacement });
    expect(prismaMock.tx.gameRoomPresence.createMany).not.toHaveBeenCalled();
  });

  it("대기 방의 오래된 방장을 내보내고 다음 참가자에게 방장을 넘긴다", async () => {
    const waitingRoom = makeRoom({ status: "waiting", gameState: {} });
    prismaMock.tx.$queryRaw.mockResolvedValue([{ data: waitingRoom }]);

    const result = await updateGameRoomPresence({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
    });

    expect(result).toMatchObject({
      kind: "room",
      room: {
        status: "waiting",
        hostId: "student",
        players: [{ id: "student", isHost: true }],
      },
    });
    expect(engineMock.leaveQuestionGameRoom).not.toHaveBeenCalled();
    expect(prismaMock.tx.gameRoom.updateMany).toHaveBeenCalledOnce();
    expect(prismaMock.tx.gameRoomPresence.deleteMany).toHaveBeenCalledOnce();
  });

  it("예상 밖 저장 충돌 뒤 새 거래의 교체 방에서 참가 권한을 다시 확인한다", async () => {
    const current = makeRoom();
    const conflicted = makeRoom({ version: 2 });
    const replacement = makeRoom({
      createdAt: 2_000,
      players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    });
    prismaMock.tx.$queryRaw
      .mockResolvedValueOnce([{ data: current }])
      .mockResolvedValueOnce([{ data: replacement }]);
    prismaMock.tx.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tx.gameRoom.findUnique.mockResolvedValue({ data: conflicted });

    const result = await updateGameRoomPresence({
      code: "1234",
      userId: "student",
      expectedCreatedAt: 1_000,
    });

    expect(result).toEqual({ kind: "forbidden" });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
