import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_ACTIVITY_BONUS_PER_STUDENT } from "@/lib/activity-bonus-policy";
import { POST } from "@/app/api/teacher/points/decide/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mSessions = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/teacher/points/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mLogs.mockResolvedValue([
    { id: "log1", studentId: "s1", sessionId: "sess1", points: 0, student: { id: "s1" } },
  ]);
  mSessions.mockResolvedValue([{ id: "sess1" }]);
  mTx.mockResolvedValue([]);
});

// 경고 항목에 점수 수정(구제)을 개방하면서 함께 추가한 서버 범위 검증
describe("포인트 승인 — 수정 점수 범위 검증", () => {
  it("음수 수정 점수는 400 (감점 차단)", async () => {
    const res = await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: -3 }));
    expect(res.status).toBe(400);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("상한 초과·정수 아님도 400", async () => {
    expect(
      (await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: MAX_ACTIVITY_BONUS_PER_STUDENT + 1 }))).status,
    ).toBe(400);
    expect((await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: 2.5 }))).status).toBe(400);
  });

  it("범위 안 수정 점수(경고 항목 구제 포함)는 승인된다", async () => {
    const res = await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: 3 }));
    expect(res.status).toBe(200);
    expect(mTx).toHaveBeenCalledTimes(1);
  });
});
