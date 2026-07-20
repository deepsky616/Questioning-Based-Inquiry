import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed-password") },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn(async () => []),
  },
}));

import { POST } from "@/app/api/auth/reset-password/route";
import { prisma } from "@/lib/db";

const findToken = prisma.passwordResetToken.findUnique as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as ReturnType<typeof vi.fn>;

type UpdateManyArgs = {
  where: {
    id?: string | { not: string };
    userId?: string;
    usedAt?: null;
    expiresAt?: { gt: Date };
  };
  data: { usedAt: Date };
};

const claimToken = vi.fn(async (_args: UpdateManyArgs) => ({ count: 1 }));
const updatePassword = vi.fn(async () => ({ id: "teacher-1" }));
const invalidateOtherTokens = vi.fn(async (_args: UpdateManyArgs) => ({ count: 0 }));

const transactionClient = {
  passwordResetToken: {
    updateMany: vi.fn(async (args: UpdateManyArgs) => (
      typeof args.where.id === "string" ? claimToken(args) : invalidateOtherTokens(args)
    )),
  },
  user: { update: updatePassword },
};

function request(password: string) {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "a".repeat(64), password }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input(transactionClient);
    }
    return [];
  });
  claimToken.mockResolvedValue({ count: 1 });
  findToken.mockResolvedValue({
    id: "token-1",
    userId: "teacher-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: "teacher-1", role: "TEACHER" },
  });
});

describe("POST reset-password 비밀번호 정책", () => {
  it("공통 비밀번호 정책보다 약한 비밀번호를 거부한다", async () => {
    const response = await POST(request("abcdef"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("8~16자");
    expect(findToken).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("공통 비밀번호 정책을 만족하면 재설정을 진행한다", async () => {
    const response = await POST(request("Valid123!"));

    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    expect(claimToken).toHaveBeenCalledOnce();
    expect(claimToken).toHaveBeenCalledWith({
      where: {
        id: "token-1",
        userId: "teacher-1",
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(invalidateOtherTokens).toHaveBeenCalledOnce();
    expect(invalidateOtherTokens).toHaveBeenCalledWith({
      where: {
        userId: "teacher-1",
        usedAt: null,
        id: { not: "token-1" },
      },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("동시에 먼저 사용된 토큰은 트랜잭션 안에서 다시 선점하지 못한다", async () => {
    claimToken.mockResolvedValue({ count: 0 });

    const response = await POST(request("Valid123!"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("유효하지 않거나 만료된 링크");
    expect(updatePassword).not.toHaveBeenCalled();
    expect(invalidateOtherTokens).not.toHaveBeenCalled();
  });
});
