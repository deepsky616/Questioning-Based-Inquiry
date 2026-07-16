import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/question-game-run-cleanup-service", () => ({
  cleanupQuestionGameRuns: mocks.cleanup,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}));

import { GET } from "@/app/api/cron/game-runs/cleanup/route";

function request(authorization?: string) {
  const headers = authorization ? { authorization } : undefined;
  return GET(new Request("http://localhost/api/cron/game-runs/cleanup", { headers }));
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  mocks.cleanup.mockReset().mockResolvedValue({ expiredCount: 4, deletedCount: 2 });
  mocks.loggerError.mockReset();
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("질문놀이 실행 예약 정리 경로", () => {
  it("정확한 비밀값이 있는 베어러 요청만 정리를 실행한다", async () => {
    const response = await request("Bearer cron-secret");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ expiredCount: 4, deletedCount: 2 });
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it.each([undefined, "Bearer wrong", "cron-secret"])(
    "인증값 %s 요청은 거부한다",
    async (authorization) => {
      const response = await request(authorization);

      expect(response.status).toBe(401);
      expect(mocks.cleanup).not.toHaveBeenCalled();
    },
  );

  it("비밀값 설정이 없으면 정리를 실행하지 않는다", async () => {
    delete process.env.CRON_SECRET;

    const response = await request("Bearer cron-secret");

    expect(response.status).toBe(503);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith("질문놀이 실행 정리 예약 오류", {
      errorCount: 1,
    });
  });

  it("정리 실패 응답에 내부 오류 내용을 넣지 않는다", async () => {
    mocks.cleanup.mockRejectedValue(new Error("private-database-value"));

    const response = await request("Bearer cron-secret");
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "실행 정리에 실패했습니다" });
    expect(JSON.stringify(body)).not.toContain("private-database-value");
  });
});
