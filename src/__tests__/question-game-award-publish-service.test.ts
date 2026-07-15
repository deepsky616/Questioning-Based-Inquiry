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
import {
  QuestionGameAwardPublishError,
  loadVerifiedGameAwardResult,
} from "@/lib/question-game-award-publish-service";

const IDENTITY = {
  gameId: "dice",
  roomCode: "1234",
  roomCreatedAt: 100,
  playId: "11111111-1111-4111-8111-111111111111",
};
const ALLOWED_STUDENT_IDS = new Set(["student-1"]);

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

    await expect(
      loadVerifiedGameAwardResult(IDENTITY, ALLOWED_STUDENT_IDS),
    ).resolves.toEqual({
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
      orderBy: [
        { createdAt: "asc" },
        { studentId: "asc" },
        { bonusType: "asc" },
      ],
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
    await expect(
      loadVerifiedGameAwardResult(IDENTITY, ALLOWED_STUDENT_IDS),
    ).resolves.toBeNull();

    mocks.findMany.mockResolvedValue([{
      studentId: "student-1",
      bonusType: "PARTICIPATION",
      points: Number.NaN,
      reason: "게임 참여",
      status: "APPROVED",
      aiAnalysis: null,
    }]);
    await expect(
      loadVerifiedGameAwardResult(IDENTITY, ALLOWED_STUDENT_IDS),
    ).resolves.toBeNull();
  });

  it("rejects approved logs outside the current room student scope", async () => {
    mocks.findMany.mockResolvedValue([{
      studentId: "student-outside-room",
      bonusType: "PARTICIPATION",
      points: 5,
      reason: "게임 참여",
      status: "APPROVED",
      aiAnalysis: null,
    }]);

    const request = loadVerifiedGameAwardResult(
      IDENTITY,
      ALLOWED_STUDENT_IDS,
    );

    await expect(request).rejects.toBeInstanceOf(QuestionGameAwardPublishError);
    await expect(request).rejects.toMatchObject({
      status: 403,
      message: "현재 방 참가 학생의 점수만 공개할 수 있습니다",
    });
  });
});
