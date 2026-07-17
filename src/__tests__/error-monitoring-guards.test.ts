import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * 에러 모니터링(Sentry) 연동 가드.
 *
 * 과거 런타임 오류 2만여 건이 뒤늦게 발견된 사고의 재발 방지 —
 * 서버 요청 오류가 Sentry로 보고되는 배선이 유지되는지 고정한다.
 * DSN 환경변수가 없으면 전체 연동이 무비용 no-op이어야 한다.
 */
describe("error monitoring guards", () => {
  it("서버 계측 파일이 요청 오류 훅과 함께 존재한다", () => {
    expect(existsSync("src/instrumentation.ts")).toBe(true);
    const source = readFileSync("src/instrumentation.ts", "utf8");
    expect(source).toContain("onRequestError");
    expect(source).toContain("register");
  });

  it("브라우저 계측은 DSN이 있을 때만 활성화된다", () => {
    expect(existsSync("src/instrumentation-client.ts")).toBe(true);
    const source = readFileSync("src/instrumentation-client.ts", "utf8");
    expect(source).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("서버 Sentry 설정은 DSN이 있을 때만 초기화한다", () => {
    expect(existsSync("sentry.server.config.ts")).toBe(true);
    expect(existsSync("sentry.edge.config.ts")).toBe(true);
    for (const path of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
      expect(readFileSync(path, "utf8")).toContain("SENTRY_DSN");
    }
  });

  it("logger.error는 서버에서 Sentry로 이벤트를 전달한다", async () => {
    const source = readFileSync("src/lib/logger.ts", "utf8");
    // 클라이언트 번들에 SDK가 끌려가지 않도록 동적 import + window 가드
    expect(source).toContain('import("@sentry/nextjs")');
    expect(source).toContain("typeof window");
  });

  it("환경변수 예시에 Sentry DSN이 문서화되어 있다", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).toContain("SENTRY_DSN");
    expect(example).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });
});
