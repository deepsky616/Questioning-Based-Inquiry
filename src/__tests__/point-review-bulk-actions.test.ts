import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 로직은 usePointReview, 세션 선택 카드는 AnalysisSessionPicker,
// 조립은 PointReviewView로 분리되어 있다(2026-07-12).
const pointReviewView = readFileSync("src/components/teacher/PointReviewView.tsx", "utf8");
const usePointReview = readFileSync("src/components/teacher/point-review/usePointReview.ts", "utf8");
const analysisPicker = readFileSync("src/components/teacher/point-review/AnalysisSessionPicker.tsx", "utf8");
const reviewTypes = readFileSync("src/components/teacher/point-review/types.ts", "utf8");

describe("point review bulk actions", () => {
  it("keeps warning and recommended bulk decisions scoped to each panel", () => {
    expect(usePointReview).toContain("displayedDuplicateIds");
    expect(usePointReview).toContain("selectedDuplicateIds");
    expect(usePointReview).toContain("toggleAllDuplicates");
    expect(pointReviewView).toContain('decide("APPROVE", selectedDuplicateIds)');
    expect(pointReviewView).toContain('decide("REJECT", selectedDuplicateIds)');

    expect(usePointReview).toContain("displayedNormalIds");
    expect(usePointReview).toContain("selectedNormalIds");
    expect(usePointReview).toContain("toggleAllNormal");
    expect(pointReviewView).toContain('decide("APPROVE", selectedNormalIds)');
    expect(pointReviewView).toContain('decide("REJECT", selectedNormalIds)');
  });

  it("supports bounded multi-session AI analysis with monthly selection", () => {
    expect(reviewTypes).toContain("MAX_ANALYZE_SESSIONS = 5");
    expect(usePointReview).toContain("selectedAnalysisSessionIds");
    expect(usePointReview).toContain("toggleMonthSessions");
    expect(usePointReview).toContain('t("selectTooMany"');
    expect(analysisPicker).toContain('t("selectedForAnalysis"');
    expect(usePointReview).toContain('t("analyzeDoneMulti"');
    expect(usePointReview).toContain('body: JSON.stringify({ sessionId })');
  });

  it("filters point review results only by sessions with pending approvals", () => {
    expect(usePointReview).toContain("pendingSessionIds");
    expect(usePointReview).toContain("pendingSessions");
    expect(usePointReview).toContain("reviewDateMonthGroups");
    expect(usePointReview).toContain("reviewSessionMonthGroups");
    expect(usePointReview).toContain("reviewSelectedSessionId");
    expect(pointReviewView).toContain('t("resultFilterTitle"');
    expect(pointReviewView).toContain('t("resultFilterHint"');
  });
});
