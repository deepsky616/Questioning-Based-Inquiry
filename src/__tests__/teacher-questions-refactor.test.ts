import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/(teacher)/teacher-questions/page.tsx", "utf8");

describe("teacher questions page structure", () => {
  it("keeps top tabs and session selector in focused components", () => {
    expect(existsSync("src/app/(teacher)/teacher-questions/TeacherQuestionTopTabs.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-questions/TeacherQuestionSessionSelector.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-questions/TeacherQuestionListPanel.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-questions/TeacherQuestionTable.tsx")).toBe(true);
    expect(pageSource).toContain("TeacherQuestionTopTabs");
    expect(pageSource).toContain("TeacherQuestionSessionSelector");
    expect(pageSource).toContain("TeacherQuestionListPanel");
    expect(pageSource).not.toContain("const QuestionTable =");
  });

  it("keeps the main page below the large component threshold", () => {
    expect(pageSource.split("\n").length).toBeLessThan(850);
  });
});
