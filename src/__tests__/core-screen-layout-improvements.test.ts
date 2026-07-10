import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const studentDashboard = readFileSync("src/app/(student)/student-dashboard/page.tsx", "utf8");
const studentDashboardTasksCard = readFileSync("src/app/(student)/student-dashboard/StudentDashboardTasksCard.tsx", "utf8");
const teacherDashboard = readFileSync("src/app/(teacher)/teacher-dashboard/page.tsx", "utf8");
const teacherCurriculum = readFileSync("src/app/(teacher)/teacher-curriculum/page.tsx", "utf8");
const myQuestionsView = readFileSync("src/components/student/MyQuestionsView.tsx", "utf8");
const teacherSessions = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");
const teacherSessionSummaryGrid = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionSummaryGrid.tsx", "utf8");
const teacherSessionListControls = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionListControls.tsx", "utf8");
const teacherSessionCreateCard = readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionCreateCard.tsx", "utf8");
const reportSectionGrid = readFileSync("src/components/reports/ReportSectionGrid.tsx", "utf8");
const reportViewSections = readFileSync("src/components/reports/ReportViewSections.tsx", "utf8");

describe("core screen layout improvements", () => {
  it("keeps student dashboard and question views tablet-friendly", () => {
    expect(studentDashboard).toContain("student-dashboard-tablet-overview");
    expect(studentDashboard).toContain("md:items-stretch");
    expect(studentDashboard).toContain("student-dashboard-points-panel");
    expect(studentDashboard).toContain("student-dashboard-question-summary");
    expect(studentDashboard.indexOf("student-dashboard-points-panel")).toBeLessThan(
      studentDashboard.indexOf("<StudentDashboardTasksCard"),
    );
    expect(studentDashboard.indexOf("student-dashboard-question-summary")).toBeLessThan(
      studentDashboard.indexOf("<StudentDashboardTasksCard"),
    );
    expect(studentDashboard).toContain("h-full");
    expect(studentDashboardTasksCard).toContain("student-dashboard-task-panel");
    expect(studentDashboardTasksCard).toContain("student-dashboard-task-grid");
    expect(studentDashboardTasksCard).toContain("min-h-[116px]");
    expect(myQuestionsView).toContain("my-questions-tablet-filters");
    expect(myQuestionsView).toContain("student-questions-tablet-list");
    expect(myQuestionsView).toContain("xl:hidden");
    expect(myQuestionsView).toContain("flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:flex-wrap md:items-center");
    expect(myQuestionsView).toContain('<div className="shrink-0">');
  });

  it("keeps teacher session management optimized for desktop scanning", () => {
    expect(teacherSessions).toContain("teacher-sessions-desktop-management");
    expect(teacherSessions).toContain("TeacherSessionSummaryGrid");
    expect(teacherSessions).toContain("TeacherSessionListControls");
    expect(teacherSessionSummaryGrid).toContain("teacher-sessions-summary-grid");
    expect(teacherSessionListControls).toContain("teacher-sessions-filter-grid");
    expect(teacherSessionCreateCard).toContain("lg:grid-cols-[1fr_1fr_2fr]");
  });

  it("keeps teacher dashboard action tasks before summary stats", () => {
    expect(teacherDashboard.indexOf("{/* 오늘 할 일 */")).toBeGreaterThan(-1);
    expect(teacherDashboard.indexOf("{/* 총 질문 수 */")).toBeGreaterThan(-1);
    expect(teacherDashboard.indexOf("{/* 오늘 할 일 */")).toBeLessThan(
      teacherDashboard.indexOf("{/* 총 질문 수 */"),
    );
  });

  it("keeps teacher curriculum page width aligned with dashboard", () => {
    expect(teacherDashboard).toContain('className="space-y-6"');
    expect(teacherCurriculum).toContain('className="space-y-6"');
    expect(teacherCurriculum).not.toContain("max-w-4xl mx-auto");
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
