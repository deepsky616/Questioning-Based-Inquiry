import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/email", () => ({
  isEmailEnabled: vi.fn().mockReturnValue(true),
  sendTeacherPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue(null) };
});

import { prisma } from "@/lib/db";
import { isEmailEnabled, sendTeacherPasswordResetEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { POST } from "@/app/api/auth/forgot-password/route";

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockCreateToken = prisma.passwordResetToken.create as ReturnType<typeof vi.fn>;
const mockDeleteToken = prisma.passwordResetToken.delete as ReturnType<typeof vi.fn>;
const mockUpdateToken = prisma.passwordResetToken.update as ReturnType<typeof vi.fn>;
const mockUpdateManyTokens = prisma.passwordResetToken.updateMany as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockIsEmailEnabled = isEmailEnabled as ReturnType<typeof vi.fn>;
const mockSendEmail = sendTeacherPasswordResetEmail as ReturnType<typeof vi.fn>;
const mockRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

function makeReq(email: string) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue(null);
  mockIsEmailEnabled.mockReturnValue(true);
  mockSendEmail.mockResolvedValue({ ok: true });
  mockCreateToken.mockResolvedValue({ id: "reset-token-1" });
  mockDeleteToken.mockResolvedValue({ id: "reset-token-1" });
  mockUpdateToken.mockResolvedValue({ id: "reset-token-1" });
  mockUpdateManyTokens.mockResolvedValue({ count: 1 });
  mockTransaction.mockResolvedValue([]);
});

describe("POST forgot-password 계정 열거 방지", () => {
  it("등록된 교사와 미등록 이메일이 동일한 응답을 받는다", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "t1", email: "t@a.com", name: "교사", role: "TEACHER" });
    const known = await POST(makeReq("t@a.com"));
    const knownBody = await known.json();

    mockFindUnique.mockResolvedValueOnce(null);
    const unknown = await POST(makeReq("nobody@a.com"));
    const unknownBody = await unknown.json();

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknownBody.message).toBe(knownBody.message);
    expect(unknownBody.error).toBeUndefined();
  });

  it("미등록 이메일에는 재설정 메일을 보내지 않는다", async () => {
    mockFindUnique.mockResolvedValue(null);
    await POST(makeReq("nobody@a.com"));
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("학생 계정 이메일도 미등록과 동일하게 처리한다", async () => {
    mockFindUnique.mockResolvedValue({ id: "s1", email: "s@a.com", name: "학생", role: "STUDENT" });
    const res = await POST(makeReq("s@a.com"));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("레이트 리밋 초과 시 429를 반환한다", async () => {
    const tooMany = new Response(JSON.stringify({ error: "too many" }), { status: 429 });
    mockRateLimit.mockReturnValue(tooMany);
    const res = await POST(makeReq("t@a.com"));
    expect(res.status).toBe(429);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("이메일 설정이 없으면 토큰을 만들거나 계정을 조회하지 않는다", async () => {
    mockIsEmailEnabled.mockReturnValue(false);

    const res = await POST(makeReq("teacher@example.com"));

    expect(res.status).toBe(200);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreateToken).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("전송 실패 시 새 토큰만 삭제하고 기존 토큰을 유지한다", async () => {
    mockFindUnique.mockResolvedValue({
      id: "t1",
      email: "teacher@example.com",
      name: "교사",
      role: "TEACHER",
    });
    mockSendEmail.mockResolvedValue({ ok: false, error: "SMTP authentication failed" });

    const res = await POST(makeReq("teacher@example.com"));

    expect(res.status).toBe(200);
    expect(mockCreateToken).toHaveBeenCalledOnce();
    expect(mockDeleteToken).toHaveBeenCalledWith({ where: { id: "reset-token-1" } });
    expect(mockUpdateManyTokens).not.toHaveBeenCalled();
  });

  it("실제 전송 성공 뒤에 기존 토큰을 무효화한다", async () => {
    mockFindUnique.mockResolvedValue({
      id: "t1",
      email: "teacher@example.com",
      name: "교사",
      role: "TEACHER",
    });

    const res = await POST(makeReq("teacher@example.com"));

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockSendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mockTransaction.mock.invocationCallOrder[0],
    );
  });

  it("새 토큰은 전송 성공 전까지 만료 상태로 두고 성공 뒤 활성화한다", async () => {
    mockFindUnique.mockResolvedValue({
      id: "t1",
      email: "teacher@example.com",
      name: "교사",
      role: "TEACHER",
    });

    await POST(makeReq("teacher@example.com"));

    expect(mockCreateToken.mock.calls[0][0].data.expiresAt.getTime()).toBe(0);
    expect(mockUpdateToken.mock.calls[0][0].data.expiresAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
  });
});
