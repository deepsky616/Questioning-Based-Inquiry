import { describe, expect, it } from "vitest";
import {
  MYSTERY_ATTRIBUTES,
  MYSTERY_ITEMS,
  classifyMysteryQuestion,
  isMysteryGuessCorrect,
} from "@/lib/mystery-box-rules";

const APPLE_ITEM = MYSTERY_ITEMS.find(({ id }) => id === "apple");

if (!APPLE_ITEM) throw new Error("사과 시험 자료가 필요합니다");

describe("미스터리 박스 질문 규칙", () => {
  it("내장 물건은 두 언어 이름과 별칭 및 모든 속성값을 가진다", () => {
    expect(MYSTERY_ITEMS.length).toBeGreaterThan(0);
    for (const item of MYSTERY_ITEMS) {
      expect(item.names.ko).not.toBe("");
      expect(item.names.en).not.toBe("");
      expect(Array.isArray(item.aliases.ko)).toBe(true);
      expect(Array.isArray(item.aliases.en)).toBe(true);
      expect(Object.keys(item.attributes).sort()).toEqual(
        [...MYSTERY_ATTRIBUTES].sort(),
      );
      expect(Object.values(item.attributes).every(
        (value) => typeof value === "boolean",
      )).toBe(true);
    }
  });

  it.each([
    ["먹을 수 있나요?", "ko", "yes"],
    ["날 수 있나요?", "ko", "no"],
    ["Is it edible?", "en", "yes"],
    ["Can it fly?", "en", "no"],
  ] as const)("한 속성 질문 %s을 판정한다", (question, locale, expected) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      expected,
    );
  });

  it.each([
    ["무슨 소리가 나나요?", "ko"],
    ["사다리인가요?", "ko"],
    ["꽃게인가요?", "ko"],
    ["큰일인가요?", "ko"],
    ["작은아버지인가요?", "ko"],
    ["비행기인가요?", "ko"],
    ["먹을 수 있고 작은가요?", "ko"],
    ["Does it make a sound?", "en"],
    ["Is it small and edible?", "en"],
  ] as const)("속성이 없거나 둘 이상인 질문 %s은 모름이다", (question, locale) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      "unknown",
    );
  });

  it.each([
    ["Is it edible and not red?", "en"],
    ["Is it edible with no seeds?", "en"],
    ["먹을 수 있지만 씨가 없나요?", "ko"],
    ["먹을 수 있지만 빨갛지 않나요?", "ko"],
  ] as const)("다른 절의 부정이 섞인 질문 %s은 모름이다", (question, locale) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      "unknown",
    );
  });

  it.each([
    ["Does it fly without wings?", "en"],
    ["다리는 있지만 발은 없나요?", "ko"],
  ] as const)("같은 속성의 긍정과 부정이 섞인 질문 %s은 모름이다", (question, locale) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      "unknown",
    );
  });

  it.each([
    ["먹을 수 없나요?", "ko", "no"],
    ["날 수 없나요?", "ko", "yes"],
    ["Is it not edible?", "en", "no"],
    ["Can it not fly?", "en", "yes"],
  ] as const)("한 번 부정한 질문 %s은 값을 뒤집는다", (question, locale, expected) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      expected,
    );
  });

  it.each([
    ["먹을 수 없지 않나요?", "ko"],
    ["먹을 수 없는 것은 아닌가요?", "ko"],
    ["Is it not inedible?", "en"],
    ["Isn't it not edible?", "en"],
  ] as const)("겹치거나 모호하게 부정한 질문 %s은 모름이다", (question, locale) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      "unknown",
    );
  });
});

describe("미스터리 박스 추측 규칙", () => {
  it.each([
    ["  사과  ", "ko"],
    ["풋사과", "ko"],
    ["  GREEN   APPLE  ", "en"],
    ["ＡＰＰＬＥ", "en"],
  ] as const)("이름과 별칭 %s을 정규화해 받는다", (guess, locale) => {
    expect(isMysteryGuessCorrect(guess, APPLE_ITEM, locale)).toBe(true);
  });

  it.each([
    ["", "ko"],
    ["사", "ko"],
    ["사과나무", "ko"],
    ["app", "en"],
    ["pineapple", "en"],
    ["apple", "ko"],
  ] as const)("빈 값과 부분 문자열 %s을 거절한다", (guess, locale) => {
    expect(isMysteryGuessCorrect(guess, APPLE_ITEM, locale)).toBe(false);
  });
});
