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
    user: { findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  },
}));

import { POST } from "@/app/api/students/bulk/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockExistingStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCreateStudents = prisma.user.createMany as unknown as ReturnType<typeof vi.fn>;

const request = (
  school = "한빛초",
  grade = "5",
  className = "1",
  students = [{ studentNumber: "1", name: "학생" }],
) =>
  new Request("http://localhost/api/students/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      school,
      grade,
      className,
      defaultPassword: "Student1!",
      students,
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "teacher-1", role: "TEACHER", email: null, name: "교사" },
  });
  mockTeacher.mockResolvedValue({
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockExistingStudents.mockResolvedValue([]);
  mockCreateStudents.mockResolvedValue({ count: 1 });
});

describe("학생 묶음 생성 접근 경계", () => {
  it("교사는 다른 학교에 학생을 만들 수 없다", async () => {
    const response = await POST(request("새봄초", "5", "1"));

    expect(response.status).toBe(403);
    expect(mockExistingStudents).not.toHaveBeenCalled();
    expect(mockCreateStudents).not.toHaveBeenCalled();
  });

  it("교사는 담당하지 않는 학급에 학생을 만들 수 없다", async () => {
    const response = await POST(request("한빛초", "5", "2"));

    expect(response.status).toBe(403);
    expect(mockExistingStudents).not.toHaveBeenCalled();
    expect(mockCreateStudents).not.toHaveBeenCalled();
  });

  it("담당 학급이 없는 교사는 같은 학교 학급에 학생을 만들 수 있다", async () => {
    mockTeacher.mockResolvedValue({
      role: "TEACHER",
      school: "한빛초",
      teacherClasses: [],
    });

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
    expect(mockCreateStudents).toHaveBeenCalledTimes(1);
  });

  it("학교와 학급 식별값의 앞뒤 공백을 제거한 뒤 담당 범위를 확인한다", async () => {
    const response = await POST(request(" 한빛초 ", " 5 ", " 1 "));

    expect(response.status).toBe(200);
    expect(mockExistingStudents).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
        studentNumber: { in: ["1"] },
      },
      select: { studentNumber: true },
    });
  });

  it("한 요청 안에서 같은 번호는 한 번만 만들고 중복으로 집계한다", async () => {
    mockCreateStudents.mockResolvedValue({ count: 1 });

    const response = await POST(request("한빛초", "5", "1", [
      { studentNumber: " 7 ", name: " 첫 학생 " },
      { studentNumber: "7", name: "중복 학생" },
    ]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateStudents).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        school: "한빛초",
        grade: "5",
        className: "1",
        studentNumber: "7",
        name: "첫 학생",
      })],
      skipDuplicates: true,
    });
    expect(body).toMatchObject({ created: 1, skipped: 1, errors: [] });
  });

  it("동시 등록으로 데이터베이스가 건너뛴 학생도 중복으로 집계한다", async () => {
    mockCreateStudents.mockResolvedValue({ count: 1 });

    const response = await POST(request("한빛초", "5", "1", [
      { studentNumber: "7", name: "첫 학생" },
      { studentNumber: "8", name: "둘째 학생" },
    ]));
    const body = await response.json();

    expect(mockCreateStudents).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ studentNumber: "7" }),
        expect.objectContaining({ studentNumber: "8" }),
      ]),
      skipDuplicates: true,
    });
    expect(body).toMatchObject({ created: 1, skipped: 1, errors: [] });
  });

  it("한 번에 100명을 넘는 등록 요청은 데이터베이스 조회 전에 거부한다", async () => {
    const students = Array.from({ length: 101 }, (_, index) => ({
      studentNumber: String(index + 1),
      name: `학생${index + 1}`,
    }));

    const response = await POST(request("한빛초", "5", "1", students));

    expect(response.status).toBe(400);
    expect(mockExistingStudents).not.toHaveBeenCalled();
    expect(mockCreateStudents).not.toHaveBeenCalled();
  });
});
