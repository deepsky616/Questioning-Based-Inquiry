import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = "src";
const forbidden = [
  "Unauthorized",
  "User not found",
  "Unknown action",
  "failed to load",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "__tests__") return [];
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("사용자 노출 오류 문구", () => {
  it("주요 인증과 로딩 오류 문구를 한국어로 제공한다", () => {
    const offenders = sourceFiles(srcRoot).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return forbidden
        .filter((needle) => text.includes(needle))
        .map((needle) => `${file}: ${needle}`);
    });

    expect(offenders).toEqual([]);
  });
});
