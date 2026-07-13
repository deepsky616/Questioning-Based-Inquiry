import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/(teacher)/teacher-questions/page.tsx", "utf8");
const viewStateSource = readFileSync(
  "src/app/(teacher)/teacher-questions/useTeacherQuestionViewState.ts",
  "utf8",
);
const dashboardSource = readFileSync("src/app/(teacher)/teacher-dashboard/page.tsx", "utf8");
const listSource = readFileSync(
  "src/app/(teacher)/teacher-questions/TeacherQuestionListPanel.tsx",
  "utf8",
);
const tabsSource = readFileSync(
  "src/app/(teacher)/teacher-questions/TeacherQuestionTopTabs.tsx",
  "utf8",
);
const navigationSource = readFileSync(
  "src/app/(teacher)/teacher-questions/TeacherQuestionPageNavigation.tsx",
  "utf8",
);

describe("교사 질문 조회 연결과 주소 상태", () => {
  it("대시보드 수업 항목은 해당 수업의 질문 조회로 이동한다", () => {
    expect(dashboardSource).toContain("teacherDashboardSessionHref");
  });

  it("질문 조회는 사용자 주소를 해석하고 변경 내용을 주소에 반영한다", () => {
    expect(pageSource).toContain("useTeacherQuestionViewState");
    expect(viewStateSource).toContain("useSearchParams");
    expect(viewStateSource).toContain("parseTeacherQuestionViewState");
    expect(viewStateSource).toContain("buildTeacherQuestionViewPath");
    expect(pageSource).not.toContain('useState("all")');
  });

  it("필터와 보기 전환과 쪽 상태를 보조 읽기 도구에 전달한다", () => {
    expect(listSource).toContain("aria-label={t(\"searchPlaceholder\")}");
    expect(listSource).toContain("aria-pressed={showFlaggedOnly}");
    expect(listSource).toContain("aria-pressed={filterClosure === value}");
    expect(listSource).toContain("aria-pressed={filterCognitive === value}");
    expect(tabsSource).toContain("aria-pressed={value === \"questions\"}");
    expect(tabsSource).toContain("aria-pressed={value === \"design\"}");
    expect(navigationSource).toContain('aria-live="polite"');
  });

  it("조회 범위가 바뀌면 일괄 선택을 지우고 질문 탭에서만 일괄 작업을 보여준다", () => {
    expect(pageSource).toContain("selectionScope");
    expect(pageSource).toContain("resetBulkState();");
    expect(pageSource).toContain("runWhenTeacherQuestionScopeCurrent");
    expect(pageSource).toContain("selectionRevisionRef.current === requestSelectionRevision");
    expect(pageSource).toContain("const beginBulkOperation = () => ++bulkOperationRevisionRef.current;");
    expect(pageSource.match(/beginBulkOperation\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(pageSource).toContain("runForBulkSelection(");
    expect(pageSource).toContain("setIsGeneratingPreviews(false)");
    expect(pageSource).toContain("setIsSendingPreviews(false)");
    expect(pageSource).toContain('{topTab === "questions" && (\n        <TeacherQuestionBulkActionBar');
  });
});
