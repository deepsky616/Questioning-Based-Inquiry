import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  retrySettlements: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("@/lib/account-deletion-room-settlement", () => ({
  retryPendingQuestionGameRoomSettlementsForUser: mocks.retrySettlements,
}));

import {
  AccountDeletionConflictError,
  AccountDeletionForbiddenError,
} from "@/lib/account-deletion";
import { DELETE as deleteTeacherAccount } from "@/app/api/account/delete/route";
import { DELETE as deleteStudentAccount } from "@/app/api/teacher/students/[id]/route";

describe("계정 삭제 경쟁 충돌 응답", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    mocks.userFindUnique.mockResolvedValue({ role: "TEACHER" });
    mocks.retrySettlements.mockResolvedValue(undefined);
    mocks.transaction.mockRejectedValue(new AccountDeletionConflictError());
  });

  it("교사 계정 활동이 잠금 사이에 바뀌면 다시 시도할 수 있는 응답을 준다", async () => {
    const response = await deleteTeacherAccount();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "계정 활동 내용이 바뀌었습니다. 다시 시도해 주세요",
    });
    expect(mocks.retrySettlements).toHaveBeenCalledWith("teacher-1");
  });

  it("학생 계정 활동이 잠금 사이에 바뀌면 다시 시도할 수 있는 응답을 준다", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        role: "TEACHER",
        school: "별빛초",
        teacherClasses: [{ grade: "3", className: "1" }],
      })
      .mockResolvedValueOnce({
        id: "student-1",
        role: "STUDENT",
        school: "별빛초",
        grade: "3",
        className: "1",
      });

    const response = await deleteStudentAccount(new Request("http://localhost"), {
      params: Promise.resolve({ id: "student-1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "계정 활동 내용이 바뀌었습니다. 다시 시도해 주세요",
    });
    expect(mocks.retrySettlements).toHaveBeenCalledWith("student-1");
  });

  it("로그인 뒤 현재 역할이 교사가 아니게 된 계정은 학생을 삭제할 수 없다", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce({
        role: "STUDENT",
        school: "별빛초",
        teacherClasses: [{ grade: "3", className: "1" }],
      })
      .mockResolvedValueOnce({
        id: "student-1",
        role: "STUDENT",
        school: "별빛초",
        grade: "3",
        className: "1",
      });

    const response = await deleteStudentAccount(new Request("http://localhost"), {
      params: Promise.resolve({ id: "student-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("로그인 뒤 현재 역할이 바뀐 교사는 자기 계정을 삭제할 수 없다", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "STUDENT" });

    const response = await deleteTeacherAccount();

    expect(response.status).toBe(403);
    expect(mocks.retrySettlements).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("거래 안에서 교사 역할이 바뀌면 금지 응답으로 변환한다", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "TEACHER" });
    mocks.transaction.mockRejectedValue(new AccountDeletionForbiddenError());

    const response = await deleteTeacherAccount();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "현재 담당 학생만 삭제할 수 있습니다",
    });
  });
});
