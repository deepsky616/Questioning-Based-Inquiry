import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pointReviewView = readFileSync("src/components/teacher/PointReviewView.tsx", "utf8");

describe("point review bulk actions", () => {
  it("keeps warning and recommended bulk decisions scoped to each panel", () => {
    expect(pointReviewView).toContain("displayedDuplicateIds");
    expect(pointReviewView).toContain("selectedDuplicateIds");
    expect(pointReviewView).toContain("toggleAllDuplicates");
    expect(pointReviewView).toContain('decide("APPROVE", selectedDuplicateIds)');
    expect(pointReviewView).toContain('decide("REJECT", selectedDuplicateIds)');

    expect(pointReviewView).toContain("displayedNormalIds");
    expect(pointReviewView).toContain("selectedNormalIds");
    expect(pointReviewView).toContain("toggleAllNormal");
    expect(pointReviewView).toContain('decide("APPROVE", selectedNormalIds)');
    expect(pointReviewView).toContain('decide("REJECT", selectedNormalIds)');
  });

  it("supports bounded multi-session AI analysis with monthly selection", () => {
    expect(pointReviewView).toContain("MAX_ANALYZE_SESSIONS = 5");
    expect(pointReviewView).toContain("selectedAnalysisSessionIds");
    expect(pointReviewView).toContain("toggleMonthSessions");
    expect(pointReviewView).toContain('t("selectTooMany"');
    expect(pointReviewView).toContain('t("selectedForAnalysis"');
    expect(pointReviewView).toContain('t("analyzeDoneMulti"');
    expect(pointReviewView).toContain('body: JSON.stringify({ sessionId })');
  });

  it("filters point review results only by sessions with pending approvals", () => {
    expect(pointReviewView).toContain("pendingSessionIds");
    expect(pointReviewView).toContain("pendingSessions");
    expect(pointReviewView).toContain("reviewDateMonthGroups");
    expect(pointReviewView).toContain("reviewSessionMonthGroups");
    expect(pointReviewView).toContain("reviewSelectedSessionId");
    expect(pointReviewView).toContain('t("resultFilterTitle"');
    expect(pointReviewView).toContain('t("resultFilterHint"');
  });
});
