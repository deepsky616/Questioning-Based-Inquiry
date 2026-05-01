import { describe, expect, it } from "vitest";
import {
  filterAchievementsByUnitCodes,
  getSelectedAchievementsForAnalysis,
  selectAllAchievementCodes,
  toggleAchievementCode,
} from "@/lib/achievement-selection";

const ACHIEVEMENTS = [
  { code: "[4과01-01]", content: "운동을 설명한다" },
  { code: "[4과01-02]", content: "힘을 비교한다" },
  { code: "[4과02-01]", content: "물질을 분류한다" },
];

describe("achievement-selection", () => {
  it("선택한 단원 코드에 해당하는 성취기준만 필터링한다", () => {
    expect(filterAchievementsByUnitCodes(ACHIEVEMENTS, ["01"])).toEqual([
      ACHIEVEMENTS[0],
      ACHIEVEMENTS[1],
    ]);
  });

  it("단원 코드가 선택되지 않으면 전체 성취기준을 유지한다", () => {
    expect(filterAchievementsByUnitCodes(ACHIEVEMENTS, [])).toEqual(ACHIEVEMENTS);
  });

  it("단원 그룹이 있는 교과에서 단원을 모두 해제하면 성취기준을 표시하지 않는다", () => {
    expect(filterAchievementsByUnitCodes(ACHIEVEMENTS, [], true)).toEqual([]);
  });

  it("전체 선택은 현재 표시된 성취기준 코드만 반환한다", () => {
    const visible = filterAchievementsByUnitCodes(ACHIEVEMENTS, ["02"]);
    expect(selectAllAchievementCodes(visible)).toEqual(["[4과02-01]"]);
  });

  it("성취기준 코드를 토글해서 선택과 해제를 처리한다", () => {
    expect(toggleAchievementCode(["[4과01-01]"], "[4과02-01]")).toEqual([
      "[4과01-01]",
      "[4과02-01]",
    ]);
    expect(toggleAchievementCode(["[4과01-01]", "[4과02-01]"], "[4과01-01]")).toEqual([
      "[4과02-01]",
    ]);
  });

  it("핵심어 추천 분석에는 교사가 선택한 성취기준만 전달한다", () => {
    expect(getSelectedAchievementsForAnalysis(ACHIEVEMENTS, ["[4과01-02]"])).toEqual([
      ACHIEVEMENTS[1],
    ]);
  });
});
