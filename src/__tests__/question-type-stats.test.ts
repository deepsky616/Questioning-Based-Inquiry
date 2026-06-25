import { describe, it, expect } from "vitest";
import { summarizeQuestionTypes } from "@/lib/stats-calc";

describe("summarizeQuestionTypes", () => {
  it("닫힌/열린, 사실/개념/논쟁 개수를 집계한다", () => {
    const r = summarizeQuestionTypes([
      { closure: "closed", cognitive: "factual" },
      { closure: "open", cognitive: "conceptual" },
      { closure: "open", cognitive: "controversial" },
      { closure: "open", cognitive: "conceptual" },
    ]);
    expect(r.total).toBe(4);
    expect(r.closure).toEqual({ closed: 1, open: 3 });
    expect(r.cognitive).toEqual({ factual: 1, conceptual: 2, controversial: 1 });
  });

  it("빈 목록은 0으로 집계한다", () => {
    const r = summarizeQuestionTypes([]);
    expect(r.total).toBe(0);
    expect(r.closure).toEqual({ closed: 0, open: 0 });
    expect(r.cognitive).toEqual({ factual: 0, conceptual: 0, controversial: 0 });
  });

  it("알 수 없는 값은 무시한다(개수에 안 들어감)", () => {
    const r = summarizeQuestionTypes([
      { closure: "closed", cognitive: "factual" },
      { closure: "unknown", cognitive: "weird" },
    ]);
    expect(r.total).toBe(2);
    expect(r.closure).toEqual({ closed: 1, open: 0 });
    expect(r.cognitive).toEqual({ factual: 1, conceptual: 0, controversial: 0 });
  });
});
