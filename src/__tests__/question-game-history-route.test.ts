import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/teacher-student-access", () => ({
  loadTeacherStudentScope: vi.fn(),
  isStudentInTeacherScope: vi.fn(),
}));
vi.mock("@/lib/question-game-history-service", () => ({
  loadQuestionGameHistoryPage: vi.fn(),
  isQuestionGameHistoryCursor: vi.fn(() => true),
}));

import { GET } from "@/app/api/reports/question-games/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadQuestionGameHistoryPage } from "@/lib/question-game-history-service";
import {
  isStudentInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockStudent = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockLoad = loadQuestionGameHistoryPage as ReturnType<typeof vi.fn>;
const mockScope = loadTeacherStudentScope as ReturnType<typeof vi.fn>;
const mockInScope = isStudentInTeacherScope as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockResolvedValue({ items: [], nextCursor: null });
});

describe("질문놀이 상세 이력 경로", () => {
  it("학생은 본인의 필터된 다음 이력만 조회한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });

    const response = await GET(new NextRequest(
      "http://localhost/api/reports/question-games?mode=ai&gameId=kaba&limit=12&cursor=next",
    ));

    expect(response.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith({
      studentId: "student-1",
      mode: "ai",
      gameId: "kaba",
      limit: 12,
      cursor: "next",
    });
  });

  it("교사는 담당 학생만 조회한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    mockScope.mockResolvedValue({ school: "학교", classes: [] });
    mockStudent.mockResolvedValue({ role: "STUDENT", school: "학교", grade: "5", className: "1" });
    mockInScope.mockReturnValue(true);

    const response = await GET(new NextRequest(
      "http://localhost/api/reports/question-games?studentId=student-1",
    ));

    expect(response.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ studentId: "student-1" }));
  });

  it("학생이 다른 학생 식별자를 보내면 거부한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });

    const response = await GET(new NextRequest(
      "http://localhost/api/reports/question-games?studentId=student-2",
    ));

    expect(response.status).toBe(403);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("올바르지 않은 방식과 페이지 크기는 조회 전에 거부한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });

    const badMode = await GET(new NextRequest(
      "http://localhost/api/reports/question-games?mode=group",
    ));
    const badLimit = await GET(new NextRequest(
      "http://localhost/api/reports/question-games?limit=100",
    ));

    expect(badMode.status).toBe(400);
    expect(badLimit.status).toBe(400);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
