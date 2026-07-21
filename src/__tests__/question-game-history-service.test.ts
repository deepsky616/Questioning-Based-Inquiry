import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db";
import {
  loadQuestionGameClassSummary,
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
        {
          gameId: "dice",
          mode: "solo",
          plays: BigInt(2),
          participants: BigInt(1),
          points: BigInt(8),
          goodQuestions: BigInt(3),
        },
        {
          gameId: "relay",
          mode: "friend",
          plays: BigInt(1),
          participants: BigInt(1),
          points: BigInt(6),
          goodQuestions: BigInt(2),
        },
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
      ])
      .mockResolvedValueOnce([
        {
          weekStart: "2026-07-06",
          plays: BigInt(1),
          goodQuestions: BigInt(2),
        },
        {
          weekStart: "2026-07-13",
          plays: BigInt(2),
          goodQuestions: BigInt(3),
        },
      ]);

    const history = await loadQuestionGameLearningHistory("student-1", 1);

    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(history.totals).toEqual({ plays: 3, points: 14, goodQuestions: 5 });
    expect(history.recent).toEqual([
      expect.objectContaining({ id: "run:run-2", points: 4, goodQuestions: 1 }),
    ]);
    expect(history.nextCursor).toEqual(expect.any(String));
    expect(history.weekly).toEqual([
      { weekStart: "2026-07-06", plays: 1, goodQuestions: 2 },
      { weekStart: "2026-07-13", plays: 2, goodQuestions: 3 },
    ]);
    expect(history.gameModes).toEqual([
      {
        gameId: "dice",
        modes: {
          solo: { plays: 2, completions: 2, participants: 1 },
          ai: { plays: 0, completions: 0, participants: 0 },
          friend: { plays: 0, completions: 0, participants: 0 },
        },
      },
      {
        gameId: "relay",
        modes: {
          solo: { plays: 0, completions: 0, participants: 0 },
          ai: { plays: 0, completions: 0, participants: 0 },
          friend: { plays: 1, completions: 1, participants: 1 },
        },
      },
    ]);
  });

  it("학급 학생들의 최근 주간 완료와 좋은 질문을 함께 집계한다", async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          gameId: "relay",
          mode: "friend",
          plays: BigInt(3),
          participants: BigInt(2),
          points: BigInt(18),
          goodQuestions: BigInt(7),
        },
      ])
      .mockResolvedValueOnce([
        { weekStart: "2026-07-13", plays: BigInt(3), goodQuestions: BigInt(7) },
      ]);

    const history = await loadQuestionGameClassSummary(["student-1", "student-2"]);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(history.totals).toEqual({ plays: 3, points: 18, goodQuestions: 7 });
    expect(history.weekly).toEqual([
      { weekStart: "2026-07-13", plays: 3, goodQuestions: 7 },
    ]);
    expect(history.gameModes).toEqual([
      {
        gameId: "relay",
        modes: {
          solo: { plays: 0, completions: 0, participants: 0 },
          ai: { plays: 0, completions: 0, participants: 0 },
          friend: { plays: 3, completions: 3, participants: 2 },
        },
      },
    ]);
    expect(history.recent).toEqual([]);
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
