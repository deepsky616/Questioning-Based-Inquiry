import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

describe("USB 시연 학급 자료 생성 명령", () => {
  it("4학년 1반 학생 28명을 고정된 순서로 제공한다", () => {
    const source = readFileSync("scripts/seed-usb-demo.mjs", "utf8");
    const namesMatch = source.match(
      /export const STUDENT_NAMES = \[(?<names>[\s\S]*?)\];/,
    );
    expect(namesMatch?.groups?.names).toBeTruthy();

    const names = [...(namesMatch?.groups?.names.matchAll(/"([^"]+)"/g) ?? [])]
      .map((match) => match[1]);

    expect(names).toHaveLength(28);
    expect(names[0]).toBe("김질문");
    expect(names[27]).toBe("고서아");
  });

  it("시연 사용자 범위만 초기화하고 반복 실행할 수 있다", () => {
    const source = readFileSync("scripts/seed-usb-demo.mjs", "utf8");

    expect(source).toContain("isDemo: true");
    expect(source).toContain("isDemo: false");
    expect(source).toContain("deleteMany");
    expect(source).toContain('id: "usb-demo-teacher"');
    expect(source).toContain("`usb-demo-student-${pad(number)}`");
    expect(source).not.toContain("aiApiKey:");
  });

  it("질문수업, 탐구 자료, 질문, 답변, 연습과 세 방식 놀이 기록을 만든다", () => {
    const source = readFileSync("scripts/seed-usb-demo.mjs", "utf8");

    expect(source).toContain("questionSession.create");
    expect(source).toContain("unitDesign.create");
    expect(source).toContain("question.create");
    expect(source).toContain("comment.create");
    expect(source).toContain("practiceAttempt.create");
    expect(source).toContain('"SOLO"');
    expect(source).toContain('"AI"');
    expect(source).toContain("`room:usb-demo:${pad(number)}`");
  });

  it("꾸러미 명령을 패키지 명령으로 제공한다", () => {
    expect(packageJson.scripts["demo:seed"]).toBe(
      "node scripts/seed-usb-demo.mjs",
    );
  });
});
