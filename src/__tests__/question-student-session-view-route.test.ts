import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    question: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    questionSession: { findUnique: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/questions/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindFirst = prisma.question.findFirst as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionFind = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;

const sessionRequest = (query = "sessionId=session-1") =>
  new Request(`http://localhost/api/questions?view=student-session&${query}`);

beforeEach(() => {
  vi.clearAllMocks();
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
    targetGrade: "5",
    targetClassName: "1",
    targetStudentId: null,
    targetStudentIds: [],
    teacher: {
      role: "TEACHER",
      school: "한빛초",
      teacherClasses: [{ grade: "5", className: "1" }],
    },
  });
  mFindFirst.mockResolvedValue({ id: "question-2", content: "최근 질문" });
});

describe("학생 수업별 기존 질문 보기", () => {
  it("주소의 작성자 값과 무관하게 로그인 학생의 최근 질문 두 열만 반환한다", async () => {
    const response = await GET(sessionRequest("sessionId=session-1&authorId=another-student"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      existingQuestion: { id: "question-2", content: "최근 질문" },
    });
    expect(mFindFirst).toHaveBeenCalledWith({
      where: { authorId: "student-1", sessionId: "session-1" },
      select: { id: true, content: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("작성한 질문이 없으면 빈 값을 반환한다", async () => {
    mFindFirst.mockResolvedValue(null);

    const response = await GET(sessionRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ existingQuestion: null });
  });

  it("현재 수업 대상에서 제외된 학생은 자기 질문도 조회할 수 없다", async () => {
    mSessionFind.mockResolvedValue({
      teacherId: "teacher-1",
      targetType: "STUDENT",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: "student-other",
      targetStudentIds: ["student-other"],
      teacher: {
        role: "TEACHER",
        school: "한빛초",
        teacherClasses: [{ grade: "5", className: "1" }],
      },
    });

    const response = await GET(sessionRequest());

    expect(response.status).toBe(403);
    expect(mFindFirst).not.toHaveBeenCalled();
  });

  it("수업 값이 없으면 잘못된 요청으로 처리한다", async () => {
    const response = await GET(sessionRequest(""));

    expect(response.status).toBe(400);
    expect(mFindFirst).not.toHaveBeenCalled();
  });

  it("학생이 아닌 사용자는 조회할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });

    const response = await GET(sessionRequest());

    expect(response.status).toBe(403);
    expect(mFindFirst).not.toHaveBeenCalled();
  });
});
