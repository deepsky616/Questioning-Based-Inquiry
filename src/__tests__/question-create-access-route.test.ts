import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    question: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    pointLog: { create: vi.fn() },
    appNotification: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/questions/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendQuestionNotificationEmail } from "@/lib/email";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mSessionFindUnique = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionFindFirst = prisma.questionSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUserUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const mQuestionFind = prisma.question.findFirst as unknown as ReturnType<typeof vi.fn>;
const mQuestionCreate = prisma.question.create as unknown as ReturnType<typeof vi.fn>;
const mPointCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;
const mNotificationUpdate = prisma.appNotification.updateMany as unknown as ReturnType<typeof vi.fn>;
const mTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mSendEmail = sendQuestionNotificationEmail as unknown as ReturnType<typeof vi.fn>;

const questionRequest = (sessionId?: string) =>
  new Request("http://localhost/api/questions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: "배정되지 않은 수업에도 질문을 쓸 수 있을까?",
      closure: "open",
      cognitive: "conceptual",
      ...(sessionId ? { sessionId } : {}),
    }),
  });

const otherTeacherSession = {
  id: "session-other",
  defaultQuestionPublic: true,
  isActive: true,
  teacherId: "teacher-other",
  targetType: "CLASS",
  targetGrade: "6",
  targetClassName: "2",
  targetStudentId: null,
  targetStudentIds: [],
  teacher: {
    school: "다른초",
    teacherClasses: [{ grade: "6", className: "2" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({
    user: { id: "student-1", role: "STUDENT", email: "student@example.com" },
  });
  mSessionFindUnique.mockResolvedValue(otherTeacherSession);
  // 권한 조건을 where에 포함하는 구현에서는 배정 밖 수업이 조회되지 않아야 한다.
  mSessionFindFirst.mockResolvedValue(null);
  mUserFind.mockResolvedValue({
    id: "student-1",
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  });
  mQuestionFind.mockResolvedValue(null);
  mQuestionCreate.mockResolvedValue({
    id: "question-new",
    content: "배정되지 않은 수업에도 질문을 쓸 수 있을까?",
    sessionId: "session-other",
    source: "STUDENT",
    author: { id: "student-1", name: "학생", className: "1" },
    session: {
      date: "2026-07-14",
      subject: "과학",
      topic: "권한 경계",
      teacher: { email: null, name: "다른 교사" },
    },
  });
  mPointCreate.mockResolvedValue({ id: "point-new" });
  mUserUpdate.mockResolvedValue({ id: "student-1" });
  mNotificationUpdate.mockResolvedValue({ count: 0 });
  mTransaction.mockResolvedValue([]);
  mSendEmail.mockResolvedValue({ ok: true });
});

describe("질문수업 제출 권한", () => {
  it("알 수 없는 역할은 세션 없는 질문도 제출할 수 없다", async () => {
    mAuth.mockResolvedValue({
      user: { id: "unknown-1", role: "UNKNOWN", email: "unknown@example.com" },
    });

    const response = await POST(questionRequest());

    expect(response.status).toBe(403);
    expect(mQuestionCreate).not.toHaveBeenCalled();
  });

  it("학생은 배정 범위 밖 수업에 질문을 제출할 수 없다", async () => {
    const response = await POST(questionRequest("session-other"));

    expect(response.status).toBe(403);
    expect(mQuestionCreate).not.toHaveBeenCalled();
    expect(mTransaction).not.toHaveBeenCalled();
    expect(mNotificationUpdate).not.toHaveBeenCalled();
    expect(mSendEmail).not.toHaveBeenCalled();
  });

  it("교사는 다른 교사가 소유한 수업에 질문을 제출할 수 없다", async () => {
    mAuth.mockResolvedValue({
      user: { id: "teacher-1", role: "TEACHER", email: "teacher@example.com" },
    });

    const response = await POST(questionRequest("session-other"));

    expect(response.status).toBe(403);
    expect(mQuestionCreate).not.toHaveBeenCalled();
    expect(mTransaction).not.toHaveBeenCalled();
    expect(mNotificationUpdate).not.toHaveBeenCalled();
    expect(mSendEmail).not.toHaveBeenCalled();
  });

  it("학생은 같은 학교 담당 교사가 직접 배정한 활성 수업에 질문을 제출할 수 있다", async () => {
    mSessionFindUnique.mockResolvedValue({
      ...otherTeacherSession,
      id: "session-direct",
      teacherId: "teacher-same-school",
      targetType: "STUDENT",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: "student-1",
      teacher: {
        school: "한빛초",
        teacherClasses: [{ grade: "5", className: "1" }],
      },
    });
    mQuestionCreate.mockResolvedValue({
      id: "question-new",
      content: "직접 배정된 수업에 질문을 쓸 수 있을까?",
      sessionId: "session-direct",
      source: "STUDENT",
      author: { id: "student-1", name: "학생", className: "1" },
      session: {
        date: "2026-07-14",
        subject: "과학",
        topic: "권한 경계",
        teacher: { email: null, name: "담당 교사" },
      },
    });

    const response = await POST(questionRequest("session-direct"));

    expect(response.status).toBe(200);
    expect(mQuestionCreate).toHaveBeenCalledOnce();
  });

  it("교사는 자신이 소유한 수업에 질문을 제출할 수 있다", async () => {
    mAuth.mockResolvedValue({
      user: { id: "teacher-1", role: "TEACHER", email: "teacher@example.com" },
    });
    mSessionFindUnique.mockResolvedValue({
      ...otherTeacherSession,
      id: "session-owned",
      teacherId: "teacher-1",
    });
    mQuestionCreate.mockResolvedValue({
      id: "question-teacher",
      content: "내 수업에 질문을 쓸 수 있을까?",
      sessionId: "session-owned",
      source: "TEACHER",
      author: { id: "teacher-1", name: "교사", className: null },
      session: {
        date: "2026-07-14",
        subject: "과학",
        topic: "권한 경계",
        teacher: { email: "teacher@example.com", name: "교사" },
      },
    });

    const response = await POST(questionRequest("session-owned"));

    expect(response.status).toBe(200);
    expect(mQuestionCreate).toHaveBeenCalledOnce();
    expect(mTransaction).not.toHaveBeenCalled();
  });
});
