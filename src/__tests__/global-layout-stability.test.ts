import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const globalsCss = readFileSync("src/app/globals.css", "utf8");

describe("global layout stability", () => {
  it("reserves scrollbar gutter so centered navigation does not shift between pages", () => {
    expect(globalsCss).toContain("scrollbar-gutter: stable");
  });
});
