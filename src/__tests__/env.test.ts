import { describe, it, expect, afterEach, vi } from "vitest";

describe("validateServerEnv", () => {
  const original = { ...process.env };

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("운영 환경에서 질문놀이 활동 비밀값이 없으면 시작을 거절한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DATABASE_URL = "postgresql://test";
    process.env.NEXTAUTH_SECRET = "test-secret";
    delete process.env.GAME_ACTIVITY_HASH_SECRET;
    vi.resetModules();
    const { validateServerEnv } = await import("@/lib/env");

    expect(() => validateServerEnv()).toThrow(/GAME_ACTIVITY_HASH_SECRET/);
  });

  it("운영 환경에서 질문놀이 활동 비밀값은 서른두 자 이상이어야 한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DATABASE_URL = "postgresql://test";
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.GAME_ACTIVITY_HASH_SECRET = "x".repeat(31);
    vi.resetModules();
    const { validateServerEnv } = await import("@/lib/env");

    expect(() => validateServerEnv()).toThrow(/GAME_ACTIVITY_HASH_SECRET/);
  });

  it("운영 환경에서 충분히 긴 질문놀이 활동 비밀값은 허용한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DATABASE_URL = "postgresql://test";
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.GAME_ACTIVITY_HASH_SECRET = "x".repeat(32);
    vi.resetModules();
    const { validateServerEnv } = await import("@/lib/env");

    expect(() => validateServerEnv()).not.toThrow();
  });
});
