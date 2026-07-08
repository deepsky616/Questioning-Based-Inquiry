import { existsSync, readFileSync } from "node:fs";

const curriculumPage = readFileSync("src/app/(teacher)/teacher-curriculum/page.tsx", "utf8");
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
    expect(curriculumPage).toContain("CurriculumStepProgress");
    expect(curriculumPage).toContain("CurriculumKeywordStep");
    expect(curriculumPage).toContain("CurriculumSelectableTextStep");
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
