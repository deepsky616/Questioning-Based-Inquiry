import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    pointLog: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/teacher/question-games/stats/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockTeacher.mockResolvedValue({
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockStudents.mockResolvedValue([]);
  mockLogs.mockResolvedValue([]);
});

describe("교사 질문놀이 통계 접근 경계", () => {
  it("학생 조회에 교사의 학교와 담당 학급을 함께 적용한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        role: "STUDENT",
        school: "한빛초",
        OR: [{ grade: "5", className: "1" }],
      },
    }));
  });

  it("담당 학급이 없으면 같은 학교 학생 전체를 조회한다", async () => {
    mockTeacher.mockResolvedValue({ school: "한빛초", teacherClasses: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: "STUDENT", school: "한빛초" },
    }));
  });

  it("학교가 없는 교사는 학생 자료를 조회하기 전에 거부한다", async () => {
    mockTeacher.mockResolvedValue({
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockStudents).not.toHaveBeenCalled();
    expect(mockLogs).not.toHaveBeenCalled();
  });
});
