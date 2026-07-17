import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

const page = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const actions = readFileSync(
  "src/app/(teacher)/teacher-sessions/TeacherQuestionClassActions.tsx",
  "utf8",
);
const workspaceNav = readFileSync(
  "src/app/(teacher)/teacher-sessions/QuestionClassWorkspaceNav.tsx",
  "utf8",
);
const createCard = readFileSync(
  "src/app/(teacher)/teacher-sessions/TeacherSessionCreateCard.tsx",
  "utf8",
);
const curriculumPage = readFileSync(
  "src/app/(teacher)/teacher-curriculum/page.tsx",
  "utf8",
);
const inquiryWorkspaceHeader = readFileSync(
  "src/app/(teacher)/teacher-curriculum/InquiryQuestionClassWorkspaceHeader.tsx",
  "utf8",
);
const monthList = readFileSync(
  "src/app/(teacher)/teacher-sessions/TeacherSessionMonthList.tsx",
  "utf8",
);
const row = readFileSync(
  "src/app/(teacher)/teacher-sessions/TeacherSessionRow.tsx",
  "utf8",
);

describe("질문수업 통합 화면 계약", () => {
  it("목록과 두 만들기 화면을 항상 오갈 수 있는 작업공간 탐색을 제공한다", () => {
    expect(workspaceNav).toContain('href="/teacher-sessions"');
    expect(workspaceNav).toContain('href="/teacher-curriculum"');
    expect(workspaceNav).toContain('href="/teacher-sessions?view=quick"');
    expect(workspaceNav).toContain('aria-current={activeView === "list" ? "page" : undefined}');
    expect(workspaceNav).toContain('aria-current={activeView === "inquiry" ? "page" : undefined}');
    expect(workspaceNav).toContain('aria-current={activeView === "quick" ? "page" : undefined}');
  });

  it("목록과 간단 만들기는 같은 주소에서 한 화면만 표시한다", () => {
    expect(page).toContain('searchParams.get("view") === "quick"');
    expect(page).toContain('<QuestionClassWorkspaceNav activeView={activeView} />');
    expect(page).toContain('activeView === "quick"');
    expect(page).toContain('t("quickViewTitle")');
    expect(page).toContain('t("listViewTitle")');
  });

  it("탐구 만들기 화면은 공통 탐색과 화면 제목 뒤에 도우미 안내를 둔다", () => {
    expect(curriculumPage).toContain("<InquiryQuestionClassWorkspaceHeader />");
    expect(inquiryWorkspaceHeader).toContain('<QuestionClassWorkspaceNav activeView="inquiry" />');
    expect(inquiryWorkspaceHeader).toContain('tSessions("inquiryViewTitle")');
    expect(inquiryWorkspaceHeader).toContain('tSessions("inquiryHelperTitle")');
    expect(inquiryWorkspaceHeader.indexOf('tSessions("inquiryViewTitle")'))
      .toBeLessThan(inquiryWorkspaceHeader.indexOf('tSessions("inquiryHelperTitle")'));
  });

  it("간단 만들기 양식은 별도 화면의 본문으로 표시하고 중복 제목을 숨긴다", () => {
    expect(actions).not.toContain("quickCreateOpen");
    expect(actions).toContain("<TeacherSessionCreateCard");
    expect(actions).toContain("showHeader={false}");
    expect(createCard).toContain("showHeader?: boolean");
  });

  it("기존 간단 생성 요청 계약을 유지하고 유효한 식별값에서만 완료 처리한다", () => {
    expect(actions).toContain('fetch("/api/sessions"');
    expect(actions).toContain("...sessForm");
    expect(actions).toContain("buildClassStudentTargetPayload");
    expect(actions).toContain('typeof created.id !== "string"');
    expect(actions).toContain("created.id.trim()");
    expect(actions).toMatch(/filter\(\(session\) => session\.id !== created\.id\)/);
    expect(actions).toContain("appQueryKeys.teacherSessions");
    expect(actions).toContain("invalidateQueries");
  });

  it("주소와 생성 결과를 실제 목록 행이 나타난 뒤 강조한다", () => {
    expect(page).toContain("Suspense");
    expect(page).toContain("useSearchParams");
    expect(page).toContain('searchParams.get("session")');
    expect(page).toContain("highlightSessionId");
    expect(page).toContain("sortedSessions.some");
    expect(monthList).toContain("highlightSessionId");
    expect(monthList).toContain("group.sessions.some");
    expect(monthList).toContain("isHighlighted={s.id === highlightSessionId}");
    expect(row).toContain("scrollIntoView");
  });

  it("설계 연결 여부만으로 두 질문수업 종류를 표시한다", () => {
    expect(row).toContain("!!session.unitDesignId");
    expect(row).toContain("badgeQuickQuestionClass");
    expect(row).toContain("badgeInquiryQuestionClass");
    expect(row).not.toContain("isInquiryDesignSession");
  });

  it("목록 조회 오류와 실제 빈 목록을 구분한다", () => {
    expect(page).toContain("isError");
    expect(page).toContain('t("loadFailedTitle")');
    expect(page).toContain('t("emptyTitle")');
    expect(ko.sessions.loadFailedTitle).not.toBe(ko.sessions.emptyTitle);
    expect(en.sessions.loadFailedTitle).not.toBe(en.sessions.emptyTitle);
  });
});
