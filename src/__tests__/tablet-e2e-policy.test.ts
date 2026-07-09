import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const playwrightConfig = readFileSync("playwright.config.ts", "utf8");

describe("tablet e2e policy", () => {
  it("runs critical browser checks against a tablet viewport as a first-class project", () => {
    expect(playwrightConfig).toContain('name: "tablet"');
    expect(playwrightConfig).toContain("iPad Pro");
  });
});
