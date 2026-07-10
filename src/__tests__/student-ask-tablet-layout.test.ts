import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const inputCardSource = readFileSync("src/app/(student)/student-ask/StudentAskInputCard.tsx", "utf8");
const sessionSelectorSource = readFileSync("src/app/(student)/student-ask/StudentAskSessionSelector.tsx", "utf8");
const askPageSource = readFileSync("src/app/(student)/student-ask/page.tsx", "utf8");
const dashboardPageSource = readFileSync("src/app/(student)/student-dashboard/page.tsx", "utf8");
const practicePageSource = readFileSync("src/app/(student)/student-practice/page.tsx", "utf8");

describe("student ask tablet layout", () => {
  it("uses the same broad page width as dashboard and practice on tablet and desktop", () => {
    expect(dashboardPageSource).toContain('className="space-y-6"');
    expect(practicePageSource).toContain('className="space-y-6"');
    expect(askPageSource).toContain('className="space-y-6"');
    expect(askPageSource).not.toContain("max-w-6xl mx-auto space-y-6");
    expect(askPageSource).not.toContain("max-w-3xl mx-auto space-y-6");
  });

  it("does not show an AI-enabled status panel above the asking form", () => {
    expect(askPageSource).not.toContain('t("aiActive")');
    expect(askPageSource).not.toContain("border-green-200");
  });

  it("uses a two-column tablet layout for session selection and question writing", () => {
    expect(inputCardSource).toContain("student-ask-tablet-layout");
    expect(inputCardSource).toContain("student-ask-session-panel");
    expect(inputCardSource).toContain("student-ask-question-panel");
    expect(inputCardSource).toContain("md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]");
    expect(inputCardSource).not.toContain("md:sticky");
  });

  it("keeps the question panel content-sized with a fixed button position", () => {
    // 오른쪽 질문 패널은 세션 수와 무관하게 크기·버튼 위치가 고정이다.
    // 남는 공간을 패널 안 요소가 흡수하면(flex-1/stretch/mt-auto) 어색해지는 문제가
    // 세 차례 반복됐다 — 여백은 패널 테두리 밖 페이지 배경으로만 남긴다.
    expect(inputCardSource).toContain("md:items-start");
    expect(inputCardSource).not.toContain("md:items-stretch");
    expect(inputCardSource).toContain("flex flex-col gap-4");
    expect(inputCardSource).toContain('rows={6}');
    expect(inputCardSource).toContain("min-h-[10rem] resize-none");
    expect(inputCardSource).not.toContain("flex-1");
    expect(inputCardSource).not.toContain("mt-auto");
    expect(inputCardSource).toContain("student-ask-question-helper flex flex-col");
    expect(inputCardSource).toContain('href="/student-practice"');
  });

  it("keeps session badges while visually separating selection and writing panels", () => {
    expect(inputCardSource).toContain("student-ask-session-panel min-w-0 rounded-xl border bg-muted/30 p-4");
    expect(inputCardSource).toContain("border border-indigo-200 bg-card p-4 shadow-sm");
    expect(inputCardSource).toContain("selectedSession.unitDesignId");
    expect(sessionSelectorSource).toContain("getSessionDateBadge(session.date)");
    expect(sessionSelectorSource).toContain("completedSessionBadge");
    expect(sessionSelectorSource).toContain("inquiryClassTag");
  });

  it("keeps session controls touch-friendly on tablets", () => {
    expect(sessionSelectorSource).toContain("student-ask-filter-grid");
    expect(sessionSelectorSource).toContain("student-ask-session-grid");
    expect(sessionSelectorSource).toContain("min-h-[132px]");
    // 목록 상한을 오른쪽 패널 높이 수준으로 유지 — 좌우 불균형의 원천 축소
    expect(sessionSelectorSource).toContain("max-h-[24rem]");
    expect(sessionSelectorSource).not.toContain("md:max-h-[32rem]");
    expect(sessionSelectorSource).toContain("h-11");
    expect(sessionSelectorSource).toContain("h-12");
  });
});
