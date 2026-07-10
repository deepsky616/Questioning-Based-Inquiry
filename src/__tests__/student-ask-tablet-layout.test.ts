import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const inputCardSource = readFileSync("src/app/(student)/student-ask/StudentAskInputCard.tsx", "utf8");
const sessionSelectorSource = readFileSync("src/app/(student)/student-ask/StudentAskSessionSelector.tsx", "utf8");

describe("student ask tablet layout", () => {
  it("uses a two-column tablet layout for session selection and question writing", () => {
    expect(inputCardSource).toContain("student-ask-tablet-layout");
    expect(inputCardSource).toContain("student-ask-question-panel");
    expect(inputCardSource).toContain("md:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]");
    expect(inputCardSource).toContain("md:items-start");
    expect(inputCardSource).toContain("h-fit");
    expect(inputCardSource).toContain("md:min-h-[16rem]");
    expect(inputCardSource).not.toContain("md:sticky");
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
