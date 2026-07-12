import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const teacherSessionsPage = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const reportView = readFileSync("src/components/reports/ReportView.tsx", "utf8");

describe("core screen component split", () => {
  it("keeps teacher session list summary and controls in focused components", () => {
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionSummaryGrid.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionListControls.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionCreateCard.tsx")).toBe(true);
    expect(existsSync("src/app/(teacher)/teacher-sessions/TeacherSessionRow.tsx")).toBe(true);
    expect(teacherSessionsPage).toContain("TeacherSessionSummaryGrid");
    expect(teacherSessionsPage).toContain("TeacherSessionListControls");
    expect(teacherSessionsPage).toContain("TeacherSessionCreateCard");
    // 세션 행 렌더링은 월 그룹 목록(TeacherSessionMonthList)이 담당하고,
    // 그 안에서 TeacherSessionRow를 사용한다(지난 세션 월별 접기 도입 시 이동).
    expect(teacherSessionsPage).toContain("TeacherSessionMonthList");
    expect(
      readFileSync("src/app/(teacher)/teacher-sessions/TeacherSessionMonthList.tsx", "utf8"),
    ).toContain("TeacherSessionRow");
    expect(teacherSessionsPage.split("\n").length).toBeLessThan(430);
  });

  it("keeps report repeated layout grids in a shared component", () => {
    expect(existsSync("src/components/reports/ReportSectionGrid.tsx")).toBe(true);
    expect(reportView).toContain("ReportSectionGrid");
    expect(reportView.split("\n").length).toBeLessThan(850);
  });

  it("keeps point review split into hook, picker, and row components", () => {
    expect(existsSync("src/components/teacher/point-review/usePointReview.ts")).toBe(true);
    expect(existsSync("src/components/teacher/point-review/AnalysisSessionPicker.tsx")).toBe(true);
    expect(existsSync("src/components/teacher/point-review/PendingRow.tsx")).toBe(true);
    expect(existsSync("src/components/teacher/point-review/types.ts")).toBe(true);
    const pointReviewView = readFileSync("src/components/teacher/PointReviewView.tsx", "utf8");
    expect(pointReviewView).toContain("usePointReview()");
    expect(pointReviewView).toContain("AnalysisSessionPicker");
    expect(pointReviewView).toContain("PendingRow");
    // 조립 전용 — 로직이 다시 이 파일로 흘러들지 않게 크기를 고정
    expect(pointReviewView.split("\n").length).toBeLessThan(350);
  });
});
