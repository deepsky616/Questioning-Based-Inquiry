import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const dbMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  transactionQueryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: dbMocks.queryRaw,
    $transaction: dbMocks.transaction,
  },
}));

import {
  loadQuestionGameClassSummary,
  loadQuestionGameHistoryPage,
  loadQuestionGameLearningHistory,
} from "@/lib/question-game-history-service";

const queryRaw = dbMocks.queryRaw;
const transactionQueryRaw = dbMocks.transactionQueryRaw;

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.transaction.mockImplementation(async (run) => run({
    $queryRaw: transactionQueryRaw,
  }));
});

describe("질문놀이 학습 이력 조회", () => {
  it("전체 기록 대신 합계와 제한된 최근 기록만 조회한다", async () => {
    transactionQueryRaw
      .mockResolvedValueOnce([
        {
          gameId: "dice",
          mode: "solo",
          plays: BigInt(2),
          participants: BigInt(1),
          points: new Prisma.Decimal(8),
          goodQuestions: new Prisma.Decimal(3),
        },
        {
          gameId: "relay",
          mode: "friend",
          plays: BigInt(1),
          participants: BigInt(1),
          points: new Prisma.Decimal(6),
          goodQuestions: new Prisma.Decimal(2),
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
          goodQuestions: new Prisma.Decimal(2),
        },
      ])
      .mockResolvedValueOnce([
        {
          date: "2026-07-16",
          plays: BigInt(1),
          goodQuestions: BigInt(2),
        },
        {
          date: "2026-07-17",
          plays: BigInt(2),
          goodQuestions: new Prisma.Decimal(3),
        },
      ]);

    const history = await loadQuestionGameLearningHistory("student-1", 1);

    expect(dbMocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "RepeatableRead" },
    );
    expect(transactionQueryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(history.totals).toEqual({ plays: 3, points: 14, goodQuestions: 5 });
    expect(history.recent).toEqual([
      expect.objectContaining({ id: "run:run-2", points: 4, goodQuestions: 1 }),
    ]);
    expect(history.nextCursor).toEqual(expect.any(String));
    expect(history.daily).toEqual([
      { date: "2026-07-16", plays: 1, goodQuestions: 2 },
      { date: "2026-07-17", plays: 2, goodQuestions: 3 },
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

  it("학급 학생들의 최근 14일 완료와 인정 활동을 일별로 집계한다", async () => {
    transactionQueryRaw
      .mockResolvedValueOnce([
        {
          gameId: "relay",
          mode: "friend",
          plays: BigInt(3),
          participants: BigInt(2),
          points: new Prisma.Decimal(18),
          goodQuestions: new Prisma.Decimal(7),
        },
      ])
      .mockResolvedValueOnce([
        {
          date: "2026-07-17",
          plays: BigInt(3),
          goodQuestions: new Prisma.Decimal(7),
        },
      ]);

    const history = await loadQuestionGameClassSummary(["student-1", "student-2"]);

    expect(dbMocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "RepeatableRead" },
    );
    expect(transactionQueryRaw).toHaveBeenCalledTimes(2);
    expect(history.totals).toEqual({ plays: 3, points: 18, goodQuestions: 7 });
    expect(history.daily).toEqual([
      { date: "2026-07-17", plays: 3, goodQuestions: 7 },
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

  it("최근 기록보다 작은 합계는 잘못된 시점 자료로 보고 반환하지 않는다", async () => {
    transactionQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "run:run-1",
        gameId: "dice",
        mode: "solo",
        completedAt: new Date("2026-07-17T02:00:00Z"),
        points: BigInt(4),
        goodQuestions: BigInt(1),
      }])
      .mockResolvedValueOnce([]);

    await expect(loadQuestionGameLearningHistory("student-1"))
      .rejects.toThrow("질문놀이 학습 기록 집계가 일치하지 않습니다");
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
