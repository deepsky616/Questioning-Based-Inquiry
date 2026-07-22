import { describe, expect, it } from "vitest";
import {
  CURRENT_MYSTERY_KNOWLEDGE_VERSION,
  MYSTERY_ATTRIBUTES,
  MYSTERY_FACTS,
  MYSTERY_ITEMS,
  analyzeMysteryQuestion,
  classifyMysteryQuestion,
  isMysteryGuessCorrect,
  mysteryQuestionForAttribute,
} from "@/lib/mystery-box-rules";
import { MYSTERY_PRESENTATION } from "@/app/(student)/student-question-play/games/mystery-box-presentation";

const APPLE_ITEM = MYSTERY_ITEMS.find(({ id }) => id === "apple");
const PENCIL_ITEM = MYSTERY_ITEMS.find(({ id }) => id === "pencil");
const SUNFLOWER_ITEM = MYSTERY_ITEMS.find(({ id }) => id === "sunflower");

if (!APPLE_ITEM) throw new Error("사과 시험 자료가 필요합니다");
if (!PENCIL_ITEM) throw new Error("연필 시험 자료가 필요합니다");
if (!SUNFLOWER_ITEM) throw new Error("해바라기 시험 자료가 필요합니다");

describe("미스터리 박스 질문 규칙", () => {
  it("모든 내장 물건에 결과 화면 표현 자료가 있다", () => {
    for (const item of MYSTERY_ITEMS) {
      expect(MYSTERY_PRESENTATION[item.id]).toEqual(expect.objectContaining({
        emoji: expect.any(String),
        category: {
          ko: expect.any(String),
          en: expect.any(String),
        },
      }));
    }
  });

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

  it("새 판정 자료는 모든 물건에 세분화된 사실값을 가진다", () => {
    expect(CURRENT_MYSTERY_KNOWLEDGE_VERSION).toBe(3);
    for (const item of MYSTERY_ITEMS) {
      expect(Object.keys(item.facts).sort()).toEqual([...MYSTERY_FACTS].sort());
      expect(Object.values(item.facts).every(
        (value) => typeof value === "boolean",
      )).toBe(true);
      expect(Object.keys(item.factsV3).sort()).toEqual([...MYSTERY_FACTS].sort());
      expect(Object.values(item.factsV3).every(
        (value) => typeof value === "boolean",
      )).toBe(true);
    }
  });

  it("새 판정 자료의 사실 관계가 서로 어긋나지 않는다", () => {
    for (const item of MYSTERY_ITEMS) {
      const facts = item.factsV3;
      if (facts.tree === true || facts.herbaceousPlant === true || facts.flower === true) {
        expect(facts.plant).toBe(true);
      }
      if (facts.fruit === true) {
        expect(facts.plant).toBe(false);
        expect(facts.plantDerived).toBe(true);
      }
      if (
        facts.writingTool === true ||
        facts.musicalInstrument === true ||
        facts.vehicle === true ||
        facts.readingMaterial === true
      ) {
        expect(facts.humanMade).toBe(true);
      }
      if (facts.movesByItself === true) expect(facts.living).toBe(true);
    }
  });

  it("새 판정 자료에서 모든 물건은 객관적 사실 조합으로 구분된다", () => {
    const profiles = MYSTERY_ITEMS.map((item) => JSON.stringify(
      MYSTERY_FACTS.map((fact) => item.factsV3[fact]),
    ));
    expect(new Set(profiles).size).toBe(MYSTERY_ITEMS.length);
  });

  it.each([
    ["작나요?", "yes"],
    ["크기가 작나요?", "yes"],
    ["크키가 작나요?", "yes"],
    ["큰가요?", "no"],
    ["색깔이 다양한가요?", "yes"],
    ["실내에 있나요?", "no"],
    ["단단한가요?", "no"],
    ["젖어 있나요?", "no"],
  ] as const)("놀이 기준 질문 %s은 새 놀이에서 %s로 판정한다", (question, answer) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, "ko", 3)).toBe(answer);
  });

  it("기존 버전 2 기록의 상황별 특징 판정은 그대로 유지한다", () => {
    expect(classifyMysteryQuestion("작은가요?", APPLE_ITEM, "ko", 2)).toBe("yes");
    expect(classifyMysteryQuestion("실내에 있나요?", APPLE_ITEM, "ko", 2)).toBe("no");
  });

  it.each([
    ["초본인가요?", SUNFLOWER_ITEM, "ko", "yes", "herbaceousPlant", false],
    ["글을 쓰는 도구인가요?", PENCIL_ITEM, "ko", "yes", "writingTool", false],
    ["스스로   움직이나요?", PENCIL_ITEM, "ko", "no", "movesByItself", false],
    ["필기도구가 아닌가요?", PENCIL_ITEM, "ko", "no", "writingTool", true],
    ["Is it a non-woody plant?", SUNFLOWER_ITEM, "en", "yes", "herbaceousPlant", false],
    ["Does it grow on a plant?", APPLE_ITEM, "en", "yes", "plantDerived", false],
    ["Is it not a writing tool?", PENCIL_ITEM, "en", "no", "writingTool", true],
    ["Does it move on its own?", PENCIL_ITEM, "en", "no", "movesByItself", false],
    ["베리류인가요?", MYSTERY_ITEMS.find(({ id }) => id === "strawberry")!, "ko", "yes", "berry", false],
    ["Is it imaginary?", MYSTERY_ITEMS.find(({ id }) => id === "dragon")!, "en", "yes", "imaginary", false],
  ] as const)("교실에서 쓸 법한 질문 %s을 한 가지 사실로 판정한다", (
    question,
    item,
    locale,
    answer,
    attribute,
    negated,
  ) => {
    expect(analyzeMysteryQuestion(question, item, locale, 3)).toEqual({
      answer,
      attribute,
      negated,
    });
  });

  it.each([
    ["나무인가요?", "no", "tree"],
    ["풀인가요?", "yes", "herbaceousPlant"],
    ["살아 있나요?", "yes", "living"],
    ["스스로 움직이나요?", "no", "movesByItself"],
  ] as const)("해바라기 질문 %s을 정확한 사실로 판정한다", (question, answer, attribute) => {
    expect(analyzeMysteryQuestion(question, SUNFLOWER_ITEM, "ko")).toEqual({
      answer,
      attribute,
      negated: false,
    });
  });

  it.each([
    ["필기도구인가요?", "yes", "writingTool"],
    ["스스로 움직이나요?", "no", "movesByItself"],
  ] as const)("연필 질문 %s을 정확한 사실로 판정한다", (question, answer, attribute) => {
    expect(analyzeMysteryQuestion(question, PENCIL_ITEM, "ko")).toEqual({
      answer,
      attribute,
      negated: false,
    });
  });

  it.each([
    ["살아 있지 않나요?", SUNFLOWER_ITEM, "no", "living"],
    ["스스로 움직이지 않나요?", PENCIL_ITEM, "yes", "movesByItself"],
  ] as const)("부정 질문 %s의 속성과 부정 범위를 함께 판정한다", (
    question,
    item,
    answer,
    attribute,
  ) => {
    expect(analyzeMysteryQuestion(question, item, "ko")).toEqual({
      answer,
      attribute,
      negated: true,
    });
  });

  it("열매 자체와 식물 전체를 구분한다", () => {
    expect(classifyMysteryQuestion("식물인가요?", APPLE_ITEM, "ko")).toBe("no");
    expect(classifyMysteryQuestion("열매인가요?", APPLE_ITEM, "ko")).toBe("yes");
    expect(classifyMysteryQuestion("식물에서 자라나요?", APPLE_ITEM, "ko")).toBe("yes");
  });

  it("기존 기록은 이전 판정 의미로 다시 확인할 수 있다", () => {
    expect(analyzeMysteryQuestion("나무인가요?", SUNFLOWER_ITEM, "ko", 1)).toEqual({
      answer: "yes",
      attribute: "plant",
      negated: false,
    });
    expect(analyzeMysteryQuestion("식물인가요?", APPLE_ITEM, "ko", 1)).toEqual({
      answer: "yes",
      attribute: "plant",
      negated: false,
    });
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
    ["실내화인가요?", "ko"],
    ["젖소인가요?", "ko"],
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
    ["Is it not an animal?", "en", "yes"],
    ["Isn't it a plant?", "en", "yes"],
  ] as const)("한 번 부정한 질문 %s은 값을 뒤집는다", (question, locale, expected) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, locale)).toBe(
      expected,
    );
  });

  it("판정에 사용한 한 속성과 부정 여부를 함께 돌려준다", () => {
    expect(analyzeMysteryQuestion("먹을 수 있나요?", APPLE_ITEM, "ko")).toEqual({
      answer: "yes",
      attribute: "edible",
      negated: false,
    });
    expect(analyzeMysteryQuestion("Is it not edible?", APPLE_ITEM, "en")).toEqual({
      answer: "no",
      attribute: "edible",
      negated: true,
    });
    expect(analyzeMysteryQuestion("무슨 소리가 나나요?", APPLE_ITEM, "ko")).toEqual({
      answer: "unknown",
    });
  });

  it.each(["ko", "en"] as const)(
    "%s 기본 특징 질문은 모든 물건에서 예 또는 아니오로 판정된다",
    (locale) => {
      for (const attribute of MYSTERY_FACTS) {
        const question = mysteryQuestionForAttribute(attribute, locale);
        expect(question).toMatch(/[?？]$/u);
        for (const item of MYSTERY_ITEMS) {
          const value = item.factsV3[attribute];
          expect(typeof value).toBe("boolean");
          expect(analyzeMysteryQuestion(question, item, locale)).toEqual({
            answer: value ? "yes" : "no",
            attribute,
            negated: false,
          });
        }
      }
    },
  );

  it.each([
    ["실내에 있나요?", "no"],
    ["젖어 있나요?", "no"],
  ] as const)("경계를 좁혀도 자연스러운 질문 %s을 유지한다", (question, expected) => {
    expect(classifyMysteryQuestion(question, APPLE_ITEM, "ko", 2)).toBe(
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
