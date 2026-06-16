import { describe, it, expect } from "vitest";
import { buildBuckets, buildActivityReport } from "@/lib/report-stats";

const NOW = new Date("2026-06-15T12:00:00"); // 월요일 기준 계산용 고정 시점

describe("buildBuckets", () => {
  it("월별 버킷은 최근 count개월을 과거→현재 순으로 만든다", () => {
    const b = buildBuckets("month", 3, NOW);
    expect(b.map((x) => x.key)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(b.map((x) => x.label)).toEqual(["4월", "5월", "6월"]);
  });

  it("주별 버킷은 count개를 만들고 마지막 버킷이 현재를 포함한다", () => {
    const b = buildBuckets("week", 4, NOW);
    expect(b).toHaveLength(4);
    const last = b[b.length - 1];
    expect(NOW.getTime() >= last.start && NOW.getTime() < last.end).toBe(true);
  });
});

describe("buildActivityReport", () => {
  it("총합·분류·시계열을 집계한다", () => {
    const report = buildActivityReport(
      {
        questions: [
          { createdAt: "2026-06-10", closure: "open", cognitive: "conceptual" },
          { createdAt: "2026-05-02", closure: "closed", cognitive: "factual" },
        ],
        likesGiven: [{ createdAt: "2026-06-11" }, { createdAt: "2026-06-12" }],
        comments: [{ createdAt: "2026-06-09" }],
        likesReceived: [{ createdAt: "2026-06-10" }],
        commentsReceived: [],
      },
      { now: NOW, months: 3, weeks: 4 },
    );

    expect(report.totals).toEqual({
      questions: 2, likesGiven: 2, comments: 1, likesReceived: 1, commentsReceived: 0,
    });
    expect(report.classification.closure).toEqual({ closed: 1, open: 1 });
    expect(report.classification.cognitive).toEqual({ factual: 1, conceptual: 1, controversial: 0 });

    // 월별: 6월 질문 1개, 5월 질문 1개
    const jun = report.monthly.find((p) => p.key === "2026-06");
    const may = report.monthly.find((p) => p.key === "2026-05");
    expect(jun?.questions).toBe(1);
    expect(jun?.likesGiven).toBe(2);
    expect(may?.questions).toBe(1);

    // 시계열 합이 총합과 일치(범위 내)
    const totalQinMonthly = report.monthly.reduce((s, p) => s + p.questions, 0);
    expect(totalQinMonthly).toBe(2);
  });
});
