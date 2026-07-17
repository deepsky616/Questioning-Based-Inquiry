import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => ({
  findRooms: vi.fn(),
  findSettlement: vi.fn(),
  ensurePoints: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    gameRoom: { findMany: mocks.findRooms },
    gameRoomSettlement: { findUnique: mocks.findSettlement },
  },
}));
vi.mock("@/lib/point-award-service", () => ({
  ensureQuestionGameRoomPoints: mocks.ensurePoints,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.loggerWarn },
}));

import { inspectQuestionGameSettlements } from "@/lib/question-game-settlement-repair";

function completedRoom(code: string, hostId = "teacher-1"): GameRoom {
  return {
    code,
    gameId: "relay",
    hostId,
    status: "ended",
    players: [
      { id: hostId, name: "교사", isHost: true, joinedAt: 1 },
      { id: "student-1", name: "학생", isHost: false, joinedAt: 2 },
    ],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {
      stateVersion: 2,
      phase: "done",
      endReason: "completed",
    },
    version: 9,
    createdAt: 1_000,
    updatedAt: 2_000,
    playId: "10000000-0000-4000-8000-000000000001",
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
  };
}

function record(room: GameRoom) {
  return {
    code: room.code,
    data: room,
    updatedAt: new Date("2026-07-17T01:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findRooms.mockResolvedValue([]);
  mocks.findSettlement.mockResolvedValue(null);
  mocks.ensurePoints.mockResolvedValue({ awards: [] });
});

describe("질문놀이 포인트 지급 상태 점검", () => {
  it("교사가 만든 최근 종료 방만 조회하고 완료 장부가 있으면 재지급하지 않는다", async () => {
    const room = completedRoom("1234");
    mocks.findRooms.mockResolvedValue([record(room)]);
    mocks.findSettlement.mockResolvedValue({ outcome: "AWARDED" });

    const result = await inspectQuestionGameSettlements({
      teacherId: "teacher-1",
      repair: true,
      now: new Date("2026-07-17T02:00:00.000Z"),
    });

    expect(mocks.findRooms).toHaveBeenCalledWith({
      where: {
        AND: [
          { data: { path: ["status"], equals: "ended" } },
          { data: { path: ["hostId"], equals: "teacher-1" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { code: true, data: true, updatedAt: true },
    });
    expect(mocks.ensurePoints).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      checked: 1,
      settled: 1,
      recovered: 0,
      pending: 0,
      failed: 0,
    });
    expect(result.items[0]).toEqual(expect.objectContaining({
      code: "1234",
      status: "settled",
      outcome: "AWARDED",
    }));
  });

  it("장부가 빠진 방만 재시도하고 새 장부가 생기면 복구로 표시한다", async () => {
    const room = completedRoom("2345");
    mocks.findRooms.mockResolvedValue([record(room)]);
    mocks.findSettlement
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ outcome: "AWARDED" });

    const result = await inspectQuestionGameSettlements({ repair: true });

    expect(mocks.ensurePoints).toHaveBeenCalledOnce();
    expect(mocks.ensurePoints).toHaveBeenCalledWith(expect.objectContaining({
      code: room.code,
      gameId: room.gameId,
      playId: room.playId,
    }));
    expect(result.summary.recovered).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      status: "recovered",
      outcome: "AWARDED",
    }));
  });

  it("재시도하지 않은 누락 방과 재시도 실패 방을 서로 구분한다", async () => {
    const pendingRoom = completedRoom("3456");
    mocks.findRooms.mockResolvedValue([record(pendingRoom)]);

    const pending = await inspectQuestionGameSettlements({ repair: false });
    expect(pending.summary.pending).toBe(1);
    expect(pending.items[0]).toEqual(expect.objectContaining({
      status: "pending",
      reason: "포인트 지급 장부를 찾을 수 없습니다.",
    }));

    mocks.ensurePoints.mockRejectedValueOnce(new Error("자료 저장소 연결 실패"));
    const failed = await inspectQuestionGameSettlements({ repair: true });
    expect(failed.summary.failed).toBe(1);
    expect(failed.items[0]).toEqual(expect.objectContaining({
      status: "failed",
      reason: "자료 저장소 연결 실패",
    }));
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });
});
