import { describe, expect, it } from "vitest";
import {
  getCurriculumAchievementDetail,
} from "@/lib/curriculum-achievement-details";
import { pickAchievementExplanations } from "@/lib/achievement-selection";

describe("curriculum-achievement-details", () => {
  it("MD에서 파싱한 성취기준 본문만 반환하고 해설 전용 코드는 성취기준으로 섞지 않는다", () => {
    const detail = getCurriculumAchievementDetail("3-4", "수학", "변화와 관계");

    expect(detail?.achievements.map((achievement) => achievement.code)).toEqual([
      "[4수02-01]",
      "[4수02-02]",
      "[4수02-03]",
    ]);
    expect(detail?.explanations["[4수02-02]"]).toContain("계산식의 배열");
  });

  it("수학 성취기준은 MD의 세부 단원 heading으로 더 세분화한다", () => {
    const detail = getCurriculumAchievementDetail("3-4", "수학", "도형과 측정");

    expect(detail?.achievements.length).toBe(25);
    expect(detail?.achievementGroups?.map((group) => group.name)).toContain("도형의 기초");
    expect(detail?.achievementGroups?.map((group) => group.name)).toContain("각도");
    expect(detail?.achievementGroups?.find((group) => group.name === "들이")?.achievements).toHaveLength(3);
  });

  it("선택한 성취기준 코드에 해당하는 해설만 추린다", () => {
    expect(
      pickAchievementExplanations(
        {
          "[4수02-02]": "규칙 해설",
          "[4수02-03]": "등호 해설",
        },
        ["[4수02-03]"]
      )
    ).toEqual({ "[4수02-03]": "등호 해설" });
  });
});
