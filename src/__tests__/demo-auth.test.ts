import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSource = readFileSync("src/lib/auth.ts", "utf8");
const sharedAuthSource = readFileSync("src/lib/auth-shared.ts", "utf8");
const authHelpersSource = readFileSync("src/lib/auth-helpers.ts", "utf8");
const authTypesSource = readFileSync("src/types/next-auth.d.ts", "utf8");
const routeAccessSource = readFileSync("src/lib/route-access.ts", "utf8");

describe("김질문 시연 자동 로그인 경계", () => {
  it("실행 표 전용 인증 제공자만 시연 학생을 찾는다", () => {
    expect(authSource).toContain('id: "demo-launch"');
    expect(authSource).toContain("validateDemoLaunchTicket");
    expect(authSource).toContain("isDemo: true");
    expect(authSource).toContain("studentNumber: DEMO_STUDENT_NUMBER");
    expect(authSource).toContain("limit: 20");
  });

  it("시연 여부를 토큰과 세션에 유지한다", () => {
    expect(sharedAuthSource).toContain("token.isDemo = user.isDemo");
    expect(sharedAuthSource).toContain("session.user.isDemo = token.isDemo === true");
    expect(authHelpersSource).toContain("isDemo: boolean");
    expect(authTypesSource).toContain("isDemo: boolean");
  });

  it("로그인되지 않은 사용자도 시연 실행 화면에 접근한다", () => {
    expect(routeAccessSource).toContain('"/demo/launch"');
  });
});
