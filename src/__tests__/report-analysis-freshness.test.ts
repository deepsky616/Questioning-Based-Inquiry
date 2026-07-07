import { describe, expect, it } from "vitest";
import { getAnalysisFreshness } from "@/lib/report-analysis-freshness";

describe("getAnalysisFreshness", () => {
  it("분석 이후 추가된 활동 수를 계산한다", () => {
    const freshness = getAnalysisFreshness(
      { currentQuestions: 5, currentComments: 4, currentLikes: 8 },
      { totalQuestions: 3, totalComments: 4, totalLikes: 6 },
    );

    expect(freshness).toEqual({
      hasCurrentCounts: true,
      hasNewActivity: true,
      newQuestions: 2,
      newComments: 0,
      newLikes: 2,
    });
  });

  it("현재 활동이 분석 당시보다 적으면 새 활동으로 보지 않는다", () => {
    const freshness = getAnalysisFreshness(
      { currentQuestions: 2, currentComments: 1, currentLikes: 0 },
      { totalQuestions: 3, totalComments: 2, totalLikes: 1 },
    );

    expect(freshness.hasNewActivity).toBe(false);
    expect(freshness.newQuestions).toBe(0);
    expect(freshness.newComments).toBe(0);
    expect(freshness.newLikes).toBe(0);
  });
});
