import { describe, it, expect } from "vitest";
import { getSessionFilterOptions, filterSessions, type SessionFilter } from "@/lib/sessions";

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

describe("날짜·교과·주제 상호 연동", () => {
  const classes = [
    { date: "2026-06-01", subject: "과학", topic: "날씨" },
    { date: "2026-06-01", subject: "사회", topic: "우리 지역" },
    { date: "2026-06-02", subject: "과학", topic: "물질" },
    { date: "2026-06-03", subject: "사회", topic: "우리 지역" },
    { date: "2026-06-03", subject: "과학", topic: "날씨" },
  ];

  it.each([
    [{ date: "2026-06-02" }, { subjects: ["과학"], topics: ["물질"] }],
    [{ subject: "과학" }, { dates: ["2026-06-03", "2026-06-02", "2026-06-01"], topics: ["날씨", "물질"] }],
    [{ topic: "우리 지역" }, { dates: ["2026-06-03", "2026-06-01"], subjects: ["사회"] }],
    [{ date: "2026-06-01", topic: "날씨" }, { subjects: ["과학"] }],
    [{ subject: "과학", topic: "날씨" }, { dates: ["2026-06-03", "2026-06-01"] }],
    [{ date: "2026-06-01", subject: "과학" }, { topics: ["날씨"] }],
  ] satisfies Array<[SessionFilter, Record<string, string[]>]>)(
    "%j 조건에 실제로 맞는 선택 항목만 제공한다", (filter, expected) => {
      expect(getSessionFilterOptions(classes, filter)).toMatchObject(expected);
    },
  );

  it("자기 조건을 제외해 다른 값으로 바꿀 수 있고 전체로 해제하면 범위가 넓어진다", () => {
    const selected = getSessionFilterOptions(classes, { date: "2026-06-01", subject: "과학", topic: "날씨" });
    expect(selected.dates).toEqual(["2026-06-03", "2026-06-01"]);
    expect(getSessionFilterOptions(classes, { date: "", subject: "과학", topic: "" }).topics).toEqual(["날씨", "물질"]);
    expect(getSessionFilterOptions(classes, { date: "", subject: "", topic: "" })).toEqual(getSessionFilterOptions(classes));
  });

  it("빈 목록이나 맞지 않는 조건도 오류 없이 처리한다", () => {
    expect(getSessionFilterOptions([], { topic: "날씨" })).toEqual({ dates: [], subjects: [], topics: [] });
    expect(getSessionFilterOptions(classes, { date: "2026-06-02", topic: "우리 지역" }).subjects).toEqual([]);
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
