import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync("src/app/(student)/layout.tsx", "utf8");

describe("student navigation order", () => {
  it("places practice before asking so students can rehearse before writing a class question", () => {
    const practiceIndex = layoutSource.indexOf('{ href: "/student-practice", key: "practice" }');
    const askIndex = layoutSource.indexOf('{ href: "/student-ask", key: "ask" }');
    const exploreIndex = layoutSource.indexOf('{ href: "/student-questions", key: "explore" }');

    expect(practiceIndex).toBeGreaterThan(-1);
    expect(askIndex).toBeGreaterThan(-1);
    expect(exploreIndex).toBeGreaterThan(-1);
    expect(practiceIndex).toBeLessThan(askIndex);
    expect(askIndex).toBeLessThan(exploreIndex);
  });
});
