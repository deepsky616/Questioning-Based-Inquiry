import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync("src/app/(student)/layout.tsx", "utf8");

function readStudentPages() {
  const pagesBlock = layoutSource.match(/const STUDENT_PAGES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  return Array.from(pagesBlock.matchAll(/\{ href: "([^"]+)", key: "([^"]+)" \}/g), ([, href, key]) => ({
    href,
    key,
  }));
}

describe("student navigation order", () => {
  it("학생 학습 흐름의 전체 메뉴 순서를 고정한다", () => {
    expect(readStudentPages()).toEqual([
      { href: "/student-dashboard", key: "dashboard" },
      { href: "/student-question-learning", key: "questionLearning" },
      { href: "/student-practice", key: "practice" },
      { href: "/student-ask", key: "ask" },
      { href: "/student-questions", key: "explore" },
      { href: "/student-question-play", key: "questionPlay" },
    ]);
  });

  it("학생 설정을 상단 계정 메뉴에서 접근할 수 있다", () => {
    expect(layoutSource).toContain('settingsHref: "/student-settings"');
  });
});
