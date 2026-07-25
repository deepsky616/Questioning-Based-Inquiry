import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const nextConfig = readFileSync("next.config.js", "utf8");
const ciSource = readFileSync(".github/workflows/ci.yml", "utf8");

describe("Next.js 16 실행 기반", () => {
  it("지원 버전과 Node.js 하한을 정확히 고정한다", () => {
    expect(packageJson.engines.node).toBe(">=20.19.0");
    expect(packageJson.dependencies).toMatchObject({
      "@sentry/nextjs": "^10.68.0",
      next: "16.2.11",
      react: "19.2.7",
      "react-dom": "19.2.7",
      "next-auth": "5.0.0-beta.32",
      "next-intl": "4.13.2",
      nodemailer: "9.0.3",
    });
    expect(packageJson.devDependencies).toMatchObject({
      eslint: "9.39.4",
      "eslint-config-next": "16.2.11",
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
      postcss: "8.5.23",
    });
    expect(packageJson.overrides).toEqual({
      postcss: "$postcss",
      sharp: "0.35.3",
      "next-auth": { nodemailer: "9.0.3" },
      "@auth/core": { nodemailer: "9.0.3" },
      "@sentry/nextjs": {
        "brace-expansion": "5.0.8",
        "fast-uri": "3.1.4",
      },
    });
  });

  it("평면 ESLint 설정과 안정된 Next.js 설정을 사용한다", () => {
    expect(packageJson.scripts.lint).toBe("eslint .");
    expect(existsSync("eslint.config.mjs")).toBe(true);
    expect(existsSync(".eslintrc.json")).toBe(false);
    expect(nextConfig).toContain('serverExternalPackages: ["nodemailer"]');
    expect(nextConfig).not.toContain("serverComponentsExternalPackages");
  });

  it("middleware 대신 proxy 규약을 사용한다", () => {
    expect(existsSync("src/proxy.ts")).toBe(true);
    expect(existsSync("src/middleware.ts")).toBe(false);
  });

  it("CI 형식 검사 전에 Next.js 생성 경로 형식을 만든다", () => {
    expect(ciSource).toContain("run: npx next typegen && npx tsc --noEmit");
  });

  it("질문놀이 데스크톱 신뢰성 검사를 필수 CI 작업으로 실행한다", () => {
    expect(packageJson.scripts["test:e2e:question-games"]).toBe(
      "playwright test e2e/question-games-reliability.spec.ts --project=chromium",
    );
    expect(ciSource).toMatch(/\n  e2e-question-games:\n    runs-on: ubuntu-latest/);
    expect(ciSource).toContain("run: npm run test:e2e:question-games");
  });
});
