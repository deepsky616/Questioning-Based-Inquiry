import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/question-game-settings-store", () => ({
  loadQuestionGameSettingsForTeachers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    teacherClass: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/question-games/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadQuestionGameSettingsForTeachers } from "@/lib/question-game-settings-store";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockStudent = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockTeachers = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockLegacyTeacherClasses = prisma.teacherClass.findMany as unknown as ReturnType<typeof vi.fn>;
const mockSettings = loadQuestionGameSettingsForTeachers as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
  mockStudent.mockResolvedValue({
    id: "student-1",
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  });
  mockTeachers.mockResolvedValue([{ id: "teacher-1" }]);
  mockLegacyTeacherClasses.mockResolvedValue([{ teacherId: "other-school-teacher" }]);
  mockSettings.mockResolvedValue({ customGames: [], visibilityMap: {}, orderIds: null });
});

describe("학생 질문놀이 접근 경계", () => {
  it("데이터베이스 학생 소속과 같은 학교의 담당 교사만 찾는다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockTeachers).toHaveBeenCalledWith({
      where: {
        role: "TEACHER",
        school: "한빛초",
        OR: [
          { teacherClasses: { some: { grade: "5", className: "1" } } },
          { teacherClasses: { none: {} } },
        ],
      },
      select: { id: true },
    });
    expect(mockSettings).toHaveBeenCalledWith(["teacher-1"]);
    expect(mockLegacyTeacherClasses).not.toHaveBeenCalled();
  });

  it("학생 학교 정보가 없으면 교사 설정을 읽기 전에 거부한다", async () => {
    mockStudent.mockResolvedValue({
      id: "student-1",
      role: "STUDENT",
      school: null,
      grade: "5",
      className: "1",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockTeachers).not.toHaveBeenCalled();
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it("학생이 아닌 역할은 학생용 놀이 목록을 조회할 수 없다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockStudent).not.toHaveBeenCalled();
  });
});
