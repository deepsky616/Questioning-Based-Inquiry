import { describe, it, expect } from "vitest";
import {
  extractSessionUser,
  requireTeacherSession,
  requireAuthSession,
  type AppUser,
} from "@/lib/session-helpers";

const makeSession = (overrides: Partial<AppUser> = {}): { user: AppUser } => ({
  user: {
    id: "user-1",
    email: "teacher@school.kr",
    name: "김선생",
    role: "TEACHER",
    school: "서울초등학교",
    grade: null,
    className: null,
    ...overrides,
  },
});

describe("extractSessionUser", () => {
  it("유효한 세션에서 AppUser를 반환한다", () => {
    const session = makeSession();
    const user = extractSessionUser(session);
    expect(user).not.toBeNull();
    expect(user!.id).toBe("user-1");
    expect(user!.role).toBe("TEACHER");
  });

  it("null 세션이면 null을 반환한다", () => {
    expect(extractSessionUser(null)).toBeNull();
  });

  it("user가 없는 세션이면 null을 반환한다", () => {
    expect(extractSessionUser({})).toBeNull();
  });

  it("id가 없으면 null을 반환한다", () => {
    const session = { user: { email: "a@b.com", role: "TEACHER" } };
    expect(extractSessionUser(session)).toBeNull();
  });
});

describe("requireAuthSession", () => {
  it("인증된 세션이면 user를 반환한다", () => {
    const session = makeSession();
    const result = requireAuthSession(session);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("user-1");
    }
  });

  it("세션이 없으면 401 오류를 반환한다", () => {
    const result = requireAuthSession(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });
});

describe("requireTeacherSession", () => {
  it("교사 세션이면 user를 반환한다", () => {
    const session = makeSession({ role: "TEACHER" });
    const result = requireTeacherSession(session);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("TEACHER");
    }
  });

  it("학생 세션이면 403 오류를 반환한다", () => {
    const session = makeSession({ role: "STUDENT" });
    const result = requireTeacherSession(session);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("세션이 없으면 401 오류를 반환한다", () => {
    const result = requireTeacherSession(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });
});
