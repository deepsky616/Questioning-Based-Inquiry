import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const nextConfig = readFileSync("next.config.js", "utf8");
const ciSource = readFileSync(".github/workflows/ci.yml", "utf8");

describe("Next.js 16 실행 기반", () => {
  it("지원 버전과 Node.js 하한을 정확히 고정한다", () => {
    expect(packageJson.engines.node).toBe(">=20.19.0");
    expect(packageJson.dependencies).toMatchObject({
      next: "16.2.10",
      react: "19.2.7",
      "react-dom": "19.2.7",
      "next-auth": "5.0.0-beta.31",
      "next-intl": "4.13.2",
      nodemailer: "9.0.3",
    });
    expect(packageJson.devDependencies).toMatchObject({
      eslint: "9.39.4",
      "eslint-config-next": "16.2.10",
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
    });
    expect(packageJson.overrides).toEqual({
      next: { postcss: "8.5.10" },
      "next-auth": { nodemailer: "9.0.3" },
      "@auth/core": { nodemailer: "9.0.3" },
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
});
