import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/student-report", () => ({ buildStudentReport: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/reports/student/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildStudentReport } from "@/lib/student-report";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockBuildStudentReport = buildStudentReport as ReturnType<typeof vi.fn>;

type TeacherRecord = {
  role: "TEACHER";
  school: string | null;
  teacherClasses: Array<{ grade: string; className: string }>;
};

type StudentRecord = {
  id: string;
  role: "STUDENT";
  school: string;
  grade: string;
  className: string;
};

let teacherRecord: TeacherRecord | null;
let studentRecord: StudentRecord;
let scopedStudent: StudentRecord | null;

const reportRequest = (studentId = "student-1") =>
  new NextRequest(`http://localhost/api/reports/student?studentId=${studentId}`);

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
  teacherRecord = {
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  };
  studentRecord = {
    id: "student-1",
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  };
  scopedStudent = studentRecord;

  mockUserFindUnique.mockImplementation(
    async ({ where }: { where: { id?: string } }) => {
      if (where.id === "teacher-1") return teacherRecord;
      if (where.id === studentRecord.id) return studentRecord;
      return null;
    },
  );
  mockUserFindFirst.mockImplementation(async () => scopedStudent);
  mockBuildStudentReport.mockResolvedValue({
    scope: "student",
    student: { id: "student-1", name: "학생" },
    sessions: [],
  });
});

describe("단일 학생 보고서 접근 경계", () => {
  it("다른 학교 학생은 집계 전에 403으로 거부한다", async () => {
    studentRecord = { ...studentRecord, school: "다른초" };
    scopedStudent = null;

    const response = await GET(reportRequest());

    expect(response.status).toBe(403);
    expect(mockBuildStudentReport).not.toHaveBeenCalled();
  });

  it("같은 학교라도 담당 밖 학급 학생은 집계 전에 403으로 거부한다", async () => {
    studentRecord = { ...studentRecord, grade: "6", className: "2" };
    scopedStudent = null;

    const response = await GET(reportRequest());

    expect(response.status).toBe(403);
    expect(mockBuildStudentReport).not.toHaveBeenCalled();
  });

  it("학교가 없는 교사는 집계 전에 403으로 거부한다", async () => {
    teacherRecord = {
      role: "TEACHER",
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    };
    scopedStudent = null;

    const response = await GET(reportRequest());

    expect(response.status).toBe(403);
    expect(mockBuildStudentReport).not.toHaveBeenCalled();
  });

  it("같은 학교 담당 학급 학생은 보고서를 조회한다", async () => {
    const response = await GET(reportRequest());

    expect(response.status).toBe(200);
    expect(mockBuildStudentReport).toHaveBeenCalledOnce();
    expect(mockBuildStudentReport).toHaveBeenCalledWith("student-1");
  });
});
