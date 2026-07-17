import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => {
  const question = { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() };
  const user = { findUnique: vi.fn(), findMany: vi.fn() };
  return {
    prisma: {
      question,
      user,
      questionSession: { findUnique: vi.fn() },
      $transaction: vi.fn((callback) => callback({ question, user })),
    },
  };
});

import { GET } from "@/app/api/questions/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mQuestionFindMany = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mQuestionCount = prisma.question.count as unknown as ReturnType<typeof vi.fn>;
const mQuestionGroupBy = prisma.question.groupBy as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionFind = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;

const request = (query = "") => new Request(`http://localhost/api/questions${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mUserFind.mockResolvedValue({
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [],
  });
  mQuestionFindMany.mockResolvedValue([]);
  mQuestionCount.mockResolvedValue(0);
  mQuestionGroupBy.mockResolvedValue([]);
});

describe("질문 조회 권한 경계", () => {
  it("알 수 없는 역할은 질문을 조회하기 전에 거부한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "unknown-1", role: "UNKNOWN" } });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mQuestionFindMany).not.toHaveBeenCalled();
    expect(mQuestionCount).not.toHaveBeenCalled();
  });

  it("담당 학급 교사의 질문 목록은 학교와 학년 반을 함께 제한한다", async () => {
    mUserFind.mockResolvedValue({
      role: "TEACHER",
      school: "한빛초",
      teacherClasses: [{ grade: "5", className: "1" }],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mQuestionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        author: {
          role: "STUDENT",
          school: "한빛초",
          OR: [{ grade: "5", className: "1" }],
        },
      }),
    }));
  });

  it("교사 자료나 학교가 없으면 질문 조회를 기본 거부한다", async () => {
    mUserFind.mockResolvedValue({
      role: "TEACHER",
      school: null,
      teacherClasses: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mQuestionFindMany).not.toHaveBeenCalled();
    expect(mQuestionCount).not.toHaveBeenCalled();
    expect(mQuestionGroupBy).not.toHaveBeenCalled();
  });

  it("학생은 공개 요청을 생략하거나 거짓으로 보내도 다른 작성자의 비공개 질문을 볼 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    mUserFind.mockResolvedValue({
      id: "student-1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
    });

    const response = await GET(request("?authorId=student-2&isPublic=false"));

    expect(response.status).toBe(200);
    const where = mQuestionFindMany.mock.calls[0][0].where;
    const sessionScope = {
      teacher: {
        role: "TEACHER",
        school: "한빛초",
        OR: [
          { teacherClasses: { some: { grade: "5", className: "1" } } },
          { teacherClasses: { none: {} } },
        ],
      },
      OR: [
        { targetType: "ALL" },
        { targetType: "CLASS", targetGrade: "5", targetClassName: "1" },
        { targetType: "STUDENT", targetStudentId: "student-1" },
        {
          targetType: { in: ["CLASS", "STUDENT", "CUSTOM"] },
          targetStudentIds: { array_contains: "student-1" },
        },
      ],
    };
    expect(where.authorId).toBe("student-2");
    expect(where.OR).toEqual([
      {
        authorId: "student-1",
        OR: [{ sessionId: null }, { session: sessionScope }],
      },
      {
        isPublic: true,
        author: {
          OR: [
            { role: "STUDENT", school: "한빛초", grade: "5", className: "1" },
            { role: "TEACHER", school: "한빛초" },
          ],
        },
        OR: [
          { sessionId: null },
          { session: sessionScope },
        ],
      },
    ]);
  });

  it("학생은 자기 비공개 질문을 계속 조회할 수 있다", async () => {
    mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    mUserFind.mockResolvedValue({
      id: "student-1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
    });

    const response = await GET(request("?authorId=student-1&isPublic=false"));

    expect(response.status).toBe(200);
    expect(mQuestionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ authorId: "student-1" }),
    }));
    expect(mQuestionFindMany.mock.calls[0][0].where.OR).toEqual([
      { sessionId: null },
      { session: expect.any(Object) },
    ]);
    expect(mQuestionFindMany.mock.calls[0][0].where.isPublic).toBeUndefined();
  });

  it("학생은 배정받지 않은 질문수업 번호로 공개 질문 목록을 조회할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    mUserFind.mockResolvedValue({
      id: "student-1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
    });
    mSessionFind.mockResolvedValue({
      teacherId: "teacher-1",
      targetType: "CLASS",
      targetGrade: "6",
      targetClassName: "2",
      targetStudentId: null,
      targetStudentIds: [],
      teacher: {
        school: "한빛초",
        teacherClasses: [{ grade: "5", className: "1" }],
      },
    });

    const response = await GET(request("?sessionId=session-other"));

    expect(response.status).toBe(403);
    expect(mQuestionFindMany).not.toHaveBeenCalled();
  });
});
