import { describe, it, expect } from "vitest";
import { getWordEmoji, STORY_DICE_EMOJI_POOL, parseAIWords } from "@/lib/story-dice-data";

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

  it("AI가 준 이모지를 최우선으로 사용한다", () => {
    expect(getWordEmoji("드래곤", "protagonist", { "드래곤": "🐲" })).toBe("🐲");
    // 매핑된 단어라도 AI 이모지가 우선
    expect(getWordEmoji("요정", "protagonist", { "요정": "🧝" })).toBe("🧝");
  });

  it("매칭 안 되는 단어는 카테고리 이모지 풀에서 선택되고, 같은 단어는 항상 같은 이모지다", () => {
    const e = getWordEmoji("드래곤", "protagonist");
    expect(STORY_DICE_EMOJI_POOL.protagonist).toContain(e);
    expect(getWordEmoji("드래곤", "protagonist")).toBe(e); // deterministic
  });

  it("서로 다른 미매칭 단어 묶음에서 이모지가 한 종류로 몰리지 않는다", () => {
    const words = ["드래곤", "좀비", "천사", "마녀", "거미", "늑대인간", "골렘", "스핑크스"];
    const emojis = new Set(words.map((w) => getWordEmoji(w, "protagonist")));
    // 8개 단어가 최소 4종류 이상의 이모지로 분산되어야 한다(과거엔 전부 동일했음)
    expect(emojis.size).toBeGreaterThanOrEqual(4);
  });
});

describe("parseAIWords (emojis)", () => {
  it("AI 응답의 emojis 맵을 파싱한다", () => {
    const text = JSON.stringify({
      protagonist: ["드래곤", "좀비", "천사", "마녀", "거미", "늑대", "골렘", "유니콘"],
      place: ["성", "동굴", "하늘", "바다", "사막", "숲", "도시", "달"],
      event: ["폭발", "지진", "마법", "발견", "추적", "변신", "수수께끼", "보물"],
      emojis: { "드래곤": "🐲", "폭발": "💥" },
    });
    const parsed = parseAIWords(text);
    expect(parsed?.emojis?.["드래곤"]).toBe("🐲");
    expect(parsed?.emojis?.["폭발"]).toBe("💥");
  });

  it("emojis가 없어도 단어는 정상 파싱된다", () => {
    const text = JSON.stringify({
      protagonist: ["로봇", "탐정", "마법사", "외계인", "공룡", "기사", "유령", "닌자"],
      place: ["학교", "숲", "바다", "우주", "사막", "정글", "북극", "동굴"],
      event: ["열쇠", "편지", "버튼", "보물상자", "비밀지도", "타임머신", "마법책", "거울"],
    });
    const parsed = parseAIWords(text);
    expect(parsed?.protagonist).toHaveLength(8);
    expect(parsed?.emojis).toBeUndefined();
  });
});
