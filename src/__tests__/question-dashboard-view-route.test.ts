import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    question: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/questions/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mGroupBy = prisma.question.groupBy as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

const dashboardRequest = (query = "") =>
  new Request(`http://localhost/api/questions?view=dashboard${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
  mUserFind.mockResolvedValue({ school: "테스트초", grade: "5", className: "1", teacherClasses: [] });

  mFindMany.mockImplementation((args: { take?: number; distinct?: string[] }) => {
    if (args.take === 5) {
      return [
        {
          id: "q2",
          content: "두 번째 질문",
          closure: "open",
          cognitive: "conceptual",
          createdAt: new Date("2026-07-13T02:00:00.000Z"),
        },
        {
          id: "q1",
          content: "첫 번째 질문",
          closure: "closed",
          cognitive: "factual",
          createdAt: new Date("2026-07-12T02:00:00.000Z"),
        },
      ];
    }
    if (args.distinct?.includes("sessionId")) {
      return [{ sessionId: "session-1" }, { sessionId: "session-2" }];
    }
    return [];
  });

  mGroupBy.mockImplementation((args: { by: string[] }) => {
    if (args.by.includes("closure")) {
      return [
        { closure: "closed", _count: { _all: 2 } },
        { closure: "open", _count: { _all: 5 } },
      ];
    }
    if (args.by.includes("cognitive")) {
      return [
        { cognitive: "factual", _count: { _all: 3 } },
        { cognitive: "conceptual", _count: { _all: 2 } },
        { cognitive: "controversial", _count: { _all: 2 } },
      ];
    }
    throw new Error("예상하지 못한 groupBy 호출입니다");
  });
});

describe("학생 대시보드 질문 요약", () => {
  it("로그인 학생 본인의 최근 질문, 전체 통계, 작성한 수업 아이디만 반환한다", async () => {
    const response = await GET(dashboardRequest("&authorId=another-student"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      recent: [
        {
          id: "q2",
          content: "두 번째 질문",
          closure: "open",
          cognitive: "conceptual",
          createdAt: "2026-07-13T02:00:00.000Z",
        },
        {
          id: "q1",
          content: "첫 번째 질문",
          closure: "closed",
          cognitive: "factual",
          createdAt: "2026-07-12T02:00:00.000Z",
        },
      ],
      stats: {
        total: 7,
        byClosure: { closed: 2, open: 5 },
        byCognitive: { factual: 3, conceptual: 2, controversial: 2 },
      },
      answeredSessionIds: ["session-1", "session-2"],
    });

    const recentCall = mFindMany.mock.calls.find(([args]) => args.take === 5)?.[0];
    expect(recentCall).toEqual({
      where: { authorId: "student-1" },
      select: {
        id: true,
        content: true,
        closure: true,
        cognitive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const sessionCall = mFindMany.mock.calls.find(([args]) => args.distinct?.includes("sessionId"))?.[0];
    expect(sessionCall).toEqual({
      where: { authorId: "student-1", sessionId: { not: null } },
      select: { sessionId: true },
      distinct: ["sessionId"],
      orderBy: { sessionId: "asc" },
    });
    expect(mGroupBy.mock.calls.every(([args]) => args.where.authorId === "student-1")).toBe(true);
  });

  it("학생이 아닌 사용자는 전용 보기를 조회할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });

    const response = await GET(dashboardRequest());

    expect(response.status).toBe(403);
    expect(mFindMany).not.toHaveBeenCalled();
    expect(mGroupBy).not.toHaveBeenCalled();
  });
});
