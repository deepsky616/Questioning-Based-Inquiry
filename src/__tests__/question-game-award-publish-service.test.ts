import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: {
      findMany: mocks.findMany,
    },
  },
}));

import { serializeGameAwardResultSnapshot } from "@/lib/game-award-result";
import { loadVerifiedGameAwardResult } from "@/lib/question-game-award-publish-service";

const IDENTITY = {
  gameId: "dice",
  roomCode: "1234",
  roomCreatedAt: 100,
  playId: "11111111-1111-4111-8111-111111111111",
};

describe("verified question game award publishing", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it("restores only approved logs for the exact game execution key", async () => {
    const snapshot = serializeGameAwardResultSnapshot({
      bestQuestion: {
        studentId: "student-1",
        question: "별은 왜 빛나나요?",
        reason: "탐구할 거리가 분명해요.",
      },
      summary: "질문을 끝까지 완성했어요.",
    });
    mocks.findMany.mockResolvedValue([
      {
        studentId: "student-1",
        bonusType: "PARTICIPATION",
        points: 5,
        reason: "게임 참여",
        status: "APPROVED",
        aiAnalysis: snapshot,
      },
      {
        studentId: "student-2",
        bonusType: "CREATIVE",
        points: 3,
        reason: "아직 승인되지 않은 점수",
        status: "PENDING",
        aiAnalysis: null,
      },
    ]);

    await expect(loadVerifiedGameAwardResult(IDENTITY)).resolves.toEqual({
      awards: [{
        studentId: "student-1",
        bonusType: "PARTICIPATION",
        points: 5,
        reason: "게임 참여",
      }],
      bestQuestion: {
        studentId: "student-1",
        question: "별은 왜 빛나나요?",
        reason: "탐구할 거리가 분명해요.",
      },
      summary: "질문을 끝까지 완성했어요.",
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        gameId: "dice",
        roomCode: "room:1234:100:11111111-1111-4111-8111-111111111111",
        status: "APPROVED",
      },
      orderBy: { createdAt: "asc" },
      select: {
        studentId: true,
        bonusType: true,
        points: true,
        reason: true,
        status: true,
        aiAnalysis: true,
      },
    });
  });

  it("returns null when the execution has no valid approved result", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(loadVerifiedGameAwardResult(IDENTITY)).resolves.toBeNull();

    mocks.findMany.mockResolvedValue([{
      studentId: "student-1",
      bonusType: "PARTICIPATION",
      points: Number.NaN,
      reason: "게임 참여",
      status: "APPROVED",
      aiAnalysis: null,
    }]);
    await expect(loadVerifiedGameAwardResult(IDENTITY)).resolves.toBeNull();
  });
});
