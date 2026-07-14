import { describe, expect, it } from "vitest";
import {
  BUILT_IN_QUESTION_GAME_IDS,
  QUESTION_GAME_RULES,
  applyQuestionGameRuleText,
  isBuiltInQuestionGameId,
} from "@/lib/question-game-rules";

describe("질문놀이 공통 규칙", () => {
  it("일곱 내장 놀이의 친구 인원과 시간을 한곳에서 제공한다", () => {
    expect(BUILT_IN_QUESTION_GAME_IDS).toHaveLength(7);
    for (const id of BUILT_IN_QUESTION_GAME_IDS) {
      expect(QUESTION_GAME_RULES[id].multiplayer).toEqual({ min: 2, max: 8 });
      expect(applyQuestionGameRuleText(id, "ko").playerCount).toBe("2~8명");
      expect(applyQuestionGameRuleText(id, "en").playerCount).toBe("2-8 players");
    }
    expect(QUESTION_GAME_RULES.memory.duration.ko).toBe("약 5~20분");
    expect(QUESTION_GAME_RULES.ladder.duration.ko).toBe("약 10~15분");
    expect(QUESTION_GAME_RULES["mystery-box"].duration.ko).toBe("약 8~15분");
    expect(QUESTION_GAME_RULES["story-dice"].targets.solo).toEqual({
      kind: "completed-pairs", count: 3, perQuestioner: false,
    });
    expect(QUESTION_GAME_RULES.kaba.targets.room).toEqual({
      kind: "attempts-per-player", count: 3, minimumTotal: 6,
    });
    expect(QUESTION_GAME_RULES.kaba.targets.solo).toEqual({ kind: "attempts", count: 10 });
    expect(QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom).toBe(20);
    expect(isBuiltInQuestionGameId("unknown")).toBe(false);
  });
});
