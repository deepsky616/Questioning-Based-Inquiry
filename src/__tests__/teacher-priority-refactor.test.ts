import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const curriculumPage = readFileSync("src/app/(teacher)/teacher-curriculum/page.tsx", "utf8");
const questionsPage = readFileSync("src/app/(teacher)/teacher-questions/page.tsx", "utf8");
const dashboardPage = readFileSync("src/app/(teacher)/teacher-dashboard/page.tsx", "utf8");
const reportsView = readFileSync("src/components/teacher/TeacherReportsView.tsx", "utf8");

describe("teacher priority screen refactors", () => {
  it("keeps teacher curriculum creation flow in a focused component", () => {
    expect(existsSync("src/app/(teacher)/teacher-curriculum/CurriculumCreateFlow.tsx")).toBe(true);
    expect(curriculumPage).toContain("CurriculumCreateFlow");
    expect(curriculumPage.split("\n").length).toBeLessThan(690);
  });

  it("keeps teacher question stats and bulk actions in focused components", () => {
    expect(existsSync("src/app/(teacher)/teacher-questions/TeacherQuestionStatsCard.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-questions/TeacherQuestionBulkActionBar.tsx")).toBe(true);
    expect(questionsPage).toContain("TeacherQuestionStatsCard");
    expect(questionsPage).toContain("TeacherQuestionBulkActionBar");
    expect(questionsPage.split("\n").length).toBeLessThan(660);
  });

  it("keeps dashboard controls and report print controls separated for output flow safety", () => {
    expect(existsSync("src/app/(teacher)/teacher-dashboard/TeacherDashboardTabs.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-dashboard/TeacherDashboardFilters.tsx")).toBe(true);
    expect(existsSync("src/components/teacher/ReportPrintControls.tsx")).toBe(true);
    expect(dashboardPage).toContain("TeacherDashboardTabs");
    expect(dashboardPage).toContain("TeacherDashboardFilters");
    expect(reportsView).toContain("ReportPrintControls");
    expect(reportsView).toContain("showPrintPreview([");
  });
});
