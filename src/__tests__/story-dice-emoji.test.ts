import { describe, it, expect } from "vitest";
import { getWordEmoji, STORY_DICE_EMOJI } from "@/lib/story-dice-data";

describe("getWordEmoji", () => {
  it("폴백 풀의 단어는 정확히 매칭되는 이모지를 반환한다", () => {
    expect(getWordEmoji("요정", "protagonist")).toBe("🧚");
    expect(getWordEmoji("바다", "place")).toBe("🌊");
    expect(getWordEmoji("열쇠", "event")).toBe("🔑");
  });

  it("수식어가 붙은 단어도 부분 매칭으로 이모지를 찾는다", () => {
    expect(getWordEmoji("작은 요정", "protagonist")).toBe("🧚");
    expect(getWordEmoji("깊은 바다", "place")).toBe("🌊");
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(getWordEmoji("  요정  ", "protagonist")).toBe("🧚");
  });

  it("매칭되는 단어가 없으면 카테고리 기본 이모지로 폴백한다", () => {
    expect(getWordEmoji("드래곤", "protagonist")).toBe(STORY_DICE_EMOJI.protagonist);
    expect(getWordEmoji("랜덤단어", "event")).toBe(STORY_DICE_EMOJI.event);
  });
});
