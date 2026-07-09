import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const studentDashboard = readFileSync("src/app/(student)/student-dashboard/page.tsx", "utf8");
const myQuestionsView = readFileSync("src/components/student/MyQuestionsView.tsx", "utf8");
const teacherSessions = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");
const teacherSessionSummaryGrid = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionSummaryGrid.tsx", "utf8");
const teacherSessionListControls = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionListControls.tsx", "utf8");
const reportSectionGrid = readFileSync("src/components/reports/ReportSectionGrid.tsx", "utf8");
const reportViewSections = readFileSync("src/components/reports/ReportViewSections.tsx", "utf8");

describe("core screen layout improvements", () => {
  it("keeps student dashboard and question views tablet-friendly", () => {
    expect(studentDashboard).toContain("student-dashboard-tablet-overview");
    expect(studentDashboard).toContain("student-dashboard-task-grid");
    expect(studentDashboard).toContain("min-h-[116px]");
    expect(myQuestionsView).toContain("my-questions-tablet-filters");
    expect(myQuestionsView).toContain("student-questions-tablet-list");
    expect(myQuestionsView).toContain("xl:hidden");
  });

  it("keeps teacher session management optimized for desktop scanning", () => {
    expect(teacherSessions).toContain("teacher-sessions-desktop-management");
    expect(teacherSessions).toContain("TeacherSessionSummaryGrid");
    expect(teacherSessions).toContain("TeacherSessionListControls");
    expect(teacherSessionSummaryGrid).toContain("teacher-sessions-summary-grid");
    expect(teacherSessionListControls).toContain("teacher-sessions-filter-grid");
    expect(teacherSessions).toContain("lg:grid-cols-[1fr_1fr_2fr]");
  });

  it("keeps report sections grouped for readable preview and print", () => {
    expect(reportView).toContain("ReportHeaderControls");
    expect(reportViewSections).toContain("report-readable-header");
    expect(reportViewSections).toContain("report-readable-grid");
    expect(reportSectionGrid).toContain("report-readable-grid");
    expect(reportView).toContain("report-analysis-panel");
    expect(reportViewSections).toContain("lg:grid-cols-2");
  });
});
