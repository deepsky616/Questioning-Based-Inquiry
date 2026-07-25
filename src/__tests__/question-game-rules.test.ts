import { describe, expect, it } from "vitest";
import {
  BUILT_IN_QUESTION_GAME_IDS,
  QUESTION_GAME_RULES,
  applyQuestionGameRuleText,
  isBuiltInQuestionGameId,
} from "@/lib/question-game-rules";
import * as questionGameRules from "@/lib/question-game-rules";

function roomTarget(
  gameId: string,
  playerCount: number,
  difficulty?: "easy" | "normal" | "hard",
) {
  const targetBuilder = Reflect.get(
    questionGameRules,
    "getQuestionGameRoomTarget",
  );
  expect(targetBuilder).toBeTypeOf("function");
  return targetBuilder(gameId, playerCount, difficulty) as {
    maxRounds?: number;
    maxAttempts?: number;
  };
}

describe("질문놀이 공통 규칙", () => {
  it("일곱 내장 놀이의 친구 인원과 시간을 한곳에서 제공한다", () => {
    expect(BUILT_IN_QUESTION_GAME_IDS).toHaveLength(7);
    for (const id of BUILT_IN_QUESTION_GAME_IDS) {
      expect(QUESTION_GAME_RULES[id].multiplayer).toEqual({ min: 2, max: 8 });
      expect(applyQuestionGameRuleText(id, "ko").playerCount).toBe("2~8명");
      expect(applyQuestionGameRuleText(id, "en").playerCount).toBe("2-8 players");
    }
    expect(QUESTION_GAME_RULES.memory.duration.ko).toBe("약 5~20분");
    expect(QUESTION_GAME_RULES.dice.duration.ko).toBe("약 5~20분");
    expect(QUESTION_GAME_RULES.ladder.duration.ko).toBe("약 10~20분");
    expect(QUESTION_GAME_RULES.relay.duration.ko).toBe("약 5~20분");
    expect(QUESTION_GAME_RULES["mystery-box"].duration.ko).toBe("약 8~25분");
    expect(QUESTION_GAME_RULES["story-dice"].targets.solo).toEqual({
      kind: "completed-pairs", count: 3, perQuestioner: false,
    });
    expect(QUESTION_GAME_RULES.kaba.targets.room).toEqual({
      kind: "attempts-per-player", count: 3, minimumTotal: 6,
    });
    expect(QUESTION_GAME_RULES.kaba.targets.solo).toEqual({ kind: "attempts", count: 10 });
    expect(QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom).toBe(24);
    expect(isBuiltInQuestionGameId("unknown")).toBe(false);
  });

  it("참여 인원에 맞춰 친구 놀이의 질문과 활동 횟수를 정한다", () => {
    expect(roomTarget("mystery-box", 2)).toEqual({ maxRounds: 12 });
    expect(roomTarget("mystery-box", 5)).toEqual({ maxRounds: 18 });
    expect(roomTarget("mystery-box", 8)).toEqual({ maxRounds: 24 });

    for (const gameId of ["dice", "ladder", "relay", "kaba"]) {
      expect(roomTarget(gameId, 2)).toEqual({ maxRounds: 3 });
      expect(roomTarget(gameId, 3)).toEqual({ maxRounds: 3 });
      expect(roomTarget(gameId, 4)).toEqual({ maxRounds: 2 });
      expect(roomTarget(gameId, 8)).toEqual({ maxRounds: 2 });
    }

    expect(roomTarget("story-dice", 2)).toEqual({ maxRounds: 3 });
    expect(roomTarget("story-dice", 3)).toEqual({ maxRounds: 3 });
    expect(roomTarget("story-dice", 4)).toEqual({ maxRounds: 2 });
    expect(roomTarget("story-dice", 8)).toEqual({ maxRounds: 2 });
  });

  it("카드 짝 찾기는 난이도 기본값과 인원별 최소 차례를 함께 지킨다", () => {
    expect(roomTarget("memory", 2, "easy")).toEqual({ maxAttempts: 18 });
    expect(roomTarget("memory", 8, "easy")).toEqual({ maxAttempts: 24 });
    expect(roomTarget("memory", 8, "normal")).toEqual({ maxAttempts: 32 });
    expect(roomTarget("memory", 8, "hard")).toEqual({ maxAttempts: 45 });
  });
});
