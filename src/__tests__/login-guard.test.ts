import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildLoginIdentity,
  isLoginAttemptAllowed,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_MS,
} from "@/lib/login-guard";
import { __resetRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  __resetRateLimit();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildLoginIdentity — 계정 식별 키", () => {
  it("학생은 학교·학년·반·번호로, 교사는 이메일(소문자)로 식별한다", () => {
    expect(
      buildLoginIdentity({ loginType: "student", school: "테스트초", grade: "5", className: "1", studentNumber: "3" }),
    ).toBe("student:테스트초:5:1:3");
    expect(buildLoginIdentity({ email: "Teacher@Example.com" })).toBe("teacher:teacher@example.com");
  });

  it("식별 정보가 불완전하면 null (제한 없이 기존 검증 흐름으로)", () => {
    expect(buildLoginIdentity({ loginType: "student", school: "테스트초", grade: "5", className: "1" })).toBeNull();
    expect(buildLoginIdentity({})).toBeNull();
    expect(buildLoginIdentity({ email: "" })).toBeNull();
  });
});

describe("isLoginAttemptAllowed — 계정 단위 브루트포스 차단", () => {
  it("한도까지는 허용하고 초과 시도는 거절한다", () => {
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) {
      expect(isLoginAttemptAllowed("student:테스트초:5:1:3")).toBe(true);
    }
    expect(isLoginAttemptAllowed("student:테스트초:5:1:3")).toBe(false);
  });

  it("계정이 다르면 한도를 공유하지 않는다 (같은 반 다른 학생 로그인 영향 없음)", () => {
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) isLoginAttemptAllowed("student:테스트초:5:1:3");
    expect(isLoginAttemptAllowed("student:테스트초:5:1:3")).toBe(false);
    expect(isLoginAttemptAllowed("student:테스트초:5:1:4")).toBe(true);
    expect(isLoginAttemptAllowed("teacher:t@example.com")).toBe(true);
  });

  it("윈도우가 지나면 다시 허용된다", () => {
    vi.useFakeTimers();
    for (let i = 0; i <= LOGIN_ATTEMPT_LIMIT; i++) isLoginAttemptAllowed("teacher:t@example.com");
    expect(isLoginAttemptAllowed("teacher:t@example.com")).toBe(false);
    vi.advanceTimersByTime(LOGIN_ATTEMPT_WINDOW_MS + 1);
    expect(isLoginAttemptAllowed("teacher:t@example.com")).toBe(true);
  });
});
