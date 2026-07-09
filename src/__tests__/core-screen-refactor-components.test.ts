import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const teacherSessionsPage = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");

describe("core screen refactor components", () => {
  it("keeps teacher session list controls in focused components", () => {
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionListControls.tsx")).toBe(true);
    expect(teacherSessionsPage).toContain("TeacherSessionListControls");
    expect(teacherSessionsPage.split("\n").length).toBeLessThan(850);
  });

  it("keeps report header and charts in focused components", () => {
    expect(existsSync("src/components/reports/ReportViewSections.tsx")).toBe(true);
    expect(reportView).toContain("ReportHeaderControls");
    expect(reportView).toContain("ReportTrendGrid");
    expect(reportView).toContain("ReportClassificationTrendGrid");
    expect(reportView.split("\n").length).toBeLessThan(820);
  });
});
