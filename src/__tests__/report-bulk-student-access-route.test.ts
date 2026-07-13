import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/student-report", () => ({ buildStudentReport: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    teacherClass: { findFirst: vi.fn() },
  },
}));

import { POST } from "@/app/api/reports/students/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildStudentReport } from "@/lib/student-report";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockStudents = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockOwnedClass = prisma.teacherClass.findFirst as ReturnType<typeof vi.fn>;
const mockBuildStudentReport = buildStudentReport as ReturnType<typeof vi.fn>;

const bulkReportRequest = (grade = "5", className = "1") =>
  new NextRequest("http://localhost/api/reports/students", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grade, className }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: {
      id: "teacher-1",
      role: "TEACHER",
      school: "한빛초",
      grade: null,
      className: null,
    },
  });
  mockTeacher.mockResolvedValue({
    school: "한빛초",
    teacherClasses: [],
  });
  mockOwnedClass.mockResolvedValue(null);
  mockStudents.mockResolvedValue([
    { id: "student-1", studentNumber: "1" },
  ]);
  mockBuildStudentReport.mockResolvedValue({
    scope: "student",
    student: { id: "student-1", name: "학생" },
    sessions: [],
  });
});

describe("묶음 학생 보고서 접근 경계", () => {
  it("학교가 없는 교사는 담당 학급 값을 보내도 학생 조회 전에 403으로 거부한다", async () => {
    mockTeacher.mockResolvedValue({
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });
    mockOwnedClass.mockResolvedValue({ id: "class-1" });

    const response = await POST(bulkReportRequest());

    expect(response.status).toBe(403);
    expect(mockStudents).not.toHaveBeenCalled();
    expect(mockBuildStudentReport).not.toHaveBeenCalled();
  });

  it("담당 학급이 비어 있는 교사는 같은 학교의 요청 학급 학생만 조회한다", async () => {
    const response = await POST(bulkReportRequest("6", "2"));

    expect(response.status).toBe(200);
    expect(mockStudents).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: "6",
        className: "2",
      },
      select: { id: true, studentNumber: true },
    });
    expect(mockBuildStudentReport).toHaveBeenCalledWith("student-1");
  });
});
