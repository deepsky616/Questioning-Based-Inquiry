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

const NATURAL_INFORMAL_QUESTIONS = [
  "고양이가 자니?", "개미가 걷니?", "토끼가 뛰니?", "꽃이 예쁘니?", "사과가 빨갛니?",
  "하늘이 파랗니?", "비가 오니?", "새가 날아가니?", "강아지가 짖니?", "물고기가 헤엄치니?",
  "아이가 웃니?", "나무가 흔들리니?", "별이 빛나니?", "바람이 부니?", "눈이 내리니?",
  "나비가 날개를 펴니?", "달이 밝니?", "파도가 치니?", "벌이 꿀을 모으니?", "원숭이가 나무에 오르니?",
  "햇빛이 따뜻하니?", "구름이 하얗니?", "고래가 바다에 사니?", "개구리가 우니?", "아기 새가 둥지에 있니?",
] as const;

const NATURAL_GGALKKA_QUESTIONS = [
  "고양이가 잘까?", "개미가 걸을까?", "토끼가 뛸까?", "꽃이 예쁠까?", "사과가 빨갈까?",
  "하늘이 파랄까?", "비가 올까?", "새가 날아갈까?", "강아지가 짖을까?", "물고기가 헤엄칠까?",
  "아이가 웃을까?", "나무가 흔들릴까?", "별이 빛날까?", "바람이 불까?", "눈이 내릴까?",
  "나비가 날개를 펼까?", "달이 밝을까?", "파도가 칠까?", "벌이 꿀을 모을까?", "원숭이가 나무에 오를까?",
  "햇빛이 따뜻할까?", "구름이 하얄까?", "고래가 바다에 살까?", "개구리가 울까?", "아기 새가 둥지에 있을까?",
] as const;

const POLITE_QUESTIONS = [
  "고양이가 자요?", "개미가 걸어요?", "토끼가 뛰어요?", "꽃이 예뻐요?", "사과가 빨개요?",
  "하늘이 파래요?", "비가 와요?", "새가 날아가요?", "강아지가 짖어요?", "물고기가 헤엄쳐요?",
  "아이가 웃어요?", "나무가 흔들려요?", "별이 빛나요?", "바람이 불어요?", "눈이 내려요?",
  "나비가 날개를 펴요?", "달이 밝아요?", "파도가 쳐요?", "벌이 꿀을 모아요?", "원숭이가 나무에 올라요?",
  "햇빛이 따뜻해요?", "구름이 하얘요?", "고래가 바다에 살아요?", "개구리가 울어요?", "아기 새가 둥지에 있어요?",
];

describe("까바놀이 내용 보존 판정", () => {
  it.each(KABA_SENTENCES.ko.map((sentence, index) => [sentence, POLITE_QUESTIONS[index]]))("자연스러운 해요체 질문을 인정한다: %s", (sentence, question) => {
    expect(isKabaQuestionRewrite(sentence, question, "ko")).toBe(true);
  });

  it.each([
    ["사과가 빨갛다", "사과가 빨간색인가요?"], ["사과가 빨갛다", "사과는 빨강색이에요?"],
    ["하늘이 파랗다", "하늘이 파란색인가요?"], ["하늘이 파랗다", "하늘의 색깔이 파랑색인가요?"],
    ["구름이 하얗다", "구름이 흰색인가요?"], ["구름이 하얗다", "구름은 하얀색인가요?"],
  ])("색을 같은 뜻의 말로 바꾼 질문을 인정한다: %s", (sentence, question) => {
    expect(isKabaQuestionRewrite(sentence, question, "ko")).toBe(true);
    expect(isKabaQuestionRewrite(sentence, question, "ko", 1)).toBe(false);
  });

  it.each([
    ["사과가 빨갛다", "사과가 주황색인가요?", "ko"],
    ["사과가 빨갛다", "사과가 안 빨간색인가요?", "ko"],
    ["사과가 빨갛다", "사과가 빨간색이 아닌가요?", "ko"],
    ["고양이가 잔다", "고양이가 안 자요?", "ko"],
    ["The apple is red", "Is the apple not red?", "en"],
    ["The cat sleeps", "Doesn't the cat sleep?", "en"],
  ])("색·행동·긍정의 뜻이 달라지면 인정하지 않는다: %s", (sentence, question, locale) => {
    expect(isKabaQuestionRewrite(sentence, question, locale)).toBe(false);
  });

  it.each(["ko", "en"] as const)("%s 문장 스물다섯 개의 알맞은 질문을 모두 인정한다", (locale) => {
    KABA_SENTENCES[locale].forEach((sentence, index) => {
      expect(
        isKabaQuestionRewrite(sentence, VALID_QUESTIONS[locale][index], locale),
        `${sentence} -> ${VALID_QUESTIONS[locale][index]}`,
      ).toBe(true);
    });
  });

  it("한국어 문장 스물다섯 개의 자연스러운 짧은 질문을 모두 인정한다", () => {
    KABA_SENTENCES.ko.forEach((sentence, index) => {
      expect(
        isKabaQuestionRewrite(sentence, NATURAL_INFORMAL_QUESTIONS[index], "ko"),
        `${sentence} -> ${NATURAL_INFORMAL_QUESTIONS[index]}`,
      ).toBe(true);
    });
  });

  it("한국어 문장 스물다섯 개의 자연스러운 -ㄹ까 질문을 모두 인정한다", () => {
    KABA_SENTENCES.ko.forEach((sentence, index) => {
      expect(
        isKabaQuestionRewrite(sentence, NATURAL_GGALKKA_QUESTIONS[index], "ko"),
        `${sentence} -> ${NATURAL_GGALKKA_QUESTIONS[index]}`,
      ).toBe(true);
    });
  });

  it.each([
    ["사과가 빨갛다", "사과가 빨갛냐?"],
    ["하늘이 파랗다", "하늘이 파랗냐?"],
    ["달이 밝다", "달이 밝냐?"],
    ["햇빛이 따뜻하다", "햇빛이 따뜻하냐?"],
    ["아기 새가 둥지에 있다", "아기 새가 둥지에 있냐?"],
  ])("자연스러운 짧은 물음 어미도 인정한다", (sentence, question) => {
    expect(isKabaQuestionRewrite(sentence, question, "ko")).toBe(true);
  });

  it.each([
    ["개구리가 울다", "개구리가 노나요?", "ko"],
    ["하늘이 파랗다", "하늘이 맑을까?", "ko"],
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
    ["사과가 빨갛다", "사과가 안 빨갛니?"],
    ["사과가 빨갛다", "사과가 안빨갛니?"],
    ["하늘이 파랗다", "하늘이 파랗지 않니?"],
    ["고래가 바다에 산다", "고래가 바다에 안 사니?"],
  ])("원문의 뜻을 반대로 바꾼 질문을 거절한다", (sentence, question) => {
    expect(isKabaQuestionRewrite(sentence, question, "ko")).toBe(false);
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
