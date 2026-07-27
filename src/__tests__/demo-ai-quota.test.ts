import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: dbMocks.queryRaw,
  },
}));

import {
  consumeDemoAiQuota,
  demoUsageDate,
} from "@/lib/demo-ai-quota";
import { DemoAiQuotaError } from "@/lib/ai-errors";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEMO_AI_DAILY_LIMIT;
});

describe("시연 인공지능 하루 사용량", () => {
  it("한국 날짜를 기준으로 사용량을 기록한다", () => {
    expect(demoUsageDate(new Date("2026-07-27T14:59:59.000Z"))).toBe(
      "2026-07-27",
    );
    expect(demoUsageDate(new Date("2026-07-27T15:00:00.000Z"))).toBe(
      "2026-07-28",
    );
  });

  it("원자적 증가 결과를 반환한다", async () => {
    dbMocks.queryRaw.mockResolvedValue([{ requestCount: 1 }]);

    await expect(
      consumeDemoAiQuota(
        "demo-student",
        new Date("2026-07-27T03:00:00.000Z"),
      ),
    ).resolves.toBe(1);
    expect(dbMocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("한도에 도달해 증가하지 못하면 외부 요청 전에 거절한다", async () => {
    dbMocks.queryRaw.mockResolvedValue([]);

    await expect(
      consumeDemoAiQuota(
        "demo-student",
        new Date("2026-07-27T03:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(DemoAiQuotaError);
  });

  it("하루 한도 환경값은 1부터 1000까지만 허용한다", async () => {
    process.env.DEMO_AI_DAILY_LIMIT = "5000";
    dbMocks.queryRaw.mockResolvedValue([{ requestCount: 1 }]);

    await consumeDemoAiQuota("demo-student");

    const query = dbMocks.queryRaw.mock.calls[0]?.[0] as {
      values?: unknown[];
    };
    expect(query.values).toContain(120);
  });
});
