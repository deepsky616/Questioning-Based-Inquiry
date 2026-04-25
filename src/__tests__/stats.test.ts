import { describe, it, expect } from "vitest";
import {
  calcTrend,
  calcStartDate,
  aggregateByStudent,
  buildTimeline,
} from "@/lib/stats-calc";

describe("calcTrend", () => {
  it("이전 기간보다 증가하면 양수 추세를 반환한다", () => {
    expect(calcTrend(2, 4)).toBe(100);
  });

  it("이전 기간보다 감소하면 음수 추세를 반환한다", () => {
    expect(calcTrend(4, 2)).toBe(-50);
  });

  it("변화가 없으면 0을 반환한다", () => {
    expect(calcTrend(3, 3)).toBe(0);
  });

  it("이전 기간이 0이고 이후가 0이면 0을 반환한다", () => {
    expect(calcTrend(0, 0)).toBe(0);
  });

  it("이전 기간이 0이고 이후에 질문이 있으면 null을 반환한다", () => {
    // s1=0, s2>0: 측정 불가(이전 데이터 없음), null로 표현
    expect(calcTrend(0, 5)).toBeNull();
  });
});

describe("calcStartDate", () => {
  it("week 기간은 7일 전이다", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const start = calcStartDate("week", now);
    const expectedDate = new Date("2026-04-18T12:00:00Z");
    expect(start.getTime()).toBe(expectedDate.getTime());
  });

  it("month 기간은 1달 전이다", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const start = calcStartDate("month", now);
    const expectedDate = new Date("2026-03-25T12:00:00Z");
    expect(start.getTime()).toBe(expectedDate.getTime());
  });

  it("semester 기간은 6달 전이다", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const start = calcStartDate("semester", now);
    const expectedDate = new Date("2025-10-25T12:00:00Z");
    expect(start.getTime()).toBe(expectedDate.getTime());
  });

  it("알 수 없는 기간은 month(1달 전)로 기본처리한다", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const start = calcStartDate("unknown", now);
    const expectedDate = new Date("2026-03-25T12:00:00Z");
    expect(start.getTime()).toBe(expectedDate.getTime());
  });
});

describe("aggregateByStudent", () => {
  const makeQuestion = (
    authorId: string,
    name: string,
    className: string,
    closure: "closed" | "open",
    cognitive: "factual" | "interpretive" | "evaluative",
    createdAt: Date
  ) => ({ author: { id: authorId, name, className }, closure, cognitive, createdAt });

  it("학생별로 질문을 집계한다", () => {
    const questions = [
      makeQuestion("s1", "김철수", "1반", "closed", "factual", new Date("2026-04-01")),
      makeQuestion("s1", "김철수", "1반", "open", "interpretive", new Date("2026-04-02")),
      makeQuestion("s2", "이영희", "2반", "open", "evaluative", new Date("2026-04-01")),
    ];
    const result = aggregateByStudent(questions);
    expect(result).toHaveLength(2);
    const s1 = result.find((s) => s.studentId === "s1");
    expect(s1!.total).toBe(2);
    expect(s1!.distribution.closed).toBe(1);
    expect(s1!.distribution.open).toBe(1);
    expect(s1!.cognitiveDistribution.factual).toBe(1);
    expect(s1!.cognitiveDistribution.interpretive).toBe(1);
  });

  it("빈 질문 배열이면 빈 배열을 반환한다", () => {
    expect(aggregateByStudent([])).toEqual([]);
  });
});

describe("buildTimeline", () => {
  const makeQuestion = (createdAt: Date) => ({
    createdAt,
    closure: "open" as const,
    cognitive: "factual" as const,
    author: { id: "s1", name: "테스트", className: "1반" },
  });

  it("날짜별로 질문 수를 집계한다", () => {
    const questions = [
      makeQuestion(new Date("2026-04-01T10:00:00Z")),
      makeQuestion(new Date("2026-04-01T14:00:00Z")),
      makeQuestion(new Date("2026-04-02T09:00:00Z")),
    ];
    const result = buildTimeline(questions);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: "2026-04-01", count: 2 });
    expect(result[1]).toEqual({ date: "2026-04-02", count: 1 });
  });

  it("날짜순으로 정렬된다", () => {
    const questions = [
      makeQuestion(new Date("2026-04-03")),
      makeQuestion(new Date("2026-04-01")),
      makeQuestion(new Date("2026-04-02")),
    ];
    const result = buildTimeline(questions);
    expect(result[0].date).toBe("2026-04-01");
    expect(result[1].date).toBe("2026-04-02");
    expect(result[2].date).toBe("2026-04-03");
  });
});
