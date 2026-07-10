import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    pointLog: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/points/me/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mUser.mockResolvedValue({ totalPoints: 12 });
  mLogs.mockResolvedValue([]);
});

// 학생 최근 내역에 대기·거부·경고 기록이 노출되던 결함의 재발 방지
describe("학생 포인트 내역 — 확정 지급만 노출", () => {
  it("승인된 기록만, 경고(FLAGGED) 유형은 제외하고 조회한다", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const where = mLogs.mock.calls[0][0].where;
    expect(where.status).toBe("APPROVED");
    expect(where.NOT).toEqual({ bonusType: { contains: "FLAGGED" } });
  });

  it("비로그인은 401", async () => {
    mAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mLogs).not.toHaveBeenCalled();
  });
});
