import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const curriculumPage = readFileSync("src/app/(teacher)/teacher-curriculum/page.tsx", "utf8");
const curriculumCreateFlow = readFileSync("src/app/(teacher)/teacher-curriculum/CurriculumCreateFlow.tsx", "utf8");
const askPage = readFileSync("src/app/(student)/student-ask/page.tsx", "utf8");

describe("primary teacher and student screen structure", () => {
  it("keeps teacher curriculum creation steps in focused components", () => {
    [
      "CurriculumMainTabs.tsx",
      "CurriculumStepProgress.tsx",
      "CurriculumKeywordStep.tsx",
      "CurriculumSelectableTextStep.tsx",
    ].forEach((file) => {
      expect(existsSync(`src/app/(teacher)/teacher-curriculum/${file}`)).toBe(true);
    });

    expect(curriculumPage).toContain("CurriculumMainTabs");
    expect(curriculumPage).toContain("CurriculumCreateFlow");
    expect(curriculumCreateFlow).toContain("CurriculumStepProgress");
    expect(curriculumCreateFlow).toContain("CurriculumKeywordStep");
    expect(curriculumCreateFlow).toContain("CurriculumSelectableTextStep");
    expect(curriculumPage.split("\n").length).toBeLessThan(850);
  });

  it("keeps student asking flow panels in focused components", () => {
    [
      "StudentAskSessionSelector.tsx",
      "StudentAskInputCard.tsx",
      "StudentAskResultCard.tsx",
      "StudentAskCompletionCard.tsx",
    ].forEach((file) => {
      expect(existsSync(`src/app/(student)/student-ask/${file}`)).toBe(true);
    });

    expect(askPage).toContain("StudentAskSessionSelector");
    expect(askPage).toContain("StudentAskInputCard");
    expect(askPage).toContain("StudentAskResultCard");
    expect(askPage).toContain("StudentAskCompletionCard");
    expect(askPage.split("\n").length).toBeLessThan(700);
  });
});
