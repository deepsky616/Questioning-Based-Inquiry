import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    question: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { GET } from "@/app/api/stats/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuestionFind = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mockQuestionGroup = prisma.question.groupBy as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockUserFind.mockResolvedValue({
    school: "테스트 학교",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockQuestionFind.mockResolvedValue([]);
  mockQuestionGroup.mockResolvedValue([]);
});

describe("교사 대시보드 통계 경로", () => {
  it("집계에 필요한 질문 열만 조회한다", async () => {
    const response = await GET(new Request("http://localhost/api/stats?period=month"));

    expect(response.status).toBe(200);
    expect(mockQuestionFind).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: expect.any(Date) },
        author: {
          role: "STUDENT",
          school: "테스트 학교",
          OR: [{ grade: "5", className: "1" }],
        },
      },
      select: {
        createdAt: true,
        closure: true,
        cognitive: true,
        author: {
          select: {
            id: true,
            name: true,
            className: true,
            grade: true,
            studentNumber: true,
          },
        },
      },
    });
    expect(await response.json()).toEqual({
      total: 0,
      byClosure: { closed: 0, open: 0 },
      byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
      byStudent: [],
      timeline: [],
      school: "테스트 학교",
      teacherClasses: [{ grade: "5", className: "1" }],
    });
  });

  it("교사가 아니면 질문을 조회하지 않는다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });

    const response = await GET(new Request("http://localhost/api/stats"));

    expect(response.status).toBe(403);
    expect(mockUserFind).not.toHaveBeenCalled();
    expect(mockQuestionFind).not.toHaveBeenCalled();
  });

  it("학생 활동 보기는 질문 본문 없이 작성 학생 식별값만 묶어 반환한다", async () => {
    mockQuestionGroup.mockResolvedValue([
      { authorId: "student-2" },
      { authorId: "student-1" },
    ]);

    const response = await GET(new Request(
      "http://localhost/api/stats?view=student-activity&period=month&grade=5&className=1",
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeStudentIds: ["student-2", "student-1"] });
    expect(mockQuestionGroup).toHaveBeenCalledWith({
      by: ["authorId"],
      where: {
        createdAt: { gte: expect.any(Date) },
        author: {
          role: "STUDENT",
          school: "테스트 학교",
          grade: "5",
          className: "1",
        },
      },
    });
    expect(mockQuestionFind).not.toHaveBeenCalled();
  });
});
