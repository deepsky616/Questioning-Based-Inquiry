import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { updateMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/email", () => ({
  sendTeacherPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/api-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue(null) };
});

import { prisma } from "@/lib/db";
import { sendTeacherPasswordResetEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { POST } from "@/app/api/auth/forgot-password/route";

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
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
  mockSendEmail.mockResolvedValue({ ok: true });
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
});
