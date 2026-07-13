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

  it("shows inquiry design guidance in the shared session selector", () => {
    expect(pageSource).toContain('topTab === "design" ? t("designFilterHint") : t("filterHint")');
    expect(pageSource).toContain('topTab === "design" ? t("designSessionHint") : undefined');
  });

  it("keeps the main page below the large component threshold", () => {
    expect(pageSource.split("\n").length).toBeLessThan(850);
  });

  it("교사 질문 목록은 경량 페이지 응답과 페이지 정보를 사용한다", () => {
    expect(pageSource).toContain("buildTeacherQuestionPagePath");
    expect(pageSource).toContain("pageInfo");
    expect(pageSource).not.toContain("QUESTION_LIST_MAX");
  });

  it("교사 질문 조회 실패를 빈 목록과 구분하고 다시 시도할 수 있다", () => {
    expect(pageSource).toContain("questionsQuery.isError");
    expect(pageSource).toContain("onQuestionsRetry");
  });

  it("교사 질문 페이지의 무거운 집계는 리포트 주기로만 자동 갱신한다", () => {
    expect(pageSource).toContain("visibleReportRefetchInterval");
    expect(pageSource).not.toContain("visibleDataRefetchInterval");
  });
});
