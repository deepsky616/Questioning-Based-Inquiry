import { describe, expect, it } from "vitest";

import {
  normalizeAchievements,
  withAchievementGuideFallback,
} from "@/lib/student-achievement-reference";

describe("학생 참고자료 성취기준 설명", () => {
  it("번호와 내용이 모두 있는 성취기준만 공백을 정리해 반환한다", () => {
    expect(normalizeAchievements([
      { code: " [4과10-01] ", content: " 물이 세 가지 상태로 변할 수 있음을 안다. " },
      { code: "", content: "번호 없음" },
      { code: "[4과10-02]", content: "" },
      null,
    ])).toEqual([{
      code: "[4과10-01]",
      content: "물이 세 가지 상태로 변할 수 있음을 안다.",
    }]);
  });

  it("저장된 학생용 설명을 교육과정 해설보다 우선한다", () => {
    const result = withAchievementGuideFallback(
      {
        achievements: [{ index: 0, explanation: "저장된 학생 눈높이 설명" }],
        coreSentences: [],
        essentialQuestions: [],
      },
      [{ code: "[4과10-01]", content: "물이 세 가지 상태로 변할 수 있음을 안다." }],
      "3-4",
      "과학",
      "물의 상태 변화",
    );

    expect(result?.achievements).toEqual([
      { index: 0, explanation: "저장된 학생 눈높이 설명" },
    ]);
  });

  it("저장된 설명이 없으면 같은 번호의 교육과정 해설을 사용한다", () => {
    const result = withAchievementGuideFallback(
      undefined,
      [{ code: "4과10-01", content: "물이 세 가지 상태로 변할 수 있음을 안다." }],
      "3-4",
      "과학",
      "물의 상태 변화",
    );

    expect(result?.achievements).toEqual([{
      index: 0,
      explanation: "물의 상태 변화는 관찰 가능한 현상 수준에서만 다루고, 물의 상태가 변하는 까닭은 다루지 않는다.",
    }]);
  });

  it("저장 설명과 교육과정 해설이 모두 없으면 빈 설명을 만들지 않는다", () => {
    const result = withAchievementGuideFallback(
      undefined,
      [{ code: "[직접-01]", content: "교사가 직접 만든 성취기준" }],
      "3-4",
      "과학",
      "물의 상태 변화",
    );

    expect(result).toBeUndefined();
  });
});
