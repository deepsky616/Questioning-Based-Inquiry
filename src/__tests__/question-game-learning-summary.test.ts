import { describe, expect, it } from "vitest";
import {
  buildQuestionGameLearningSummary,
  sumQuestionGameModes,
  type QuestionGameModeStats,
} from "@/lib/question-game-learning-summary";

describe("질문놀이 학습 결과", () => {
  it("질문이 없는 짝 찾기 활동도 완료 경험을 학습 결과로 안내한다", () => {
    expect(buildQuestionGameLearningSummary([], 4)).toEqual({
      validQuestionCount: 0,
      strength: "completed",
      nextStep: "explainConnection",
    });
  });

  it("질문 형태와 생각을 넓히는 표현을 나누어 다음 연습을 정한다", () => {
    expect(buildQuestionGameLearningSummary([
      "별은 어디에서 빛날까?",
      "이 문장은 질문이 아님",
    ], 2)).toEqual({
      validQuestionCount: 1,
      strength: "startedQuestions",
      nextStep: "clarifyQuestionForm",
    });

    expect(buildQuestionGameLearningSummary([
      "왜 밤에는 별이 더 잘 보일까?",
      "어떻게 별빛이 우리에게 올까?",
    ], 2)).toEqual({
      validQuestionCount: 2,
      strength: "variedQuestions",
      nextStep: "changePerspective",
    });
  });

  it("학생별 놀이 방식 기록을 교사 비교값으로 더한다", () => {
    const first: Record<"solo" | "ai" | "friend", QuestionGameModeStats> = {
      solo: { plays: 2, completions: 2, points: 12, goodQuestions: 4 },
      ai: { plays: 1, completions: 1, points: 8, goodQuestions: 2 },
      friend: { plays: 3, completions: 2, points: 16, goodQuestions: 5 },
    };
    const second: typeof first = {
      solo: { plays: 1, completions: 1, points: 5, goodQuestions: 1 },
      ai: { plays: 0, completions: 0, points: 0, goodQuestions: 0 },
      friend: { plays: 1, completions: 1, points: 7, goodQuestions: 2 },
    };

    expect(sumQuestionGameModes([{ modes: first }, { modes: second }])).toEqual({
      solo: { plays: 3, completions: 3, points: 17, goodQuestions: 5 },
      ai: { plays: 1, completions: 1, points: 8, goodQuestions: 2 },
      friend: { plays: 4, completions: 3, points: 23, goodQuestions: 7 },
    });
  });
});
