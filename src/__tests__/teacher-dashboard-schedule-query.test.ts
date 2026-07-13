import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findMany: vi.fn() },
    teacherClass: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    question: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/sessions/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindSessions = prisma.questionSession.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockFindSessions.mockResolvedValue([
    {
      id: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "물질의 변화",
      isActive: true,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
    },
  ]);
});

describe("교사 대시보드 일정 조회", () => {
  it("전체 참여 현황을 계산하지 않고 활성 수업 일정 필드만 읽는다", async () => {
    const response = await GET(
      new Request("http://localhost/api/sessions?view=schedule"),
    );

    expect(response.status).toBe(200);
    expect(mockFindSessions).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1", isActive: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        subject: true,
        topic: true,
        isActive: true,
        createdAt: true,
        targetType: true,
        targetGrade: true,
        targetClassName: true,
        targetStudentId: true,
        targetStudentIds: true,
        unitDesignId: true,
        sharedQuestions: true,
      },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.question.findMany).not.toHaveBeenCalled();
  });
});
