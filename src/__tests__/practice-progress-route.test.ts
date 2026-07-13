import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { practiceAttempt: { findMany: vi.fn() } },
}));

import { GET } from "@/app/api/practice/progress/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.practiceAttempt.findMany as unknown as ReturnType<typeof vi.fn>;

function makeAttempts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `attempt-${index}`,
    studentId: "student-1",
    mode: "quiz",
    itemId: `question-${index}`,
    quizType: "cognitive",
    correct: index % 2 === 0,
    createdAt: new Date(Date.now() - index * 60_000),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-13T03:00:00.000Z"));
  mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
  mFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("학생 개인 연습 진단 API", () => {
  it("비로그인은 401이고 조회하지 않는다", async () => {
    mAuth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mFindMany).not.toHaveBeenCalled();
  });

  it("학생이 아닌 역할은 403이고 조회하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mFindMany).not.toHaveBeenCalled();
  });

  it("학생 본인의 최근 30일 시도만 최신순으로 101개 요청한다", async () => {
    await GET();

    expect(mFindMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        createdAt: { gte: new Date("2026-06-13T03:00:00.000Z") },
      },
      orderBy: { createdAt: "desc" },
      take: 101,
    });
  });

  it("101번째 시도는 진단에서 빼고 상한 도달 여부를 알린다", async () => {
    mFindMany.mockResolvedValue(makeAttempts(101));

    const data = await (await GET()).json();

    expect(data.capped).toBe(true);
    expect(data.activityAttempts).toBe(100);
  });

  it("시도가 100개 이하면 상한에 도달하지 않은 것으로 알린다", async () => {
    mFindMany.mockResolvedValue(makeAttempts(100));

    const data = await (await GET()).json();

    expect(data.capped).toBe(false);
    expect(data.activityAttempts).toBe(100);
  });
});
