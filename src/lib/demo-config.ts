import { createHash, timingSafeEqual } from "node:crypto";

export const DEMO_SCHOOL = "질문초등학교";
export const DEMO_GRADE = "4";
export const DEMO_CLASS_NAME = "1";
export const DEMO_STUDENT_NUMBER = "1";

export type DemoLaunchFailureReason =
  | "disabled"
  | "missing"
  | "invalid"
  | "expired"
  | "misconfigured";

export type DemoLaunchValidation =
  | { ok: true }
  | { ok: false; reason: DemoLaunchFailureReason };

export function isReservedDemoSchool(school: string): boolean {
  return school.trim() === DEMO_SCHOOL;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function validateDemoLaunchTicket(
  ticket: string,
  now = new Date(),
): DemoLaunchValidation {
  if (process.env.DEMO_LAUNCH_ENABLED !== "true") {
    return { ok: false, reason: "disabled" };
  }
  if (!ticket) {
    return { ok: false, reason: "missing" };
  }

  const expectedHex = process.env.DEMO_LAUNCH_TOKEN_HASH?.trim() ?? "";
  const expiresAt = new Date(process.env.DEMO_LAUNCH_EXPIRES_AT ?? "");
  if (
    !/^[a-f0-9]{64}$/i.test(expectedHex) ||
    Number.isNaN(expiresAt.getTime())
  ) {
    return { ok: false, reason: "misconfigured" };
  }
  if (now.getTime() > expiresAt.getTime()) {
    return { ok: false, reason: "expired" };
  }

  const actual = sha256(ticket);
  const expected = Buffer.from(expectedHex, "hex");
  return timingSafeEqual(actual, expected)
    ? { ok: true }
    : { ok: false, reason: "invalid" };
}
