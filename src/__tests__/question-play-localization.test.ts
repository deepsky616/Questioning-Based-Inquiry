import { describe, expect, it } from "vitest";
import koMessages from "../../messages/ko.json";
import enMessages from "../../messages/en.json";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import RoomLobby from "@/app/(student)/student-question-play/games/RoomLobby";
import { BUILT_IN_GAMES, localizeBuiltInGame, localizeQuestionGames } from "@/lib/question-games-data";
import type { GameRoom } from "@/lib/question-games-data";
import {
  getKabaSentences,
  getLocalizedText,
  getQuestionDiceTypes,
  getQuestionGameText,
  getRoomTurnGameText,
  isQuestionFormForLocale,
} from "@/lib/question-game-i18n";
import { pickFallbackLocalizedPairs } from "@/lib/memory-game-data";
import {
  getStoryDiceWordText,
  pickFallbackBilingualWords,
  STORY_DICE_FALLBACK,
  STORY_DICE_FALLBACK_EN,
} from "@/lib/story-dice-data";

const studentLanding = readFileSync("src/app/(student)/student-question-play/page.tsx", "utf8");
const studentGamePage = readFileSync("src/app/(student)/student-question-play/[gameId]/page.tsx", "utf8");
const teacherGamePage = readFileSync("src/app/(teacher)/teacher-question-play/page.tsx", "utf8");
const teacherPreviewPage = readFileSync("src/app/(teacher)/teacher-question-play/[gameId]/preview/page.tsx", "utf8");
const TestIntlProvider = NextIntlClientProvider as ComponentType<
  PropsWithChildren<{ locale: string; messages: Record<string, unknown> }>
>;

function renderLobby(locale: "ko" | "en", playerCount: number) {
  const game = BUILT_IN_GAMES[0];
  const room: GameRoom = {
    code: "1234",
    gameId: game.id,
    hostId: "user-1",
    status: "waiting",
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: index === 0 ? "user-1" : `user-${index + 1}`,
      name: `학생 ${index + 1}`,
      isHost: index === 0,
      joinedAt: index + 1,
    })),
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  };

  return renderToStaticMarkup(
    createElement(
      TestIntlProvider,
      { locale, messages: { gamePlay: (locale === "en" ? enMessages : koMessages).gamePlay } },
      createElement(RoomLobby, {
        game,
        room,
        myId: "user-1",
        actionLoading: false,
        onStart: () => {},
        onLeave: () => {},
        onRemovePlayer: async () => true,
      }),
    ),
  );
}

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

  it("shows the shared player count and duration on built-in game lists", () => {
    for (const game of BUILT_IN_GAMES) {
      expect(game.playerCount).toBe("2~8명");
      expect(localizeBuiltInGame(game, "en").playerCount).toBe("2-8 players");
    }

    expect(BUILT_IN_GAMES.find((game) => game.id === "memory")?.duration).toBe("약 5~20분");
    expect(BUILT_IN_GAMES.find((game) => game.id === "ladder")?.duration).toBe("약 10~15분");
    expect(BUILT_IN_GAMES.find((game) => game.id === "mystery-box")?.duration).toBe("약 8~15분");
  });

  it("놀이 패널에서는 기본 제공 표시를 반복하지 않고 직접 만든 놀이만 구분한다", () => {
    expect(studentLanding).not.toContain('{t("builtIn")}');
    expect(teacherGamePage).not.toContain('{t("builtIn")}');
    expect(teacherGamePage).toContain('{t("custom")}');
  });

  it("미스터리 상자 안내는 놀이 방식과 참여 인원에 따른 활동 기준을 두 언어로 알린다", () => {
    const mystery = BUILT_IN_GAMES.find((game) => game.id === "mystery-box")!;
    const englishMystery = localizeBuiltInGame(mystery, "en");

    expect(mystery.description).toContain("질문과 추측");
    expect(mystery.instructions.join(" ")).toContain("12~24회");
    expect(mystery.instructions.join(" ")).not.toContain("20개의 질문");
    expect(englishMystery.description).toContain("questions and guesses");
    expect(englishMystery.instructions.join(" ")).toContain("12-24");
    expect(englishMystery.instructions.join(" ")).not.toContain("20 questions");
  });

  it("친구 방의 동적 라운드 수를 사다리와 릴레이 안내에 그대로 표시한다", () => {
    expect(getQuestionGameText("ko").ladderSetupTitle(2))
      .toBe("2라운드에 쓸 질문 주제");
    expect(getQuestionGameText("en").ladderDoneDescription(2))
      .toContain("2 rounds");
    expect(getRoomTurnGameText("ko").relaySubtitle(2))
      .toBe("한 주제에서 질문을 2라운드 이어가요.");
    expect(getRoomTurnGameText("en").relaySubtitle(3))
      .toContain("3 rounds");
  });

  it("requires one friend before the host can start a room", () => {
    const koreanLobby = renderLobby("ko", 1);
    const englishLobby = renderLobby("en", 1);

    expect(koreanLobby).toContain('disabled=""');
    expect(koreanLobby).toContain("친구가 한 명 이상 더 참가해야 시작할 수 있어요");
    expect(englishLobby).toContain('disabled=""');
    expect(englishLobby).toContain("At least one friend must join before starting.");
    expect(renderLobby("ko", 2)).not.toContain('disabled=""');
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

  it("keeps the sixteenth fallback protagonist translation aligned", () => {
    expect(STORY_DICE_FALLBACK.protagonist[15]).toBe("도깨비");
    expect(STORY_DICE_FALLBACK_EN.protagonist[15]).toBe("dokkaebi");
  });
});
