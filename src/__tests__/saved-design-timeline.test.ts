import { describe, expect, it } from "vitest";
import { getSavedDesignTimeline } from "@/lib/saved-design-timeline";

describe("getSavedDesignTimeline", () => {
  it("미배포 설계는 최근 저장 시각 하나를 대표로 보여준다", () => {
    const timeline = getSavedDesignTimeline({
      createdAt: "2026-07-07T01:00:00.000Z",
      updatedAt: "2026-07-07T02:00:00.000Z",
      lastDeployedAt: null,
    });

    expect(timeline.primary).toEqual({ kind: "saved", at: "2026-07-07T02:00:00.000Z" });
  });

  it("배포 후 수정이 없으면 마지막 배포 시각을 대표로 보여준다", () => {
    const timeline = getSavedDesignTimeline({
      createdAt: "2026-07-07T01:00:00.000Z",
      updatedAt: "2026-07-07T02:00:00.000Z",
      lastDeployedAt: "2026-07-07T03:00:00.000Z",
    });

    expect(timeline.primary).toEqual({ kind: "deployed", at: "2026-07-07T03:00:00.000Z" });
  });

  it("배포 후 수정된 설계는 마지막 수정 시각을 대표로 보여준다", () => {
    const timeline = getSavedDesignTimeline({
      createdAt: "2026-07-07T01:00:00.000Z",
      lastDeployedAt: "2026-07-07T03:00:00.000Z",
      updatedAt: "2026-07-07T04:00:00.000Z",
    });

    expect(timeline.primary).toEqual({ kind: "updated", at: "2026-07-07T04:00:00.000Z" });
  });
});
