import { describe, it, expect } from "vitest";
import {
  getRequiredRole,
  canAccess,
  getRedirectPath,
  isPublicRoute,
} from "@/lib/route-access";

describe("isPublicRoute", () => {
  it("로그인 페이지는 공개 라우트이다", () => {
    expect(isPublicRoute("/login")).toBe(true);
  });

  it("회원가입 페이지는 공개 라우트이다", () => {
    expect(isPublicRoute("/register")).toBe(true);
  });

  it("비밀번호 찾기는 공개 라우트이다", () => {
    expect(isPublicRoute("/forgot-password")).toBe(true);
  });

  it("API 라우트는 공개 라우트이다", () => {
    expect(isPublicRoute("/api/auth/register")).toBe(true);
  });

  it("교사 대시보드는 공개 라우트가 아니다", () => {
    expect(isPublicRoute("/teacher-dashboard")).toBe(false);
  });

  it("학생 대시보드는 공개 라우트가 아니다", () => {
    expect(isPublicRoute("/student-dashboard")).toBe(false);
  });
});

describe("getRequiredRole", () => {
  it("teacher 접두사 경로는 TEACHER를 반환한다", () => {
    expect(getRequiredRole("/teacher-dashboard")).toBe("TEACHER");
    expect(getRequiredRole("/teacher-questions")).toBe("TEACHER");
    expect(getRequiredRole("/teacher-students")).toBe("TEACHER");
  });

  it("student 접두사 경로는 STUDENT를 반환한다", () => {
    expect(getRequiredRole("/student-dashboard")).toBe("STUDENT");
    expect(getRequiredRole("/student-ask")).toBe("STUDENT");
    expect(getRequiredRole("/student-explore")).toBe("STUDENT");
  });

  it("공개 경로는 null을 반환한다", () => {
    expect(getRequiredRole("/login")).toBeNull();
    expect(getRequiredRole("/")).toBeNull();
  });
});

describe("canAccess", () => {
  it("교사는 teacher 경로에 접근할 수 있다", () => {
    expect(canAccess("TEACHER", "/teacher-dashboard")).toBe(true);
  });

  it("학생은 teacher 경로에 접근할 수 없다", () => {
    expect(canAccess("STUDENT", "/teacher-dashboard")).toBe(false);
  });

  it("학생은 student 경로에 접근할 수 있다", () => {
    expect(canAccess("STUDENT", "/student-dashboard")).toBe(true);
  });

  it("교사는 student 경로에 접근할 수 없다", () => {
    expect(canAccess("TEACHER", "/student-dashboard")).toBe(false);
  });

  it("누구나 공개 경로에 접근할 수 있다", () => {
    expect(canAccess(null, "/login")).toBe(true);
    expect(canAccess("STUDENT", "/login")).toBe(true);
    expect(canAccess("TEACHER", "/login")).toBe(true);
  });

  it("인증 없이 보호된 경로에 접근할 수 없다", () => {
    expect(canAccess(null, "/teacher-dashboard")).toBe(false);
    expect(canAccess(null, "/student-dashboard")).toBe(false);
  });
});

describe("getRedirectPath", () => {
  it("교사는 teacher-dashboard로 리다이렉트된다", () => {
    expect(getRedirectPath("TEACHER")).toBe("/teacher-dashboard");
  });

  it("학생은 student-dashboard로 리다이렉트된다", () => {
    expect(getRedirectPath("STUDENT")).toBe("/student-dashboard");
  });

  it("인증 없으면 login으로 리다이렉트된다", () => {
    expect(getRedirectPath(null)).toBe("/login");
  });
});
