import { expect, it } from "vitest";
import { demoReportReferenceDate } from "@/lib/demo-report-period";
it("시연 기간은 더미 계정이 선택한 경우에만 마지막 실제 기록으로 이동한다", () => {
  const rows = [{ createdAt: "2026-07-21T01:00:00Z" }, { createdAt: "2026-08-08T01:00:00Z" }];
  const now = new Date("2026-09-08T01:00:00Z");
  expect(demoReportReferenceDate(false, "latest", rows, now)).toBeUndefined();
  expect(demoReportReferenceDate(true, "current", rows, now)).toBeUndefined();
  expect(demoReportReferenceDate(true, "latest", rows, now)?.toISOString()).toBe("2026-08-08T01:00:00.000Z");
  expect(demoReportReferenceDate(true, "latest", [...rows, { createdAt: "잘못된 날짜" }, { createdAt: "2030-01-01" }], now)?.toISOString()).toBe("2026-08-08T01:00:00.000Z");
  expect(demoReportReferenceDate(true, "latest", [], now)).toBeUndefined();
});
