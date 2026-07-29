import { describe, expect, it } from "vitest";
import { evaluateStoryDiceAnswerQuality } from "@/lib/question-game-story-answer-quality";

describe("이야기 주사위 대답 관련성 판정", () => {
  it.each([
    "그냥",
    "그냥요.",
    "몰라",
    "몰라요",
    "모름",
    "잘 모르겠어요.",
    "아무거나",
    "글쎄요",
    "ㅇㅇ",
  ])("내용 없이 넘기는 단독 표현 %s를 다시 쓰게 한다", (answer) => {
    expect(evaluateStoryDiceAnswerQuality(
      "하늘에서 비가 내려 기분이 어떤가요?",
      answer,
      "ko",
    )).toMatchObject({
      decision: "retry",
    });
  });

  it("회피 표현이 섞인 완성된 문장은 바로 막지 않고 관련성을 확인한다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "비가 온 이유는 무엇인가요?",
      "정확한 이유는 잘 모르겠지만 구름이 많아졌기 때문인 것 같아요.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "reason",
    });
  });

  it("기분을 묻는 질문에는 짧아도 감정을 나타낸 대답을 인정한다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "하늘에서 비가 내려 기분이 어떤가요?",
      "슬퍼요.",
      "ko",
    )).toMatchObject({
      decision: "accept",
      intent: "feeling",
    });
  });

  it("기분을 묻는데 감정이 없는 대답은 관련성 확인 대상으로 남긴다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "하늘에서 비가 내려 기분이 어떤가요?",
      "피자가 맛있어요.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "feeling",
    });
  });

  it("이유를 묻는 질문은 까닭 표현이 있어도 문맥 확인 대상으로 남긴다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "토끼는 왜 책을 찾았나요?",
      "친구와 함께 읽으려고 찾았어요.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "reason",
    });
  });

  it("까닭 표현만 갖춘 관련 없는 대답도 문맥 확인 대상으로 남긴다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "토끼는 왜 책을 찾았나요?",
      "피자가 맛있어서요.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "reason",
    });
  });

  it("예 또는 아니오만 적으면 이야기를 잇기 위한 관련성 확인 대상으로 남긴다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "토끼가 우산을 썼나요?",
      "네.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "yes-no",
    });
  });

  it("문장처럼 길어도 내용을 회피한 대답은 관련성 확인 대상으로 남긴다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "토끼는 숲에서 무엇을 찾았나요?",
      "그냥 아무 말이나 적었어요.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "other",
    });
  });

  it("특정 유형이 아니어도 내용이 있는 대답은 그대로 인정한다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "토끼는 무엇을 찾았나요?",
      "책을 찾았어요.",
      "ko",
    )).toMatchObject({
      decision: "accept",
      intent: "other",
    });
  });

  it("질문의 주인공만 반복하고 핵심 동작에 답하지 않으면 문맥을 확인한다", () => {
    expect(evaluateStoryDiceAnswerQuality(
      "토끼는 무엇을 찾았나요?",
      "토끼는 피자가 맛있다고 말했어요.",
      "ko",
    )).toMatchObject({
      decision: "review",
      intent: "other",
    });
  });

  it.each([
    ["토끼는 어디에서 책을 찾았나요?", "피자가 맛있어요.", "place"],
    ["토끼는 언제 책을 찾았나요?", "피자가 맛있어요.", "time"],
    ["누가 토끼를 도와주었나요?", "피자가 맛있어요.", "person"],
    ["토끼는 책을 찾았나요?", "피자가 맛있어요.", "yes-no"],
    ["토끼는 무엇을 찾았나요?", "피자가 맛있어요.", "other"],
  ] as const)(
    "%s 질문과 관련 없는 완성 문장은 서버 확인 대상으로 둔다",
    (question, answer, intent) => {
      expect(evaluateStoryDiceAnswerQuality(question, answer, "ko")).toMatchObject({
        decision: "review",
        intent,
      });
    },
  );
});
