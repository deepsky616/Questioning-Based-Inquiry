import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/game-room-cleanup-service", () => ({
  cleanupExpiredGameRooms: mocks.cleanup,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}));

import { GET } from "@/app/api/cron/question-game-rooms/cleanup/route";

function request(authorization?: string) {
  const headers = authorization ? { authorization } : undefined;
  return GET(new Request("http://localhost/api/cron/question-game-rooms/cleanup", { headers }));
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  mocks.cleanup.mockReset().mockResolvedValue({ deletedCount: 3, errorCount: 1 });
  mocks.loggerError.mockReset();
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("질문놀이 방 예약 정리", () => {
  it("정확한 비밀값을 담은 베어러 요청만 정리를 실행한다", async () => {
    const response = await request("Bearer cron-secret");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deletedCount: 3, errorCount: 1 });
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

  it("비밀값 설정이 없으면 닫힌 상태로 실패한다", async () => {
    delete process.env.CRON_SECRET;

    const response = await request("Bearer cron-secret");

    expect(response.status).toBe(503);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith("질문놀이 방 정리 예약 오류", {
      errorCount: 1,
    });
  });

  it("정리 조회가 실패하면 내부 자료를 노출하지 않는다", async () => {
    mocks.cleanup.mockRejectedValue(new Error("민감한 자료가 포함된 저장소 오류"));

    const response = await request("Bearer cron-secret");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "방 정리에 실패했습니다" });
    expect(mocks.loggerError).toHaveBeenCalledWith("질문놀이 방 정리 예약 오류", {
      errorCount: 1,
    });
  });
});
