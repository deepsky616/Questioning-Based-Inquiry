import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const aiSource = readFileSync("src/lib/ai.ts", "utf8");
const translateSource = readFileSync("scripts/translate-messages.mjs", "utf8");
const oldPackage = ["@google", "generative-ai"].join("/");

describe("구글 생성형 인공지능 도구 경계", () => {
  it("새 도구만 운영 의존성으로 사용한다", () => {
    expect(packageJson.dependencies["@google/genai"]).toBe("2.11.0");
    expect(packageJson.dependencies[oldPackage]).toBeUndefined();
  });

  it("공통 계층과 번역 스크립트가 새 도구를 사용한다", () => {
    expect(aiSource).toContain('from "@google/genai"');
    expect(translateSource).toContain('from "@google/genai"');
    expect(aiSource).not.toContain(oldPackage);
    expect(translateSource).not.toContain(oldPackage);
  });
});
