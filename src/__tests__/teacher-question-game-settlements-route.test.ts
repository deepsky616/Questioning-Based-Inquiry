import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/question-game-settlement-repair", () => ({
  inspectQuestionGameSettlements: mocks.inspect,
}));

import { GET, POST } from "@/app/api/teacher/question-games/settlements/route";

const health = {
  checkedAt: "2026-07-17T02:00:00.000Z",
  summary: { checked: 2, settled: 1, recovered: 0, pending: 1, failed: 0 },
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: "teacher-1", role: "TEACHER" },
  });
  mocks.inspect.mockResolvedValue(health);
});

describe("교사 질문놀이 포인트 지급 상태", () => {
  it("조회는 담당 교사의 방을 재지급 없이 점검한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(health);
    expect(mocks.inspect).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      repair: false,
    });
  });

  it("복구 요청은 담당 교사의 누락 방만 재시도한다", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      repair: true,
    });
  });

  it("학생과 비로그인 사용자는 지급 상태를 확인할 수 없다", async () => {
    mocks.auth.mockResolvedValueOnce({
      user: { id: "student-1", role: "STUDENT" },
    });
    expect((await GET()).status).toBe(403);
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST()).status).toBe(401);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
