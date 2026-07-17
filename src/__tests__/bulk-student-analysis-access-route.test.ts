import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/student-session-analysis", () => ({ runStudentSessionAnalysis: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    teacherClass: { findFirst: vi.fn() },
    questionSession: { findMany: vi.fn() },
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    questionLike: { findMany: vi.fn() },
    sessionAnalysis: { findMany: vi.fn() },
  },
}));

import { POST } from "@/app/api/reports/bulk-student-analysis/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runStudentSessionAnalysis } from "@/lib/student-session-analysis";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mTeacherFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mStudentsFind = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mOwnedClassFind = prisma.teacherClass.findFirst as unknown as ReturnType<typeof vi.fn>;
const mSessionsFind = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const mQuestionFind = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mCommentFind = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const mLikeFind = prisma.questionLike.findMany as unknown as ReturnType<typeof vi.fn>;
const mAnalysisFind = prisma.sessionAnalysis.findMany as unknown as ReturnType<typeof vi.fn>;
const mRunAnalysis = runStudentSessionAnalysis as unknown as ReturnType<typeof vi.fn>;

type TeacherRecord = {
  role: "TEACHER";
  school: string | null;
  teacherClasses: Array<{ grade: string; className: string }>;
};

let teacherRecord: TeacherRecord;

function request(grade = "5", className = "1") {
  return new NextRequest("http://localhost/api/reports/bulk-student-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grade,
      className,
      sessionIds: ["session-1"],
      cursor: 0,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  teacherRecord = {
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  };
  mTeacherFind.mockImplementation(async () => teacherRecord);
  mStudentsFind.mockResolvedValue([]);
  mOwnedClassFind.mockResolvedValue({ id: "teacher-class-1" });
  mSessionsFind.mockResolvedValue([{ id: "session-1" }]);
  mQuestionFind.mockResolvedValue([]);
  mCommentFind.mockResolvedValue([]);
  mLikeFind.mockResolvedValue([]);
  mAnalysisFind.mockResolvedValue([]);
  mRunAnalysis.mockResolvedValue(null);
});

describe("묶음 학생 분석 접근 경계", () => {
  it("학교가 없는 교사는 학생 조회와 분석 전에 거부한다", async () => {
    teacherRecord = {
      role: "TEACHER",
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    };

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mStudentsFind).not.toHaveBeenCalled();
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });

  it("담당 학급이 있는 교사는 담당 밖 학급을 분석할 수 없다", async () => {
    const response = await POST(request("6", "2"));

    expect(response.status).toBe(403);
    expect(mStudentsFind).not.toHaveBeenCalled();
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });

  it("담당 학급이 없는 교사는 같은 학교의 요청 학급을 분석할 수 있다", async () => {
    teacherRecord = { role: "TEACHER", school: "한빛초", teacherClasses: [] };
    mOwnedClassFind.mockResolvedValue(null);

    const response = await POST(request("6", "2"));

    expect(response.status).toBe(200);
    expect(mStudentsFind).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: "6",
        className: "2",
      },
      select: { id: true },
      orderBy: [{ studentNumber: "asc" }, { id: "asc" }],
    });
  });

  it("담당 학급 학생은 학교 조건을 포함해 조회한다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mStudentsFind).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
      },
      select: { id: true },
      orderBy: [{ studentNumber: "asc" }, { id: "asc" }],
    });
  });

  it("현재 질문수업 대상이 아닌 학생의 과거 활동은 분석하지 않는다", async () => {
    mStudentsFind.mockResolvedValue([{ id: "student-1" }]);
    mSessionsFind.mockResolvedValue([
      {
        id: "session-1",
        targetType: "STUDENT",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: "student-other",
        targetStudentIds: ["student-other"],
      },
    ]);
    mQuestionFind.mockResolvedValue([
      { sessionId: "session-1", authorId: "student-1" },
    ]);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(0);
    expect(mRunAnalysis).not.toHaveBeenCalled();
  });
});
