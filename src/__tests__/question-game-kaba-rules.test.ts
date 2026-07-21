import { describe, expect, it } from "vitest";
import { KABA_SENTENCES } from "@/lib/question-game-i18n";
import { isKabaQuestionRewrite } from "@/lib/question-game-kaba-rules";

const VALID_QUESTIONS = {
  ko: [
    "고양이가 자나요?", "개미가 걷나요?", "토끼가 뛰나요?", "꽃이 예쁜가요?", "사과가 빨간가요?",
    "하늘이 파란가요?", "비가 오나요?", "새가 날아가나요?", "강아지가 짖나요?", "물고기가 헤엄치나요?",
    "아이가 웃나요?", "나무가 흔들리나요?", "별이 빛나나요?", "바람이 부나요?", "눈이 내리나요?",
    "나비가 날개를 펴나요?", "달이 밝은가요?", "파도가 치나요?", "벌이 꿀을 모으나요?", "원숭이가 나무에 오르나요?",
    "햇빛이 따뜻한가요?", "구름이 하얀가요?", "고래가 바다에 사나요?", "개구리가 우나요?", "아기 새가 둥지에 있나요?",
  ],
  en: [
    "Does the cat sleep?", "Does the ant walk?", "Does the rabbit jump?", "Is the flower pretty?", "Is the apple red?",
    "Is the sky blue?", "Does it rain?", "Does the bird fly away?", "Does the dog bark?", "Does the fish swim?",
    "Does the child smile?", "Does the tree shake?", "Does the star shine?", "Does the wind blow?", "Does snow fall?",
    "Does the butterfly open its wings?", "Is the moon bright?", "Does the wave crash?", "Does the bee collect nectar?", "Does the monkey climb a tree?",
    "Is the sunlight warm?", "Are the clouds white?", "Does the whale live in the ocean?", "Does the frog croak?", "Is the baby bird in the nest?",
  ],
} as const;

describe("까바놀이 내용 보존 판정", () => {
  it.each(["ko", "en"] as const)("%s 문장 스물다섯 개의 알맞은 질문을 모두 인정한다", (locale) => {
    KABA_SENTENCES[locale].forEach((sentence, index) => {
      expect(
        isKabaQuestionRewrite(sentence, VALID_QUESTIONS[locale][index], locale),
        `${sentence} -> ${VALID_QUESTIONS[locale][index]}`,
      ).toBe(true);
    });
  });

  it.each([
    ["개구리가 울다", "개구리가 노나요?", "ko"],
    ["벌이 꿀을 모은다", "벌이 모으나요?", "ko"],
    ["달이 밝다", "달팽이가 밝은가요?", "ko"],
    ["눈이 내린다", "눈사람이 내리나요?", "ko"],
    ["벌이 꿀을 모은다", "처벌이 꿀을 모으나요?", "ko"],
    ["The frog croaks", "Does the frog jump?", "en"],
    ["The bee collects nectar", "Does the bee collect water?", "en"],
    ["It rains", "Is the rain cold?", "en"],
    ["The baby bird is in the nest", "Does the baby bird leave the nest?", "en"],
  ])("핵심 행동이나 대상이 바뀐 질문을 거절한다", (sentence, question, locale) => {
    expect(isKabaQuestionRewrite(sentence, question, locale)).toBe(false);
  });

  it.each([
    ["사과가 빨갛다", "사과가 빨갛습니까?"],
    ["하늘이 파랗다", "하늘이 파랗습니까?"],
    ["구름이 하얗다", "구름이 하얗습니까?"],
  ])("자연스러운 격식형 질문도 인정한다", (sentence, question) => {
    expect(isKabaQuestionRewrite(sentence, question, "ko")).toBe(true);
  });

  it("질문 꼴이 아니거나 등록되지 않은 원문은 거절한다", () => {
    expect(isKabaQuestionRewrite("개구리가 울다", "개구리가 운다", "ko")).toBe(false);
    expect(isKabaQuestionRewrite("등록되지 않은 문장", "문장인가요?", "ko")).toBe(false);
  });
});
