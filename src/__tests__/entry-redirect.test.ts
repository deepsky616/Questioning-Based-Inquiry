import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const { secret } = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  Object.assign(globalThis, { AsyncLocalStorage });
  const secret = "entry-redirect-test-secret-at-least-32-characters";
  vi.stubEnv("AUTH_SECRET", secret);
  vi.stubEnv("AUTH_TRUST_HOST", "true");
  vi.stubEnv("AUTH_URL", "http://localhost:3000");
  return { secret };
});
afterAll(() => vi.unstubAllEnvs());

// Exercise the actual JWT wrapper; importing server credentials is a regression.
vi.mock("@/lib/auth", () => { throw new Error("Entry must not load server auth"); });
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

import Home from "@/app/page";
import proxy, { config } from "@/proxy";
import { encode } from "next-auth/jwt";

const cookieName = "authjs.session-token";

async function request(path: string, role?: string, invalidCookie = false) {
  const token = invalidCookie ? "invalid-jwt" : role ? await encode({
    secret, salt: cookieName, token: { id: "test-user", role },
  }) : undefined;
  const req = new NextRequest(`http://localhost:3000${path}`, {
    headers: token ? { cookie: `${cookieName}=${token}` } : {},
  });
  return proxy(req, { waitUntil: vi.fn() } as never);
}

describe("entry redirects with JWT sessions", () => {
  it.each([
    [undefined, "/login"],
    ["TEACHER", "/teacher-dashboard"],
    ["STUDENT", "/student-dashboard"],
    ["UNKNOWN", "/login"],
  ])("redirects root for %s before rendering", async (role, destination) => {
    const response = await request("/?from=entry", role);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(`http://localhost:3000${destination}`);
  });

  it("treats an invalid JWT as signed out", async () => {
    const response = await request("/", undefined, true);
    expect(response?.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it.each([
    ["/teacher-dashboard", undefined, "/login"],
    ["/student-dashboard", undefined, "/login"],
    ["/teacher-dashboard", "STUDENT", "/student-dashboard"],
    ["/student-dashboard", "TEACHER", "/teacher-dashboard"],
  ])("preserves role protection for %s (%s)", async (path, role, destination) => {
    const response = await request(path!, role);
    expect(response?.headers.get("location")).toBe(`http://localhost:3000${destination}`);
  });

  it.each([
    ["/teacher-dashboard", "TEACHER"], ["/student-dashboard", "STUDENT"],
    ["/login", undefined], ["/login", "TEACHER"],
    ["/register", undefined], ["/forgot-password", undefined],
    ["/reset-password?token=test", undefined], ["/demo/launch", undefined],
    ["/api/auth/session", undefined],
  ])("continues permitted requests to %s (%s)", async (path, role) => {
    const response = await request(path!, role);
    expect(response?.headers.get("location")).toBeNull();
    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });

  it("matches the root in the framework proxy configuration", () => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/_next/static/chunk.js" })).toBe(false);
  });

  it("keeps the page fallback synchronous and independent of authentication", () => {
    expect(() => Home()).toThrow("redirect:/login");
    expect(readFileSync("src/app/page.tsx", "utf8")).not.toMatch(/from ["']@\/lib\/auth/);
  });
});
