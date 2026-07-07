import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
// AI 검증은 이 테스트 범위 밖 — 키 없음으로 기본 점수 경로만 태운다
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn().mockResolvedValue({ apiKey: null, model: "gemini-2.5-flash" }) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/points/award/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindFirst = prisma.pointLog.findFirst as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const awardReq = (body: unknown) =>
  new NextRequest("http://localhost/api/points/award", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const BODY = {
  gameId: "dice",
  roomCode: "ROOM1",
  contributions: [{ studentId: "s1", validQuestions: 2, isWinner: true }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mFindFirst.mockResolvedValue(null);
  mFindMany.mockResolvedValue([]);
  mTx.mockResolvedValue([]);
});

describe("포인트 지급 — 멱등성·중복 방지", () => {
  it("비로그인은 401, 필수 항목 누락은 400", async () => {
    mAuth.mockResolvedValue(null);
    expect((await POST(awardReq(BODY))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "t1" } });
    expect((await POST(awardReq({ gameId: "dice" }))).status).toBe(400);
  });

  it("같은 게임·방에 이미 지급됐으면 재지급 없이 기존 결과를 반환한다(멱등)", async () => {
    mFindFirst.mockResolvedValue({ id: "log1" });
    mFindMany.mockResolvedValue([{ id: "log1", points: 5 }]);
    const res = await POST(awardReq(BODY));
    const data = await res.json();
    expect(data.alreadyAwarded).toBe(true);
    expect(mTx).not.toHaveBeenCalled(); // 새 지급 없음
  });

  it("기본 점수(참여+유효질문+완료+우승)를 트랜잭션으로 지급하고 합계를 누적한다", async () => {
    const res = await POST(awardReq(BODY));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(mTx).toHaveBeenCalledTimes(1);
    // 참여·유효질문·완료·우승 4건
    const types = data.awards.map((a: { bonusType: string }) => a.bonusType);
    expect(types).toHaveLength(4);
    expect(new Set(types).size).toBe(4);
  });

  it("동시 호출로 unique 충돌(P2002)이 나면 기존 지급 결과로 응답한다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    mFindMany.mockResolvedValue([{ id: "log1" }]);
    const res = await POST(awardReq(BODY));
    const data = await res.json();
    expect(data.alreadyAwarded).toBe(true);
  });

  it("그 외 저장 실패는 500", async () => {
    mTx.mockRejectedValue(new Error("db down"));
    expect((await POST(awardReq(BODY))).status).toBe(500);
  });
});
