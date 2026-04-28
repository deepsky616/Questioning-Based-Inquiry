import { describe, expect, it } from "vitest";
import {
  buildPasswordResetUrl,
  getPasswordResetExpiry,
  hashPasswordResetToken,
} from "@/lib/password-reset";

describe("password reset helpers", () => {
  it("같은 토큰은 같은 해시를 생성한다", () => {
    expect(hashPasswordResetToken("token-1")).toBe(hashPasswordResetToken("token-1"));
  });

  it("서로 다른 토큰은 서로 다른 해시를 생성한다", () => {
    expect(hashPasswordResetToken("token-1")).not.toBe(hashPasswordResetToken("token-2"));
  });

  it("만료 시간은 30분 뒤로 설정된다", () => {
    const now = new Date("2026-04-28T00:00:00.000Z");
    expect(getPasswordResetExpiry(now).toISOString()).toBe("2026-04-28T00:30:00.000Z");
  });

  it("재설정 URL에 토큰을 포함한다", () => {
    const url = buildPasswordResetUrl("https://example.com", "abc123");
    expect(url).toBe("https://example.com/reset-password?token=abc123");
  });
});
