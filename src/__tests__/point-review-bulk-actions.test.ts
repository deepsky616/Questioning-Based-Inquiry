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
});
