import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => ({
  findRooms: vi.fn(),
  findSettlement: vi.fn(),
  ensurePoints: vi.fn(),
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

import { retryPendingQuestionGameRoomSettlementsForUser } from
  "@/lib/account-deletion-room-settlement";

function completedRoom(): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "student-2",
    status: "ended",
    players: [
      { id: "student-2", name: "친구", isHost: true, joinedAt: 2 },
    ],
    pointParticipants: [
      { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "student-2", name: "친구", isHost: false, joinedAt: 2 },
    ],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {
      stateVersion: 2,
      phase: "done",
      endReason: "completed",
      recentCommandIds: [],
    },
    version: 5,
    createdAt: 100,
    updatedAt: 200,
    playId: "00000000-0000-4000-8000-000000000004",
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    pointCompletedAt: 200,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findRooms.mockResolvedValue([{ code: "1234", data: completedRoom() }]);
  mocks.findSettlement.mockResolvedValue(null);
  mocks.ensurePoints.mockResolvedValue({ awards: [] });
});

describe("계정 삭제 전 질문놀이 정산", () => {
  it("이미 방을 나간 완료 참가자의 미지급 방도 기존 지급 서비스로 재시도한다", async () => {
    await retryPendingQuestionGameRoomSettlementsForUser("student-1");

    expect(mocks.findRooms).toHaveBeenCalledWith({
      orderBy: { code: "asc" },
      select: { code: true, data: true },
    });
    expect(mocks.findSettlement).toHaveBeenCalledWith({
      where: {
        gameId_awardKey: {
          gameId: "dice",
          awardKey: "room:1234:100:00000000-0000-4000-8000-000000000004",
        },
      },
      select: { outcome: true },
    });
    expect(mocks.ensurePoints).toHaveBeenCalledWith(completedRoom());
  });

  it.each(["AWARDED", "NO_ELIGIBLE_STUDENTS"])(
    "%s 정산 영수증이 있으면 불필요한 재정산을 하지 않는다",
    async (outcome) => {
      mocks.findSettlement.mockResolvedValue({ outcome });

      await retryPendingQuestionGameRoomSettlementsForUser("student-1");

      expect(mocks.ensurePoints).not.toHaveBeenCalled();
    },
  );

  it("재정산 실패는 삼키고 거래 안 최종 확인에 맡긴다", async () => {
    mocks.ensurePoints.mockRejectedValue(new Error("정산 실패"));

    await expect(
      retryPendingQuestionGameRoomSettlementsForUser("student-1"),
    ).resolves.toBeUndefined();
  });
});
