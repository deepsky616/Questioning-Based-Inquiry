import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ko from "../../messages/ko.json";
import { pointBonusLabel, shouldShowPointReason } from "@/lib/points-policy";

describe("질문놀이 인정 질문과 활동 용어", () => {
  it("교사와 학생 화면에서 점수 집계의 뜻을 쉬운 한국어로 안내한다", () => {
    expect(ko.gamePlay.goodQuestions).toBe("인정 질문·활동");
    expect(ko.gamePlay.recognizedActivityHelp).toBe(
      "놀이 규칙에 맞게 작성하거나 완료하여 점수에 반영된 질문과 활동이에요.",
    );
    expect(ko.gamePlay.weeklyActivitySummary).toContain("인정 질문·활동");
    expect(ko.gamePlay.goodquestionsGoodQuestionsPointsPts).toContain("인정 질문·활동");

    expect(ko.qPlay.statLine).toContain("인정 질문·활동");
    expect(ko.qPlay.chipGood).toContain("인정 질문·활동");
    expect(ko.qPlay.colGood).toBe("인정 질문·활동");
  });

  it("질문놀이 포인트 이력도 활동 인정이라는 뜻으로 표시한다", () => {
    expect(ko.pointLabel.act_VALID_QUESTIONS).toBe("질문놀이 활동 인정");
    expect(pointBonusLabel("VALID_QUESTIONS").label).toBe("질문놀이 활동 인정");
    expect(shouldShowPointReason(
      "유효 질문 3개",
      "질문놀이 활동 인정",
      "VALID_QUESTIONS",
    )).toBe(false);
    expect(shouldShowPointReason(
      "좋은 질문",
      "질문놀이 활동 인정",
      "VALID_QUESTIONS",
    )).toBe(false);
    expect(ko.gamePlay.yourValidQuestionsMysterystudentquestion).toBe(
      "점수로 인정된 내 질문 {mysteryStudentQuestionCount}개",
    );
  });

  it("영어 화면에서도 같은 뜻을 전달한다", () => {
    expect(en.gamePlay.goodQuestions).toBe("Recognized questions and activities");
    expect(en.gamePlay.recognizedActivityHelp).toContain("counted toward points");
    expect(en.qPlay.colGood).toBe("Recognized questions and activities");
    expect(en.pointLabel.act_VALID_QUESTIONS).toBe("Question-game activity recognized");
    expect(en.gamePlay.yourValidQuestionsMysterystudentquestion).toBe(
      "My questions counted toward points: {mysteryStudentQuestionCount}",
    );
  });
});
