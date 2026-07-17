import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    appNotification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sessionAnalysis: {
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
    },
    pointLog: {
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PATCH, DELETE } from "@/app/api/sessions/[id]/route";
import { POST as remind } from "@/app/api/sessions/[id]/remind/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindSession = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockUpdateSession = prisma.questionSession.update as ReturnType<typeof vi.fn>;
const mockDeleteSession = prisma.questionSession.delete as ReturnType<typeof vi.fn>;
const mockArchiveNotifications = prisma.appNotification.updateMany as ReturnType<typeof vi.fn>;
const mockDeleteNotifications = prisma.appNotification.deleteMany as ReturnType<typeof vi.fn>;
const mockDeleteAnalysis = prisma.sessionAnalysis.deleteMany as ReturnType<typeof vi.fn>;
const mockRejectPendingPoints = prisma.pointLog.updateMany as ReturnType<typeof vi.fn>;
const mockFindQuestions = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockFindComments = prisma.comment.findMany as ReturnType<typeof vi.fn>;
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const teacher = { user: { id: "teacher-1", role: "TEACHER" } };
const context = { params: Promise.resolve({ id: "session-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(teacher);
  mockFindSession.mockResolvedValue({
    id: "session-1",
    teacherId: "teacher-1",
    isActive: true,
    date: "2026-07-13",
    subject: "과학",
    topic: "물질의 변화",
    teacher: { name: "시험 교사" },
  });
  mockUpdateSession.mockResolvedValue({ id: "session-1", isActive: false });
  mockDeleteSession.mockResolvedValue({ id: "session-1" });
  mockDeleteNotifications.mockResolvedValue({ count: 1 });
  mockArchiveNotifications.mockResolvedValue({ count: 1 });
  mockDeleteAnalysis.mockResolvedValue({ count: 1 });
  mockFindQuestions.mockResolvedValue([]);
  mockFindComments.mockResolvedValue([]);
  mockFindUser.mockResolvedValue({
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [],
  });
  mockRejectPendingPoints.mockResolvedValue({ count: 0 });
  mockQueryRaw.mockImplementation(async (query: unknown) => {
    const sql = Array.isArray(query)
      ? query.join("?")
      : (query as { strings?: readonly string[]; sql?: string })?.strings?.join("?") ??
        (query as { sql?: string })?.sql ??
        "";
    if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
    if (sql.includes('FROM "users"')) return [{ id: "teacher-1" }];
    if (sql.includes('FROM "teacher_classes"')) return [];
    if (sql.includes('FROM "question_sessions"')) {
      return [{ id: "session-1", teacherId: "teacher-1" }];
    }
    return [];
  });
  mockTransaction.mockImplementation(async (callback) => callback(prisma));
});

describe("수업 요청 알림 수명", () => {
  it("비활성 질문수업에는 새 요청을 보내지 않는다", async () => {
    mockFindSession.mockResolvedValue({
      id: "session-1",
      teacherId: "teacher-1",
      isActive: false,
      teacher: { name: "시험 교사" },
    });

    const response = await remind(
      new Request("http://localhost/api/sessions/session-1/remind", { method: "POST" }),
      context,
    );

    expect(response.status).toBe(409);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("질문수업을 비활성화할 때 그 수업의 요청 알림만 함께 정리한다", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/sessions/session-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockArchiveNotifications).toHaveBeenCalledWith({
      where: { sessionId: "session-1", type: "SESSION_REMINDER" },
      data: { href: null },
    });
    expect(mockArchiveNotifications).toHaveBeenCalledWith({
      where: { sessionId: "session-1", type: "SESSION_REMINDER", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("질문수업을 삭제할 때 분석과 수업 요청 알림을 같은 작업으로 정리한다", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/sessions/session-1", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(204);
    expect(mockDeleteNotifications).toHaveBeenCalledWith({
      where: { sessionId: "session-1", type: "SESSION_REMINDER" },
    });
    expect(mockDeleteAnalysis).toHaveBeenCalledWith({ where: { sessionId: "session-1" } });
    expect(mockRejectPendingPoints).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        bonusType: { in: expect.arrayContaining(["AI_DEEP_QUESTION", "AI_APT_ANSWER"]) },
        sessionId: { in: ["session-1"] },
      },
      data: { status: "REJECTED", decidedAt: expect.any(Date) },
    });
    expect(mockRejectPendingPoints).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
      data: { sessionId: null },
    });
    const rejectCall = mockRejectPendingPoints.mock.invocationCallOrder[0];
    const detachCall = mockRejectPendingPoints.mock.invocationCallOrder[1];
    expect(rejectCall).toBeLessThan(detachCall);
    expect(detachCall).toBeLessThan(mockDeleteSession.mock.invocationCallOrder[0]);
    expect(mockRejectPendingPoints).toHaveBeenCalledBefore(mockDeleteSession);
    expect(mockDeleteSession).toHaveBeenCalledWith({ where: { id: "session-1" } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("행 잠금 사이에 새 질문이 들어오면 역순으로 잠금하지 않고 다시 시도하게 한다", async () => {
    mockFindQuestions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "late-question" }]);

    const response = await DELETE(
      new Request("http://localhost/api/sessions/session-1", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mockRejectPendingPoints).not.toHaveBeenCalled();
    expect(mockDeleteNotifications).not.toHaveBeenCalled();
    expect(mockDeleteAnalysis).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});
