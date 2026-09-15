import { describe, expect, it } from "vitest";
import { isQuestionFormForLocale } from "@/lib/question-game-i18n";

describe("질문놀이 공통 질문 형식", () => {
  it.each([
    ["하늘은 왜 파랄까", "ko"], ["색깔은 어떻게 바뀌죠", "ko"],
    ["색깔이 주황색인가요".normalize("NFD"), "ko"],
    ["Has the rabbit found the book", "en"], ["Have they arrived", "en"],
    ["Had the rain stopped", "en"], ["Shall we help the rabbit", "en"],
  ])("물음표가 생략되어도 물음 표현을 인식한다: %s", (question, locale) => {
    expect(isQuestionFormForLocale(question, locale)).toBe(true);
  });
  it.each([["오늘 하늘이 파랗다", "ko"], ["The rabbit found a book", "en"], ["", "ko"]])("평서문과 빈 입력은 질문으로 바꾸지 않는다: %s", (question, locale) => {
    expect(isQuestionFormForLocale(question, locale)).toBe(false);
  });
  it("기존 기록의 물음 형식은 이전 기준으로 확인할 수 있다", () => {
    expect(isQuestionFormForLocale("하늘은 왜 파랄까", "ko", 1)).toBe(false);
    expect(isQuestionFormForLocale("Have they arrived", "en", 1)).toBe(false);
  });
});
