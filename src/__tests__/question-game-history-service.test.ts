import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db";
import {
  loadQuestionGameHistoryPage,
  loadQuestionGameLearningHistory,
} from "@/lib/question-game-history-service";

const queryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("질문놀이 학습 이력 조회", () => {
  it("전체 기록 대신 합계와 제한된 최근 기록만 조회한다", async () => {
    queryRaw
      .mockResolvedValueOnce([
        { mode: "solo", plays: BigInt(2), points: BigInt(8), goodQuestions: BigInt(3) },
        { mode: "friend", plays: BigInt(1), points: BigInt(6), goodQuestions: BigInt(2) },
      ])
      .mockResolvedValueOnce([
        {
          id: "run:run-2",
          gameId: "dice",
          mode: "solo",
          completedAt: new Date("2026-07-17T02:00:00Z"),
          points: BigInt(4),
          goodQuestions: BigInt(1),
        },
        {
          id: "friend:room:1000:1:play",
          gameId: "relay",
          mode: "friend",
          completedAt: new Date("2026-07-17T01:00:00Z"),
          points: BigInt(6),
          goodQuestions: BigInt(2),
        },
      ]);

    const history = await loadQuestionGameLearningHistory("student-1", 1);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(history.totals).toEqual({ plays: 3, points: 14, goodQuestions: 5 });
    expect(history.recent).toEqual([
      expect.objectContaining({ id: "run:run-2", points: 4, goodQuestions: 1 }),
    ]);
    expect(history.nextCursor).toEqual(expect.any(String));
  });

  it("방식과 놀이 필터를 적용하고 커서로 다음 묶음을 반환한다", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: "run:run-3",
        gameId: "kaba",
        mode: "ai",
        completedAt: new Date("2026-07-17T03:00:00Z"),
        points: BigInt(7),
        goodQuestions: BigInt(2),
      },
      {
        id: "run:run-2",
        gameId: "kaba",
        mode: "ai",
        completedAt: new Date("2026-07-17T02:00:00Z"),
        points: BigInt(5),
        goodQuestions: BigInt(1),
      },
    ]);

    const page = await loadQuestionGameHistoryPage({
      studentId: "student-1",
      mode: "ai",
      gameId: "kaba",
      limit: 1,
    });

    expect(page.items).toEqual([
      expect.objectContaining({ id: "run:run-3", mode: "ai", gameId: "kaba" }),
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
  });
});
