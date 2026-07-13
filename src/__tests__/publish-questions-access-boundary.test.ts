import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    questionSession: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/sessions/[id]/publish-questions/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSession = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mQuestions = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;

const request = () =>
  new NextRequest("http://localhost/api/sessions/session-1/publish-questions");

const context = { params: Promise.resolve({ id: "session-1" }) };

const classSession = {
  teacherId: "teacher-1",
  likesVisibleToPeers: true,
  commentsVisibleToPeers: true,
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

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
  mUser.mockResolvedValue({
    id: "student-1",
    role: "STUDENT",
    school: "우리학교",
    grade: "5",
    className: "1",
  });
  mSession.mockResolvedValue(classSession);
  mQuestions.mockResolvedValue([]);
});

describe("게시 질문 직접 조회 권한 경계", () => {
  it("로그인하지 않으면 401을 반환하고 자료를 조회하지 않는다", async () => {
    mAuth.mockResolvedValue(null);

    const res = await GET(request(), context);

    expect(res.status).toBe(401);
    expect(mUser).not.toHaveBeenCalled();
    expect(mSession).not.toHaveBeenCalled();
    expect(mQuestions).not.toHaveBeenCalled();
  });

  it("없는 질문수업이면 404를 반환하고 질문을 조회하지 않는다", async () => {
    mSession.mockResolvedValue(null);

    const res = await GET(request(), context);

    expect(res.status).toBe(404);
    expect(mQuestions).not.toHaveBeenCalled();
  });

  it("교사는 본인 소유 질문수업만 조회할 수 있다", async () => {
    mAuth.mockResolvedValue({ user: { id: "teacher-2", role: "TEACHER" } });
    mUser.mockResolvedValue({
      id: "teacher-2",
      role: "TEACHER",
      school: "우리학교",
      grade: null,
      className: null,
    });

    const res = await GET(request(), context);

    expect(res.status).toBe(403);
    expect(mQuestions).not.toHaveBeenCalled();
  });

  it("본인 소유 질문수업의 교사는 게시 질문을 조회할 수 있다", async () => {
    mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    mUser.mockResolvedValue({
      id: "teacher-1",
      role: "TEACHER",
      school: "우리학교",
      grade: null,
      className: null,
    });

    const res = await GET(request(), context);

    expect(res.status).toBe(200);
    expect(mQuestions).toHaveBeenCalledTimes(1);
  });

  it("배정되지 않은 학생은 게시 질문을 조회할 수 없다", async () => {
    mUser.mockResolvedValue({
      id: "student-1",
      role: "STUDENT",
      school: "우리학교",
      grade: "5",
      className: "2",
    });

    const res = await GET(request(), context);

    expect(res.status).toBe(403);
    expect(mQuestions).not.toHaveBeenCalled();
  });

  it("배정된 학생은 게시 질문을 조회할 수 있다", async () => {
    const res = await GET(request(), context);

    expect(res.status).toBe(200);
    expect(mQuestions).toHaveBeenCalledTimes(1);
  });
});
