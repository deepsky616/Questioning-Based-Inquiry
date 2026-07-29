import { describe, expect, it } from "vitest";
import { getQuestionInputQualityIssue } from "@/lib/question-game-question-quality";

describe("질문놀이 질문 성의 판정", () => {
  it.each([
    "그냥요?",
    "몰라요?",
    "잘 모르겠어요?",
    "아무거나요?",
    "왜요?",
    "뭐요?",
    "질문이요?",
    "ㅇㅇ?",
    "ㅋㅋㅋ?",
  ])("내용이 없는 한국어 질문을 다시 쓰게 한다: %s", (question) => {
    expect(getQuestionInputQualityIssue(question, "ko")).toBe(
      "주제에 맞는 궁금한 내용을 넣어 질문을 한 문장으로 써 주세요",
    );
  });

  it.each([
    "하늘은 왜 파란가요?",
    "비가 오나요?",
    "누가 교실에 왔나요?",
    "이 생각은 어떻게 달라질까요?",
  ])("뜻이 있는 짧은 한국어 질문은 허용한다: %s", (question) => {
    expect(getQuestionInputQualityIssue(question, "ko")).toBeNull();
  });

  it.each(["idk?", "whatever?", "why?", "what?", "no idea?"])(
    "내용이 없는 영어 질문을 다시 쓰게 한다: %s",
    (question) => {
      expect(getQuestionInputQualityIssue(question, "en")).toBe(
        "Write one specific question about the topic.",
      );
    },
  );

  it.each([
    "Why is the sky blue?",
    "Does it rain?",
    "What happens next?",
  ])("뜻이 있는 짧은 영어 질문은 허용한다: %s", (question) => {
    expect(getQuestionInputQualityIssue(question, "en")).toBeNull();
  });
});
