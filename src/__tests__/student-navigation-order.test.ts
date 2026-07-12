import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync("src/app/(student)/layout.tsx", "utf8");

describe("student navigation order", () => {
  it("places practice immediately before asking in the student learning flow", () => {
    const practiceIndex = layoutSource.indexOf('{ href: "/student-practice", key: "practice" }');
    const askIndex = layoutSource.indexOf('{ href: "/student-ask", key: "ask" }');
    const exploreIndex = layoutSource.indexOf('{ href: "/student-questions", key: "explore" }');
    const playIndex = layoutSource.indexOf('{ href: "/student-question-play", key: "questionPlay" }');

    expect(practiceIndex).toBeGreaterThan(-1);
    expect(askIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeGreaterThan(-1);
    expect(playIndex).toBeGreaterThan(-1);
    expect(practiceIndex).toBeLessThan(askIndex);
    expect(askIndex).toBeLessThan(exploreIndex);
    expect(exploreIndex).toBeLessThan(playIndex);
  });
});
