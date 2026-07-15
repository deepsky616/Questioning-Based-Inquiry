import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    gameRoomCreateAttempt: {
      deleteMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    tx,
    transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));

async function consume(userId = "user-1") {
  const { consumeGameRoomCreateLimit } = await import(
    "@/lib/game-room-create-rate-limit"
  );
  return consumeGameRoomCreateLimit(userId);
}

const NOW = new Date("2026-07-15T03:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.tx.$queryRaw.mockResolvedValue([{ lock: "", now: NOW }]);
  mocks.tx.gameRoomCreateAttempt.deleteMany.mockResolvedValue({ count: 0 });
  mocks.tx.gameRoomCreateAttempt.count.mockResolvedValue(9);
  mocks.tx.gameRoomCreateAttempt.create.mockResolvedValue({});
});

describe("질문놀이 방 생성 제한", () => {
  it("사용자 잠금 뒤 지난 시도를 버리고 최근 열 번째 시도를 기록한다", async () => {
    await expect(consume()).resolves.toBe(true);

    const [query, ...values] = mocks.tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(query.join("?")).toContain("pg_advisory_xact_lock");
    expect(values).toContain("game-room-create:user-1");
    expect(mocks.tx.gameRoomCreateAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        createdAt: { lte: new Date("2026-07-15T02:59:00.000Z") },
      },
    });
    expect(mocks.tx.gameRoomCreateAttempt.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mocks.tx.gameRoomCreateAttempt.create).toHaveBeenCalledWith({
      data: { userId: "user-1", createdAt: NOW },
    });
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.gameRoomCreateAttempt.count.mock.invocationCallOrder[0],
    );
  });

  it("최근 시도가 이미 열 건이면 새 시도를 기록하지 않고 거부한다", async () => {
    mocks.tx.gameRoomCreateAttempt.count.mockResolvedValue(10);

    await expect(consume()).resolves.toBe(false);

    expect(mocks.tx.gameRoomCreateAttempt.create).not.toHaveBeenCalled();
  });

  it("다른 사용자는 서로 다른 거래 잠금과 시도 범위를 쓴다", async () => {
    await expect(consume("user-2")).resolves.toBe(true);

    const [, ...values] = mocks.tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(values).toContain("game-room-create:user-2");
    expect(mocks.tx.gameRoomCreateAttempt.count).toHaveBeenCalledWith({
      where: { userId: "user-2" },
    });
  });
});
