import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomPlayer,
} from "@/lib/question-games-data";
import { applyQuestionGameRoomCommand } from "@/lib/question-game-room-engine";

const mocks = vi.hoisted(() => ({
  loadLockedGameRoom: vi.fn(),
  saveGameRoom: vi.fn(),
  initializeAndTouch: vi.fn(),
  findStale: vi.fn(),
  isStale: vi.fn(),
  deletePresence: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/game-room-store", () => ({
  loadLockedGameRoom: mocks.loadLockedGameRoom,
  saveGameRoom: mocks.saveGameRoom,
}));

vi.mock("@/lib/game-room-presence-store", () => ({
  initializeAndTouchGameRoomPresence: mocks.initializeAndTouch,
  findStaleGameRoomParticipant: mocks.findStale,
  isGameRoomPresenceStale: mocks.isStale,
  deleteGameRoomPresence: mocks.deletePresence,
}));

import { updateGameRoomPresence } from "@/lib/game-room-presence-service";

const BUILT_IN_GAME_IDS = BUILT_IN_GAMES.map(({ id }) => id);
const UUIDS = {
  command: "10000000-0000-4000-8000-000000000001",
  generated: "10000000-0000-4000-8000-000000000002",
};

function player(id: string, isHost = false, joinedAt = 1): RoomPlayer {
  return { id, name: id, isHost, joinedAt };
}

function waitingRoom(
  gameId: string,
  players: RoomPlayer[],
): GameRoom {
  return {
    code: "1234",
    gameId,
    hostId: players.find(({ isHost }) => isHost)?.id ?? "",
    status: "waiting",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

function changedRoom(result: ReturnType<typeof applyQuestionGameRoomCommand>) {
  expect(result.kind).toBe("changed");
  if (result.kind !== "changed") throw new Error("변경된 방이 필요합니다");
  return result.room;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (callback: (tx: Record<string, never>) => unknown) => callback({}),
  );
  mocks.initializeAndTouch.mockResolvedValue(undefined);
  mocks.isStale.mockResolvedValue(true);
  mocks.deletePresence.mockResolvedValue(undefined);
  mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
    kind: "saved" as const,
    room: { ...room, version: room.version + 1 },
  }));
});

describe("대기 질문놀이 접속 정리", () => {
  it.each(BUILT_IN_GAME_IDS)(
    "%s 빈 대기 방에서 오래된 비방장만 안전하게 내보낸다",
    async (gameId) => {
      const room = waitingRoom(gameId, [
        player("host", true, 1),
        player("stale", false, 2),
        player("active", false, 3),
      ]);
      mocks.loadLockedGameRoom.mockResolvedValue(room);
      mocks.findStale.mockResolvedValue("stale");

      const result = await updateGameRoomPresence({
        code: room.code,
        userId: "active",
        expectedCreatedAt: room.createdAt,
      });

      expect(result).toMatchObject({
        kind: "room",
        room: {
          status: "waiting",
          hostId: "host",
          gameState: {},
          players: [
            { id: "host", isHost: true },
            { id: "active", isHost: false },
          ],
        },
      });
    },
  );

  it.each(BUILT_IN_GAME_IDS)(
    "%s 빈 대기 방에서 오래된 방장을 내보내고 다음 참가자에게 방장을 넘긴다",
    async (gameId) => {
      const room = waitingRoom(gameId, [
        player("stale-host", true, 1),
        player("active", false, 2),
      ]);
      mocks.loadLockedGameRoom.mockResolvedValue(room);
      mocks.findStale.mockResolvedValue("stale-host");

      const result = await updateGameRoomPresence({
        code: room.code,
        userId: "active",
        expectedCreatedAt: room.createdAt,
      });

      expect(result).toMatchObject({
        kind: "room",
        room: {
          status: "waiting",
          hostId: "active",
          gameState: {},
          players: [{ id: "active", isHost: true }],
        },
      });
    },
  );

  it("진행 중 판본 둘 방은 실제 놀이 판정기로 이탈 상태를 정리한다", async () => {
    const waiting = waitingRoom("dice", [
      player("host", true, 1),
      player("stale", false, 2),
      player("active", false, 3),
    ]);
    const playing = changedRoom(applyQuestionGameRoomCommand({
      room: waiting,
      userId: "host",
      userName: "host",
      action: "start",
      body: {
        commandId: UUIDS.command,
        expectedCreatedAt: waiting.createdAt,
        expectedVersion: waiting.version,
      },
      now: 2_000,
      random: () => 0,
      randomUUID: () => UUIDS.generated,
    }));
    mocks.loadLockedGameRoom.mockResolvedValue(playing);
    mocks.findStale.mockResolvedValue("stale");

    const result = await updateGameRoomPresence({
      code: playing.code,
      userId: "active",
      expectedCreatedAt: playing.createdAt,
      random: () => 0,
      randomUUID: () => UUIDS.generated,
    });

    expect(result).toMatchObject({
      kind: "room",
      room: {
        status: "playing",
        players: [
          { id: "host", isHost: true },
          { id: "active", isHost: false },
        ],
        gameState: {
          stateVersion: 2,
          game: "dice",
          turnOrder: ["host", "active"],
        },
      },
    });
  });
});
