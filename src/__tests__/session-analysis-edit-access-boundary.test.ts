import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    sessionAnalysis: { upsert: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/reports/session-analysis/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mSession = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mStudent = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUpsert = prisma.sessionAnalysis.upsert as unknown as ReturnType<typeof vi.fn>;

const ownedSession = {
  teacherId: "teacher-1",
  targetType: "CLASS",
  targetGrade: "5",
  targetClassName: "1",
  targetStudentId: null,
  targetStudentIds: [],
  teacher: {
    school: "우리학교",
    teacherClasses: [{ grade: "5", className: "1" }],
  },
};

const student = {
  id: "student-1",
  role: "STUDENT",
  school: "우리학교",
  grade: "5",
  className: "1",
};

function request(scope: "class" | "student", studentId?: string) {
  return new NextRequest("http://localhost/api/reports/session-analysis", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: "session-1",
      scope,
      ...(studentId ? { studentId } : {}),
      result: { summary: "수정한 분석" },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mSession.mockResolvedValue(ownedSession);
  mStudent.mockResolvedValue(student);
  mUpsert.mockResolvedValue({});
});

describe("수업 분석 수정 학생 권한 경계", () => {
  it("다른 학교 학생은 저장하지 않는다", async () => {
    mStudent.mockResolvedValue({ ...student, school: "다른학교" });

    const res = await PATCH(request("student", student.id));

    expect(res.status).toBe(403);
    expect(mUpsert).not.toHaveBeenCalled();
  });

  it("담당 학급 밖 학생은 저장하지 않는다", async () => {
    mStudent.mockResolvedValue({ ...student, grade: "6", className: "2" });

    const res = await PATCH(request("student", student.id));

    expect(res.status).toBe(403);
    expect(mUpsert).not.toHaveBeenCalled();
  });

  it("질문수업에 배정되지 않은 학생은 저장하지 않는다", async () => {
    mSession.mockResolvedValue({
      ...ownedSession,
      targetType: "STUDENT",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: "student-other",
      targetStudentIds: ["student-other"],
    });

    const res = await PATCH(request("student", student.id));

    expect(res.status).toBe(403);
    expect(mUpsert).not.toHaveBeenCalled();
  });

  it("질문수업에 배정된 담당 학생은 저장할 수 있다", async () => {
    const res = await PATCH(request("student", student.id));

    expect(res.status).toBe(200);
    expect(mUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_scope_studentId: {
            sessionId: "session-1",
            scope: "student",
            studentId: student.id,
          },
        },
      }),
    );
  });

  it("소유 질문수업의 학급 분석은 학생 조회 없이 저장한다", async () => {
    const res = await PATCH(request("class"));

    expect(res.status).toBe(200);
    expect(mStudent).not.toHaveBeenCalled();
    expect(mUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_scope_studentId: {
            sessionId: "session-1",
            scope: "class",
            studentId: "",
          },
        },
      }),
    );
  });

  it("다른 교사 질문수업의 학급 분석은 저장하지 않는다", async () => {
    mSession.mockResolvedValue({ ...ownedSession, teacherId: "teacher-other" });

    const res = await PATCH(request("class"));

    expect(res.status).toBe(403);
    expect(mUpsert).not.toHaveBeenCalled();
  });
});
