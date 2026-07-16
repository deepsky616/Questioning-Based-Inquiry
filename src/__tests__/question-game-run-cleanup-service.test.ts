import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    gameRun: {
      deleteMany: vi.fn(),
    },
  };
  return {
    tx,
    transaction: vi.fn(),
    loggerInfo: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.loggerInfo },
}));

import { cleanupQuestionGameRuns } from "@/lib/question-game-run-cleanup-service";

const NOW = new Date("2026-07-16T18:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.tx.$executeRaw.mockResolvedValue(0);
  mocks.tx.gameRun.deleteMany.mockImplementation(async ({ where }: {
    where: { id: { in: string[] } };
  }) => ({ count: where.id.in.length }));
});

describe("질문놀이 실행 예약 정리", () => {
  it("만료된 진행 실행을 닫고 점수 기록 없는 오래된 실행만 지운다", async () => {
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([{ id: "expired-1" }])
      .mockResolvedValueOnce([{ id: "abandoned-1" }]);
    mocks.tx.$executeRaw.mockResolvedValueOnce(1);

    await expect(cleanupQuestionGameRuns({ now: NOW })).resolves.toEqual({
      expiredCount: 1,
      deletedCount: 1,
    });

    const expireSql = mocks.tx.$executeRaw.mock.calls
      .map(([strings]) => (strings as TemplateStringsArray).join("?"))
      .join("\n");
    expect(expireSql).toContain('"state" = "state" - \'aiGenerationLease\'');
    expect(mocks.tx.gameRun.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["abandoned-1"] },
        status: { in: ["EXPIRED", "ABANDONED"] },
        updatedAt: { lte: new Date("2026-07-09T18:30:00.000Z") },
        pointLogs: { none: {} },
      },
    });
    const sql = mocks.tx.$queryRaw.mock.calls
      .map(([strings]) => (strings as TemplateStringsArray).join("?"))
      .join("\n");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain('FROM "point_logs"');
    expect(sql).toContain('ORDER BY gr."updated_at" ASC, gr."id" ASC');
    expect(mocks.loggerInfo).toHaveBeenCalledWith("질문놀이 실행 정리", {
      expiredCount: 1,
      deletedCount: 1,
    });
  });

  it("한 번에 백 개씩 최대 열 묶음만 처리한다", async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => ({ id: `run-${index}` }));
    mocks.tx.$queryRaw.mockResolvedValue(hundred);
    mocks.tx.$executeRaw.mockResolvedValue(100);

    await expect(cleanupQuestionGameRuns({ now: NOW })).resolves.toEqual({
      expiredCount: 1_000,
      deletedCount: 1_000,
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(10);
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(10);
    expect(mocks.tx.gameRun.deleteMany).toHaveBeenCalledTimes(10);
  });
});
