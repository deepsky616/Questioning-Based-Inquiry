import { describe, expect, it } from "vitest";
import { formatDateOnly, formatDateTime, formatMonthOnly, formatShortDateTime } from "@/lib/datetime";

describe("date display formatting", () => {
  it("날짜는 하이픈 기반 ISO 형식으로 표시한다", () => {
    const date = new Date(2026, 6, 14, 9, 5);

    expect(formatDateOnly(date)).toBe("2026-07-14");
    expect(formatMonthOnly(date)).toBe("2026-07");
    expect(formatDateTime(date)).toBe("2026-07-14 09:05");
    expect(formatShortDateTime(date)).toBe("07-14 09:05");
  });
});
