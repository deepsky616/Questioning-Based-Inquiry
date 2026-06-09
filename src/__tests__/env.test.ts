import { describe, it, expect, afterEach, vi } from "vitest";

describe("validateServerEnv", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("필수 환경변수가 모두 있으면 통과한다", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    process.env.NEXTAUTH_SECRET = "test-secret";
    vi.resetModules();
    const { validateServerEnv } = await import("@/lib/env");
    expect(() => validateServerEnv()).not.toThrow();
  });

  it("DATABASE_URL이 없으면 명확한 에러를 던진다", async () => {
    delete process.env.DATABASE_URL;
    process.env.NEXTAUTH_SECRET = "test-secret";
    vi.resetModules();
    const { validateServerEnv } = await import("@/lib/env");
    expect(() => validateServerEnv()).toThrow(/DATABASE_URL/);
  });

  it("NEXTAUTH_SECRET이 없으면 명확한 에러를 던진다", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    delete process.env.NEXTAUTH_SECRET;
    vi.resetModules();
    const { validateServerEnv } = await import("@/lib/env");
    expect(() => validateServerEnv()).toThrow(/NEXTAUTH_SECRET/);
  });
});
