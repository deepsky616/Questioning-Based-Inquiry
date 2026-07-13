import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

const page = readFileSync("src/app/(teacher)/teacher-sessions/page.tsx", "utf8");
const actions = readFileSync(
  "src/app/(teacher)/teacher-sessions/TeacherQuestionClassActions.tsx",
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
  it("탐구질문 만들기를 주 행동으로 두고 간단 만들기는 기본으로 닫는다", () => {
    expect(actions).toContain('href="/teacher-curriculum"');
    expect(actions).toContain('data-testid="question-class-primary-action"');
    expect(actions).toContain("quickCreateOpen");
    expect(actions).toContain("quickCreateOpen &&");
    expect(actions).toContain('aria-controls="quick-question-class-form"');
    expect(actions).toContain('aria-expanded={quickCreateOpen}');
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
