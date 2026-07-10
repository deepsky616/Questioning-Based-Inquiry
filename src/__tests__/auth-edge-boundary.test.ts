import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const middleware = readFileSync("src/middleware.ts", "utf8");
const edgeAuth = readFileSync("src/lib/auth-edge.ts", "utf8");
const sharedAuth = readFileSync("src/lib/auth-shared.ts", "utf8");

describe("auth edge boundary", () => {
  it("keeps middleware away from server-only credential dependencies", () => {
    expect(middleware).toContain('from "@/lib/auth-edge"');
    expect(middleware).not.toContain('from "@/lib/auth"');

    const edgeBundleSource = `${edgeAuth}\n${sharedAuth}`;
    expect(edgeBundleSource).not.toContain("bcrypt");
    expect(edgeBundleSource).not.toContain("@/lib/db");
    expect(edgeBundleSource).not.toContain("Credentials");
  });
});
