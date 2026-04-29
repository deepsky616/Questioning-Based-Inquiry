import { describe, it, expect } from "vitest";
import { buildSessionLabel, isSessionAvailable, sortSessionsDesc } from "@/lib/sessions";

describe("buildSessionLabel", () => {
  it("날짜·교과·주제를 합쳐 레이블을 반환한다", () => {
    expect(buildSessionLabel("2026-04-25", "과학", "지구의 역사")).toBe(
      "2026년 4월 25일 · 과학 · 지구의 역사"
    );
  });

  it("주제가 없으면 날짜·교과만 표시한다", () => {
    expect(buildSessionLabel("2026-04-25", "수학", "")).toBe("2026년 4월 25일 · 수학");
  });

  it("주제 앞뒤 공백은 무시한다", () => {
    expect(buildSessionLabel("2026-04-25", "국어", "  ")).toBe("2026년 4월 25일 · 국어");
  });
});

describe("isSessionAvailable", () => {
  it("오늘 날짜 세션은 사용 가능하다", () => {
    expect(isSessionAvailable("2026-04-25", new Date("2026-04-25T00:00:00"))).toBe(true);
  });

  it("미래 세션은 사용 가능하다", () => {
    expect(isSessionAvailable("2026-04-30", new Date("2026-04-25T00:00:00"))).toBe(true);
  });

  it("지난 세션은 사용 불가하다", () => {
    expect(isSessionAvailable("2026-04-24", new Date("2026-04-25T00:00:00"))).toBe(false);
  });
});

describe("sortSessionsDesc", () => {
  it("날짜 내림차순으로 정렬한다", () => {
    const sessions = [
      { id: "a", date: "2026-04-20", subject: "과학", topic: "" },
      { id: "b", date: "2026-04-25", subject: "수학", topic: "" },
      { id: "c", date: "2026-04-22", subject: "국어", topic: "" },
    ];
    const sorted = sortSessionsDesc(sessions);
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});
