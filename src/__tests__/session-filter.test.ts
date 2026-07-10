import { describe, it, expect } from "vitest";
import { getSessionFilterOptions, filterSessions } from "@/lib/sessions";

const sessions = [
  { date: "2026-06-01", subject: "과학", topic: "광합성" },
  { date: "2026-06-01", subject: "과학", topic: "에너지" },
  { date: "2026-06-02", subject: "사회", topic: "" },
  { date: "2026-06-03", subject: "과학", topic: "광합성" },
];

describe("getSessionFilterOptions", () => {
  it("날짜는 최신순, 교과/주제는 가나다순으로 고유값을 반환한다", () => {
    const opts = getSessionFilterOptions(sessions);
    expect(opts.dates).toEqual(["2026-06-03", "2026-06-02", "2026-06-01"]);
    expect(opts.subjects).toEqual(["과학", "사회"]);
    expect(opts.topics).toEqual(["광합성", "에너지"]);
  });

  it("빈 주제는 옵션에서 제외한다", () => {
    const opts = getSessionFilterOptions(sessions);
    expect(opts.topics).not.toContain("");
  });
});

describe("filterSessions", () => {
  it("빈 필터는 전체를 반환한다", () => {
    expect(filterSessions(sessions, {})).toHaveLength(4);
  });

  it("날짜로 거른다", () => {
    const r = filterSessions(sessions, { date: "2026-06-01" });
    expect(r).toHaveLength(2);
  });

  it("교과+주제로 함께 거른다", () => {
    const r = filterSessions(sessions, { subject: "과학", topic: "광합성" });
    expect(r).toHaveLength(2);
    expect(r.every((s) => s.subject === "과학" && s.topic === "광합성")).toBe(true);
  });

  it("조건에 맞는 세션이 없으면 빈 배열", () => {
    expect(filterSessions(sessions, { subject: "사회", topic: "광합성" })).toHaveLength(0);
  });
});
