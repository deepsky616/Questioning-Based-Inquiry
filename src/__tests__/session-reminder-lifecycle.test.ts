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
    expect(mockDeleteSession).toHaveBeenCalledWith({ where: { id: "session-1" } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
