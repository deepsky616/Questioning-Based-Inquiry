import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const studentAskFlow = readFileSync("e2e/student-ask-flow.spec.ts", "utf8");
const tabletNavPath = "e2e/student-tablet-navigation.spec.ts";
const tabletNavFlow = existsSync(tabletNavPath) ? readFileSync(tabletNavPath, "utf8") : "";
// 로그인(대시보드 진입 포함)은 하이드레이션 안전 공용 헬퍼로 이동했다
const loginHelper = readFileSync("e2e/helpers/login.ts", "utf8");

describe("tablet e2e policy", () => {
  it("runs critical browser checks against a tablet viewport as a first-class project", () => {
    expect(playwrightConfig).toContain('name: "tablet"');
    expect(playwrightConfig).toContain("iPad Pro");
  });

  it("exposes a tablet-only e2e script and CI job for environments with a test database", () => {
    expect(packageJson.scripts?.["test:e2e:tablet"]).toBe("playwright test --project=tablet");
    expect(ci).toContain("e2e-tablet");
    expect(ci).toContain("npm run test:e2e:tablet");
    expect(ci).toContain("E2E_DATABASE_URL");
  });

  it("covers student tablet navigation beyond question writing", () => {
    expect(existsSync(tabletNavPath)).toBe(true);
    expect(studentAskFlow).toContain("태블릿에서 질문을 분석하고 저장");
    expect(tabletNavFlow).toContain("학생 태블릿 핵심 이동");
    // 대시보드 진입은 공용 로그인 헬퍼가 담당한다
    expect(tabletNavFlow).toContain("loginAsStudent");
    expect(loginHelper).toContain("/student-dashboard");
    expect(tabletNavFlow).toContain("/student-ask");
    expect(tabletNavFlow).toContain("/student-questions");
    expect(tabletNavFlow).toContain("/student-question-play");
  });
});
