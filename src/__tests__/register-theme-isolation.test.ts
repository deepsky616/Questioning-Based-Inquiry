import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const registerPage = readFileSync("src/app/(auth)/register/page.tsx", "utf8");
const globalStyles = readFileSync("src/app/globals.css", "utf8");

describe("register theme isolation", () => {
  it("keeps student and teacher signup inside a theme-independent auth surface", () => {
    expect(registerPage).toContain("auth-register-surface");
    expect(registerPage).not.toContain('classList.add("dark")');
    expect(registerPage).not.toContain('classList.remove("dark")');
  });

  it("resets auth surface tokens and dark-mode input overrides to light signup colors", () => {
    expect(globalStyles).toContain(".auth-register-surface");
    expect(globalStyles).toContain("--background: 0 0% 100%");
    expect(globalStyles).toContain("color-scheme: light");
    expect(globalStyles).toContain(".dark .auth-register-surface input:not([type=\"checkbox\"]):not([type=\"radio\"])");
    expect(globalStyles).toContain(".dark .auth-register-surface .bg-indigo-100");
  });
});
