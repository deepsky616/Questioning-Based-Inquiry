import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    questionSession: {
      create: vi.fn(),
    },
    question: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST as createSessionFromDesign } from "@/app/api/unit-design/[id]/session/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockSessionCreate = prisma.questionSession.create as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "teacher-1", role: "TEACHER" },
  });
  mockUserFindUnique.mockResolvedValue({
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockUserFindMany.mockResolvedValue([
    {
      id: "student-other-school",
      role: "STUDENT",
      school: "새봄초",
      grade: "5",
      className: "1",
    },
  ]);
  mockQueryRaw.mockResolvedValue([
    {
      id: "design-1",
      teacher_id: "teacher-1",
      title: "물질의 변화",
      subject: "과학",
      inquiry_questions: [],
    },
  ]);
  mockSessionCreate.mockResolvedValue({ id: "session-new" });
});

describe("탐구설계 질문수업 대상 저장 경계", () => {
  it("다른 학교 학생을 질문수업 대상으로 저장하기 전에 거부한다", async () => {
    const response = await createSessionFromDesign(
      new Request("http://localhost/api/unit-design/design-1/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-07-14",
          targetType: "STUDENT",
          targetStudentId: "student-other-school",
          targetStudentIds: ["student-other-school"],
        }),
      }),
      { params: Promise.resolve({ id: "design-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });
});
