import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const inputCardSource = readFileSync("src/app/(student)/student-ask/StudentAskInputCard.tsx", "utf8");
const sessionSelectorSource = readFileSync("src/app/(student)/student-ask/StudentAskSessionSelector.tsx", "utf8");
const referencePanelSource = readFileSync("src/app/(student)/student-ask/StudentAskReferencePanel.tsx", "utf8");
const askPageSource = readFileSync("src/app/(student)/student-ask/page.tsx", "utf8");

describe("student ask staged layout", () => {
  it("wires the reference panel beside the input card", () => {
    expect(askPageSource).toContain("StudentAskReferencePanel");
    expect(askPageSource).toContain("referencePanel={");
  });

  it("stages the flow: full-width session selection, then writing beside reference", () => {
    // 선택(전체 폭) → 작성(왼쪽)+참고(오른쪽) — 쓰면서 참고하는 흐름과 화면 순서를 일치시킨다
    expect(inputCardSource).toContain("student-ask-session-panel");
    expect(inputCardSource).toContain("md:grid-cols-2 md:items-start");
    expect(inputCardSource).toContain("student-ask-question-panel");
    expect(inputCardSource).toContain("referencePanel");
    expect(inputCardSource).not.toContain("md:sticky");
  });

  it("keeps the question panel content-sized with a fixed button position", () => {
    // 남는 공간을 패널 안 요소가 흡수하면(flex-1/stretch/mt-auto) 어색해지는 문제가
    // 세 차례 반복됐다 — 입력창 6줄 고정, 여백은 패널 테두리 밖에만 남긴다.
    expect(inputCardSource).toContain('rows={6}');
    expect(inputCardSource).toContain("min-h-[10rem] resize-none");
    expect(inputCardSource).not.toContain("flex-1");
    expect(inputCardSource).not.toContain("mt-auto");
    expect(inputCardSource).not.toContain("items-stretch");
  });

  it("shows the selected session once as a highlighted bar (no duplicate card)", () => {
    // 선택 그리드가 스크롤로 안 보일 때 작성 패널의 하이라이트 바가 유일한 맥락 표시다.
    // 교과·주제 + 날짜·탐구질문 수업·공개 여부 칩, 밝은/어두운 테마 색 모두 지정.
    expect(inputCardSource).toContain("student-ask-current-session");
    expect(inputCardSource).toContain('t("currentSession")');
    expect(inputCardSource).toContain("selectedSession.date");
    expect(inputCardSource).toContain('t("inquiryClassTag")');
    expect(inputCardSource).toContain("defaultQuestionPublic");
    expect(inputCardSource).toContain("bg-indigo-50");
    expect(inputCardSource).toContain("dark:bg-indigo-950/40");
    expect(inputCardSource).toContain("dark:bg-indigo-900");
    expect(sessionSelectorSource).not.toContain("currentSession");
  });

  it("keeps reference material beside the writing panel with a helper fallback", () => {
    // 탐구수업: 교사 탐구질문+설계 참고자료 / 일반 세션: 좋은 질문 도우미
    expect(referencePanelSource).toContain("student-ask-reference-panel");
    expect(referencePanelSource).toContain("teacherInquiryQuestions");
    expect(referencePanelSource).toContain("DesignReferenceView");
    expect(referencePanelSource).toContain("helperTitle");
    expect(referencePanelSource).toContain('href="/student-practice"');
    // 참고자료가 길어도 작성 패널을 압도하지 않도록 내부 스크롤 상한
    expect(referencePanelSource).toContain("max-h-[34rem]");
    expect(sessionSelectorSource).not.toContain("DesignReferenceView");
  });

  it("keeps session badges and controls touch-friendly on tablets", () => {
    expect(sessionSelectorSource).toContain("getSessionDateBadge(session.date)");
    expect(sessionSelectorSource).toContain("completedSessionBadge");
    expect(sessionSelectorSource).toContain("inquiryClassTag");
    expect(sessionSelectorSource).toContain("student-ask-filter-grid");
    expect(sessionSelectorSource).toContain("groupSessionsByMonth");
    expect(sessionSelectorSource).toContain("<optgroup");
    expect(sessionSelectorSource).toContain("student-ask-month-section");
    expect(sessionSelectorSource).toContain("student-ask-month-grid");
    expect(sessionSelectorSource).toContain("student-ask-session-grid");
    expect(sessionSelectorSource).toContain("min-h-[132px]");
    expect(sessionSelectorSource).toContain("max-h-[24rem]");
    expect(sessionSelectorSource).toContain("h-11");
    expect(sessionSelectorSource).toContain("h-12");
  });

  it("keeps today/upcoming always visible and past months collapsed with search", () => {
    // 학생의 주 용무는 오늘·예정 수업 — 지난 세션은 월별 접기(기본 접힘,
    // 검색·필터 중 자동 펼침)로 카드가 쌓여도 소음이 되지 않게 한다.
    expect(sessionSelectorSource).toContain("upcomingMonthGroups");
    expect(sessionSelectorSource).toContain("student-ask-past-section");
    expect(sessionSelectorSource).toContain("expandedPastMonths");
    expect(sessionSelectorSource).toContain("filtersActive || containsSelected || expandedPastMonths.has(group.key)");
    // 드롭다운으로 지난 세션을 선택해도 카드가 보이도록 그룹 자동 펼침 + 스크롤
    expect(sessionSelectorSource).toContain("data-session-id");
    expect(sessionSelectorSource).toContain("scrollIntoView");
    expect(sessionSelectorSource).toContain("CollapseChevron");
    expect(sessionSelectorSource).toContain('type="search"');
  });
});
