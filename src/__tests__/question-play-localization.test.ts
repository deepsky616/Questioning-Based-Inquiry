import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUILT_IN_GAMES, localizeBuiltInGame, localizeQuestionGames } from "@/lib/question-games-data";
import {
  getKabaSentences,
  getLocalizedText,
  getQuestionDiceTypes,
  getQuestionGameText,
  isQuestionFormForLocale,
} from "@/lib/question-game-i18n";
import { pickFallbackLocalizedPairs } from "@/lib/memory-game-data";
import { getStoryDiceWordText, pickFallbackBilingualWords } from "@/lib/story-dice-data";

const studentLanding = readFileSync("src/app/(student)/student-question-play/page.tsx", "utf8");
const studentGamePage = readFileSync("src/app/(student)/student-question-play/[gameId]/page.tsx", "utf8");
const teacherGamePage = readFileSync("src/app/(teacher)/teacher-question-play/page.tsx", "utf8");
const teacherPreviewPage = readFileSync("src/app/(teacher)/teacher-question-play/[gameId]/preview/page.tsx", "utf8");

describe("question play localization", () => {
  it("localizes built-in question games while preserving custom game text", () => {
    const memory = BUILT_IN_GAMES.find((game) => game.id === "memory");

    expect(memory).toBeDefined();
    expect(localizeBuiltInGame(memory!, "en").title).toBe("Q&A Matching");
    expect(localizeBuiltInGame(memory!, "en").description).not.toBe(memory!.description);

    const custom = {
      id: "custom-1",
      title: "교사 입력 제목",
      description: "교사 입력 설명",
      emoji: "🎮",
      gradientCss: "",
      accentColor: "#000000",
      playerCount: "",
      duration: "",
      instructions: [],
      isBuiltIn: false as const,
      teacherId: "teacher-1",
      order: 99,
    };
    expect(localizeQuestionGames([custom], "en")[0].title).toBe("교사 입력 제목");
  });

  it("uses localized game text on list, management, and preview surfaces", () => {
    expect(studentLanding).toContain("localizeQuestionGames");
    expect(teacherGamePage).toContain("localizeQuestionGames");
    expect(studentGamePage).toContain("localizeBuiltInGame");
    expect(teacherPreviewPage).toContain("localizeBuiltInGame");
  });

  it("does not force question game pages to change the current theme", () => {
    for (const source of [studentGamePage, teacherPreviewPage]) {
      expect(source).not.toContain('classList.remove("dark")');
      expect(source).not.toContain('classList.add("dark")');
    }
  });

  it("localizes in-game activity defaults for English play", () => {
    expect(getQuestionGameText("en").questionCard).toContain("Question cards");
    expect(getQuestionDiceTypes("en")[0].type).toBe("factual question");
    expect(getKabaSentences("en")[0]).toBe("The cat sleeps");
    expect(isQuestionFormForLocale("Why does the cat sleep", "en")).toBe(true);
    expect(isQuestionFormForLocale("The cat sleeps", "en")).toBe(false);
  });

  it("keeps shared room content bilingual while preserving one game state", () => {
    const pair = pickFallbackLocalizedPairs(1)[0];
    expect(pair.question).toBe(pair.questionText?.ko);
    expect(getLocalizedText(pair.questionText, "en", pair.question)).toBe(pair.questionText?.en);

    const words = pickFallbackBilingualWords(1);
    const wordKey = words.protagonist[0];
    expect(getStoryDiceWordText(words, wordKey, "ko")).toBe(wordKey);
    expect(getStoryDiceWordText(words, wordKey, "en")).toBe(words.wordText?.[wordKey].en);
  });
});
