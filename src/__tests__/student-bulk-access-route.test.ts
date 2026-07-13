import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendBulkStudentSummaryEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed-password") },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/students/bulk/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockExistingStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCreateStudent = prisma.user.create as unknown as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const request = (school = "한빛초", grade = "5", className = "1") =>
  new Request("http://localhost/api/students/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      school,
      grade,
      className,
      defaultPassword: "Student1!",
      students: [{ studentNumber: "1", name: "학생" }],
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "teacher-1", role: "TEACHER", email: null, name: "교사" },
  });
  mockTeacher.mockResolvedValue({
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockExistingStudents.mockResolvedValue([]);
  mockCreateStudent.mockResolvedValue({ id: "student-1" });
  mockTransaction.mockResolvedValue([]);
});

describe("학생 묶음 생성 접근 경계", () => {
  it("교사는 다른 학교에 학생을 만들 수 없다", async () => {
    const response = await POST(request("새봄초", "5", "1"));

    expect(response.status).toBe(403);
    expect(mockExistingStudents).not.toHaveBeenCalled();
    expect(mockCreateStudent).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("교사는 담당하지 않는 학급에 학생을 만들 수 없다", async () => {
    const response = await POST(request("한빛초", "5", "2"));

    expect(response.status).toBe(403);
    expect(mockExistingStudents).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("담당 학급이 없는 교사는 같은 학교 학급에 학생을 만들 수 있다", async () => {
    mockTeacher.mockResolvedValue({ school: "한빛초", teacherClasses: [] });

    const response = await POST(request("한빛초", "6", "2"));

    expect(response.status).toBe(200);
    expect(mockExistingStudents).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: "6",
        className: "2",
        studentNumber: { in: ["1"] },
      },
      select: { studentNumber: true },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
