import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// 메뉴 클릭 즉시 로딩 피드백 정책.
// 그룹 내 페이지 이동의 서스펜스 경계는 각 그룹의 loading.tsx다 — 루트 loading.tsx는
// 그룹 안 이동에는 동작하지 않으므로, 그룹별 파일이 없어지면 "클릭해도 반응 없음"이 재발한다.
const BOUNDARIES = [
  "src/app/loading.tsx",
  "src/app/(student)/loading.tsx",
  "src/app/(teacher)/loading.tsx",
];

describe("route loading policy", () => {
  it("keeps an instant loading boundary at root and in both role groups", () => {
    for (const path of BOUNDARIES) {
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, "utf8")).toContain("RouteLoading");
    }
  });
});
