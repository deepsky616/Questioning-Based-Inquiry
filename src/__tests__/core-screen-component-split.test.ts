import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const teacherSessionsPage = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");

describe("core screen component split", () => {
  it("keeps teacher session list summary and controls in focused components", () => {
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionSummaryGrid.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionListControls.tsx")).toBe(true);
    expect(teacherSessionsPage).toContain("TeacherSessionSummaryGrid");
    expect(teacherSessionsPage).toContain("TeacherSessionListControls");
    expect(teacherSessionsPage.split("\n").length).toBeLessThan(850);
  });

  it("keeps report repeated layout grids in a shared component", () => {
    expect(existsSync("src/components/reports/ReportSectionGrid.tsx")).toBe(true);
    expect(reportView).toContain("ReportSectionGrid");
    expect(reportView.split("\n").length).toBeLessThan(850);
  });
});
