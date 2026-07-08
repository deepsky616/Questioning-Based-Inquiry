import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    question: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { QUESTION_LIST_MAX } from "@/lib/questions";
import { GET } from "@/app/api/questions/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

const listReq = (query = "") => new Request(`http://localhost/api/questions${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mUserFind.mockResolvedValue({ school: "테스트초", teacherClasses: [] });
  mFindMany.mockResolvedValue([]);
});

describe("질문 목록 조회 상한 (누적 무제한 조회 방지)", () => {
  it("전체 조회에도 최근 N건 상한(take)이 항상 걸린다", async () => {
    const res = await GET(listReq());
    expect(res.status).toBe(200);
    expect(mFindMany).toHaveBeenCalledTimes(1);
    const args = mFindMany.mock.calls[0][0];
    expect(args.take).toBe(QUESTION_LIST_MAX);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("세션·필터를 지정해도 상한은 유지된다", async () => {
    await GET(listReq("?sessionId=s1&date=2026-07-08&likeSort=desc"));
    expect(mFindMany.mock.calls[0][0].take).toBe(QUESTION_LIST_MAX);
  });

  it("비로그인 조회는 401", async () => {
    mAuth.mockResolvedValue(null);
    expect((await GET(listReq())).status).toBe(401);
    expect(mFindMany).not.toHaveBeenCalled();
  });
});
