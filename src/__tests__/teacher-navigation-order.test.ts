import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync("src/app/(teacher)/layout.tsx", "utf8");

function readTeacherPages() {
  const pagesBlock = layoutSource.match(/const TEACHER_PAGES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  return Array.from(pagesBlock.matchAll(/\{ href: "([^"]+)", key: "([^"]+)" \}/g), ([, href, key]) => ({
    href,
    key,
  }));
}

describe("teacher navigation order", () => {
  it("교사 수업 흐름의 전체 메뉴 순서를 고정한다", () => {
    expect(readTeacherPages()).toEqual([
      { href: "/teacher-dashboard", key: "dashboard" },
      { href: "/teacher-question-learning", key: "questionLearning" },
      { href: "/teacher-practice", key: "practice" },
      { href: "/teacher-curriculum", key: "curriculum" },
      { href: "/teacher-sessions", key: "sessions" },
      { href: "/teacher-questions", key: "questions" },
      { href: "/teacher-question-play", key: "questionPlay" },
    ]);
  });

  it("교사 설정과 학생 관리를 상단 계정 메뉴에서 접근할 수 있다", () => {
    expect(layoutSource).toContain('settingsHref: "/teacher-settings"');
    expect(layoutSource).toContain('studentManagementHref: "/teacher-students"');
  });
});
