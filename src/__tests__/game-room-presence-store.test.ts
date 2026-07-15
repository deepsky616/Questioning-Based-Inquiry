import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const prismaMock = vi.hoisted(() => ({
  gameRoomPresence: {
    createMany: vi.fn(),
    upsert: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  deleteGameRoomPresence,
  findStaleGameRoomParticipant,
  initializeAndTouchGameRoomPresence,
  isGameRoomPresenceStale,
} from "@/lib/game-room-presence-store";

function makeRoom(): GameRoom {
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
    gameState: { stateVersion: 2 },
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

beforeEach(() => {
  prismaMock.gameRoomPresence.createMany.mockReset().mockResolvedValue({ count: 2 });
  prismaMock.gameRoomPresence.upsert.mockReset().mockResolvedValue({});
  prismaMock.gameRoomPresence.findFirst.mockReset();
  prismaMock.gameRoomPresence.deleteMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("initializeAndTouchGameRoomPresence", () => {
  it("처음 확인한 방은 모든 현재 참가자를 같은 서버 시각으로 초기화한 뒤 요청자를 갱신한다", async () => {
    const room = makeRoom();
    const now = new Date("2026-07-15T01:00:00.000Z");

    await initializeAndTouchGameRoomPresence({ room, userId: "student", now });

    expect(prismaMock.gameRoomPresence.createMany).toHaveBeenCalledWith({
      data: [
        {
          roomCode: "1234",
          roomCreatedAt: BigInt(1_000),
          userId: "host",
          lastSeenAt: now,
        },
        {
          roomCode: "1234",
          roomCreatedAt: BigInt(1_000),
          userId: "student",
          lastSeenAt: now,
        },
      ],
      skipDuplicates: true,
    });
    expect(prismaMock.gameRoomPresence.upsert).toHaveBeenCalledWith({
      where: {
        roomCode_roomCreatedAt_userId: {
          roomCode: "1234",
          roomCreatedAt: BigInt(1_000),
          userId: "student",
        },
      },
      create: {
        roomCode: "1234",
        roomCreatedAt: BigInt(1_000),
        userId: "student",
        lastSeenAt: now,
      },
      update: { lastSeenAt: now },
    });
  });
});

describe("오래된 접속 조회", () => {
  it("현재 참가자 중 기준 시각보다 오래된 한 명만 찾는다", async () => {
    const room = makeRoom();
    const staleBefore = new Date("2026-07-15T00:58:00.000Z");
    prismaMock.gameRoomPresence.findFirst.mockResolvedValue({ userId: "host" });

    await expect(findStaleGameRoomParticipant({ room, staleBefore }))
      .resolves.toBe("host");

    expect(prismaMock.gameRoomPresence.findFirst).toHaveBeenCalledWith({
      where: {
        roomCode: "1234",
        roomCreatedAt: BigInt(1_000),
        userId: { in: ["host", "student"] },
        lastSeenAt: { lt: staleBefore },
      },
      orderBy: [{ lastSeenAt: "asc" }, { userId: "asc" }],
      select: { userId: true },
    });
  });

  it("저장 직전에는 선택한 참가자가 여전히 오래됐을 때만 참이다", async () => {
    const room = makeRoom();
    const staleBefore = new Date("2026-07-15T00:58:00.000Z");
    prismaMock.gameRoomPresence.findFirst.mockResolvedValue({ userId: "host" });

    await expect(isGameRoomPresenceStale({
      room,
      userId: "host",
      staleBefore,
    })).resolves.toBe(true);

    expect(prismaMock.gameRoomPresence.findFirst).toHaveBeenCalledWith({
      where: {
        roomCode: "1234",
        roomCreatedAt: BigInt(1_000),
        userId: "host",
        lastSeenAt: { lt: staleBefore },
      },
      select: { userId: true },
    });
  });
});

describe("deleteGameRoomPresence", () => {
  it("방 수명과 사용자까지 모두 맞는 접속 행만 지운다", async () => {
    await deleteGameRoomPresence({
      roomCode: "1234",
      roomCreatedAt: 1_000,
      userId: "student",
    });

    expect(prismaMock.gameRoomPresence.deleteMany).toHaveBeenCalledWith({
      where: {
        roomCode: "1234",
        roomCreatedAt: BigInt(1_000),
        userId: "student",
      },
    });
  });
});
