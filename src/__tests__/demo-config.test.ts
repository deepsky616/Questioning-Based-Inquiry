import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_CLASS_NAME,
  DEMO_GRADE,
  DEMO_SCHOOL,
  DEMO_STUDENT_NUMBER,
  isReservedDemoSchool,
  validateDemoLaunchTicket,
} from "@/lib/demo-config";

const ticket = "usb-demo-ticket-for-tests";
const ticketHash = createHash("sha256").update(ticket).digest("hex");
const beforeExpiry = new Date("2026-12-31T14:59:58.000Z");
const afterExpiry = new Date("2026-12-31T15:00:00.000Z");

function enableDemo() {
  vi.stubEnv("DEMO_LAUNCH_ENABLED", "true");
  vi.stubEnv("DEMO_LAUNCH_TOKEN_HASH", ticketHash);
  vi.stubEnv("DEMO_LAUNCH_EXPIRES_AT", "2026-12-31T14:59:59.000Z");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("시연 실행 설정", () => {
  it("시연 학급 식별값을 한 곳에서 제공한다", () => {
    expect({
      school: DEMO_SCHOOL,
      grade: DEMO_GRADE,
      className: DEMO_CLASS_NAME,
      studentNumber: DEMO_STUDENT_NUMBER,
    }).toEqual({
      school: "질문초등학교",
      grade: "4",
      className: "1",
      studentNumber: "1",
    });
    expect(isReservedDemoSchool(" 질문초등학교 ")).toBe(true);
    expect(isReservedDemoSchool("다른초등학교")).toBe(false);
  });

  it("비활성화된 시연 실행은 거절한다", () => {
    vi.stubEnv("DEMO_LAUNCH_ENABLED", "false");

    expect(validateDemoLaunchTicket(ticket, beforeExpiry)).toEqual({
      ok: false,
      reason: "disabled",
    });
  });

  it("실행 표 누락과 불일치를 구분한다", () => {
    enableDemo();

    expect(validateDemoLaunchTicket("", beforeExpiry)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(validateDemoLaunchTicket("wrong", beforeExpiry)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("만료 전 실행 표만 허용한다", () => {
    enableDemo();

    expect(validateDemoLaunchTicket(ticket, beforeExpiry)).toEqual({ ok: true });
    expect(validateDemoLaunchTicket(ticket, afterExpiry)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("서버 해시 설정이 잘못되면 실행을 거절한다", () => {
    enableDemo();
    vi.stubEnv("DEMO_LAUNCH_TOKEN_HASH", "short");

    expect(validateDemoLaunchTicket(ticket, beforeExpiry)).toEqual({
      ok: false,
      reason: "misconfigured",
    });
  });
});
