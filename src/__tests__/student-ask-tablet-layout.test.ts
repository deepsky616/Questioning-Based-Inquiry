import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const inputCardSource = readFileSync("src/app/(student)/student-ask/StudentAskInputCard.tsx", "utf8");
const sessionSelectorSource = readFileSync("src/app/(student)/student-ask/StudentAskSessionSelector.tsx", "utf8");
const askPageSource = readFileSync("src/app/(student)/student-ask/page.tsx", "utf8");

describe("student ask tablet layout", () => {
  it("uses the same broad page width as practice on tablet and desktop", () => {
    expect(askPageSource).toContain("max-w-6xl mx-auto space-y-6");
    expect(askPageSource).not.toContain("max-w-3xl mx-auto space-y-6");
  });

  it("uses a two-column tablet layout for session selection and question writing", () => {
    expect(inputCardSource).toContain("student-ask-tablet-layout");
    expect(inputCardSource).toContain("student-ask-question-panel");
    expect(inputCardSource).toContain("md:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]");
    expect(inputCardSource).toContain("md:min-h-[16rem]");
    expect(inputCardSource).not.toContain("md:sticky");
  });

  it("stretches the question panel to match the session list height (no bottom gap)", () => {
    // 오른쪽 패널이 h-fit이면 왼쪽 세션 목록보다 짧아져 아래 여백이 생긴다.
    // 컬럼을 stretch하고 입력창(flex-1)이 남는 공간을 흡수하게 유지한다.
    expect(inputCardSource).toContain("md:items-stretch");
    expect(inputCardSource).not.toContain("h-fit");
    expect(inputCardSource).toContain("flex flex-col gap-4");
    expect(inputCardSource).toContain("flex flex-1 flex-col");
    expect(inputCardSource).toContain("min-h-[12rem] flex-1");
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
