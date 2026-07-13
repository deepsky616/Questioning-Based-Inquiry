import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/student-session-analysis", () => ({ runStudentSessionAnalysis: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    teacherClass: { findMany: vi.fn() },
  },
}));

import { POST } from "@/app/api/reports/student-session-analysis/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runStudentSessionAnalysis } from "@/lib/student-session-analysis";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mSessionFindUnique = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionFindFirst = prisma.questionSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const mUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mTeacherClassFindMany = prisma.teacherClass.findMany as unknown as ReturnType<typeof vi.fn>;
const mRunAnalysis = runStudentSessionAnalysis as unknown as ReturnType<typeof vi.fn>;

const teacher = {
  id: "teacher-1",
  role: "TEACHER",
  school: "한빛초",
  teacherClasses: [{ grade: "5", className: "1" }],
};

const student = {
  id: "student-1",
  role: "STUDENT",
  school: "한빛초",
  grade: "5",
  className: "1",
};

const ownedSession = {
  id: "session-1",
  teacherId: "teacher-1",
  teacher,
  targetType: "ALL",
  targetGrade: null,
  targetClassName: null,
  targetStudentId: null,
  targetStudentIds: [],
};

function request(studentId = student.id, sessionId = ownedSession.id) {
  return new NextRequest("http://localhost/api/reports/student-session-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId, sessionId }),
  });
}

function mockUsers(targetStudent = student) {
  mUserFindUnique.mockImplementation(
    async ({ where }: { where: { id?: string } }) => {
      if (where.id === teacher.id) return teacher;
      if (where.id === targetStudent.id) return targetStudent;
      return null;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: teacher.id, role: "TEACHER" } });
  mSessionFindUnique.mockResolvedValue(ownedSession);
  mSessionFindFirst.mockResolvedValue(ownedSession);
  mTeacherClassFindMany.mockResolvedValue([
    { teacherId: teacher.id, grade: "5", className: "1" },
  ]);
  mockUsers();
  mRunAnalysis.mockResolvedValue({
    result: {
      summary: "요약",
      insights: "통찰",
      relevanceInsights: "관련성",
      growthInsights: "성장",
      rewriteExample: "보기",
    },
    totals: { questions: 1, comments: 0, likesGiven: 0 },
  });
});

describe("학생 질문수업 분석 접근 경계", () => {
  it("교사가 소유하지 않은 질문수업은 분석 실행 전에 거부한다", async () => {
    const foreignSession = {
      ...ownedSession,
      id: "session-other",
      teacherId: "teacher-2",
      teacher: { ...teacher, id: "teacher-2" },
    };
    mSessionFindUnique.mockResolvedValue(foreignSession);
    mSessionFindFirst.mockResolvedValue(foreignSession);

    const response = await POST(request(student.id, foreignSession.id));

    expect(response.status).toBe(403);
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });

  it("다른 학교 학생은 분석 실행 전에 거부한다", async () => {
    mockUsers({ ...student, school: "새봄초" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });

  it("같은 학교라도 담당 학급 밖 학생은 분석 실행 전에 거부한다", async () => {
    mockUsers({ ...student, grade: "6", className: "2" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });

  it("담당 학급 학생이어도 질문수업 대상이 아니면 분석 실행 전에 거부한다", async () => {
    mSessionFindUnique.mockResolvedValue({
      ...ownedSession,
      targetType: "STUDENT",
      targetStudentId: "student-other",
      targetStudentIds: ["student-other"],
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });

  it("소유 질문수업의 담당 학생은 분석할 수 있다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mRunAnalysis).toHaveBeenCalledOnce();
    expect(mRunAnalysis).toHaveBeenCalledWith({
      studentId: student.id,
      sessionId: ownedSession.id,
      req: expect.any(NextRequest),
    });
  });
});
