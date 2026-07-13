import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const myQuestionsSource = readFileSync("src/components/student/MyQuestionsView.tsx", "utf8");
const reportViewSource = readFileSync("src/components/reports/ReportView.tsx", "utf8");
const reportSectionsSource = readFileSync("src/components/reports/ReportViewSections.tsx", "utf8");

describe("student tablet and report refactor priorities", () => {
  it("adds a tablet-friendly overview strip to the student my questions screen", () => {
    expect(existsSync("src/components/student/StudentMyQuestionsSummary.tsx")).toBe(true);
    expect(myQuestionsSource).toContain("StudentMyQuestionsSummary");
    expect(myQuestionsSource).toContain("my-questions-tablet-overview");
    expect(myQuestionsSource).toContain("md:grid-cols-4");
    expect(myQuestionsSource).toContain("min-h-[96px]");
  });

  it("keeps report distribution chart and class roster table in focused components", () => {
    expect(reportSectionsSource).toContain("ReportClassificationDistributionChart");
    expect(reportSectionsSource).toContain("ReportStudentActivityTable");
    expect(reportViewSource).toContain("ReportClassificationDistributionChart");
    expect(reportViewSource).toContain("ReportStudentActivityTable");
    // 세션 분석 번역 상태가 추가된 뒤에도 분리 구조를 유지할 수 있는 소폭 여유다.
    expect(reportViewSource.split("\n").length).toBeLessThan(720);
  });
});
