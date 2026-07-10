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

  it("keeps the textarea at a comfortable fixed size and fills leftover space with the helper", () => {
    // 질문은 최대 200자 — 입력창이 남는 공간을 전부 흡수하면 어색하게 거대해진다.
    // 입력창은 6줄 고정, 남는 세로 공간은 '좋은 질문 도우미'가 흡수해 여백도 막는다.
    expect(inputCardSource).toContain("md:items-stretch");
    expect(inputCardSource).not.toContain("h-fit");
    expect(inputCardSource).toContain("flex flex-col gap-4");
    expect(inputCardSource).toContain('rows={6}');
    expect(inputCardSource).toContain("min-h-[10rem] resize-none");
    expect(inputCardSource).not.toContain("min-h-[10rem] resize-none text-base leading-7 flex-1");
    expect(inputCardSource).toContain("student-ask-question-helper flex min-h-0 flex-1");
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
    expect(sessionSelectorSource).toContain("md:max-h-[32rem]");
    expect(sessionSelectorSource).toContain("h-11");
    expect(sessionSelectorSource).toContain("h-12");
  });
});
