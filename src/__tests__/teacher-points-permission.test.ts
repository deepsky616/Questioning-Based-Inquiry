import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    pointLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/teacher/points/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const mockPointLogCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

type TeacherRow = {
  school: string | null;
  teacherClasses: Array<{ grade: string; className: string }>;
};

type TargetRow = {
  id: string;
  role: string;
  school: string | null;
  grade: string | null;
  className: string | null;
  totalPoints: number;
};

const request = (studentId = "student-1") =>
  new NextRequest("http://localhost/api/teacher/points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId, points: 3, reason: "질문 참여" }),
  });

const baseTeacher: TeacherRow = {
  school: "한빛초",
  teacherClasses: [{ grade: "5", className: "1" }],
};

const baseStudent: TargetRow = {
  id: "student-1",
  role: "STUDENT",
  school: "한빛초",
  grade: "5",
  className: "1",
  totalPoints: 10,
};

function mockUsers(teacher: TeacherRow, target: TargetRow | null) {
  mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    if (where.id === "teacher-1") return Promise.resolve(teacher);
    if (where.id === "student-1") return Promise.resolve(target);
    return Promise.resolve(null);
  });
}

function expectNoPointWrite() {
  expect(mockPointLogCreate).not.toHaveBeenCalled();
  expect(mockUserUpdate).not.toHaveBeenCalled();
  expect(mockTransaction).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockPointLogCreate.mockResolvedValue({ id: "point-1" });
  mockUserUpdate.mockResolvedValue({ id: "student-1" });
  mockTransaction.mockResolvedValue([]);
  mockUsers(baseTeacher, baseStudent);
});

describe("교사 수동 점수 변경 권한", () => {
  it("다른 학교 학생은 점수를 쓰기 전에 거부한다", async () => {
    mockUsers(baseTeacher, { ...baseStudent, school: "새봄초" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expectNoPointWrite();
  });

  it("담당 학급 밖 학생은 점수를 쓰기 전에 거부한다", async () => {
    mockUsers(baseTeacher, { ...baseStudent, className: "2" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expectNoPointWrite();
  });

  it("학생이 아닌 계정은 점수를 쓰기 전에 찾을 수 없음으로 처리한다", async () => {
    mockUsers(baseTeacher, { ...baseStudent, role: "TEACHER" });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expectNoPointWrite();
  });

  it("같은 학교의 담당 학급 학생은 점수 변경을 허용한다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("담당 학급이 비어 있으면 같은 학교 학생의 점수 변경을 허용한다", async () => {
    mockUsers({ ...baseTeacher, teacherClasses: [] }, baseStudent);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
