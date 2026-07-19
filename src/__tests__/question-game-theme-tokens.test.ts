import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_GAMES,
  GRADIENT_PRESETS,
} from "@/lib/question-games-data";
import { QUESTION_DICE_TYPES } from "@/lib/question-game-i18n";
import { STORY_DICE_COLOR } from "@/lib/story-dice-data";

const gameDirectory = resolve(
  process.cwd(),
  "src/app/(student)/student-question-play/games",
);

function readGameSource(fileName: string) {
  return readFileSync(resolve(gameDirectory, fileName), "utf8");
}

function openingTagNear(source: string, tagName: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);

  const start = source.lastIndexOf(`<${tagName}`, markerIndex);
  const end = source.indexOf(">", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 1);
}

function staticClassListContaining(
  source: string,
  tagName: string,
  requiredClass: string,
) {
  const openingTagPattern = new RegExp(
    `<${tagName}\\b[^>]*className="([^"]*)"[^>]*>`,
    "g",
  );

  for (const match of source.matchAll(openingTagPattern)) {
    const classes = match[1].split(/\s+/);
    if (classes.includes(requiredClass)) return classes;
  }

  return [];
}

function hexRelativeLuminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function whiteContrastRatio(hex: string) {
  return 1.05 / (hexRelativeLuminance(hex) + 0.05);
}

function hexColors(value: string) {
  return value.match(/#[0-9a-f]{6}/gi) ?? [];
}

function expectWhiteTextContrast(colors: readonly string[]) {
  expect(colors.length).toBeGreaterThan(0);
  for (const color of colors) {
    expect(whiteContrastRatio(color), color).toBeGreaterThanOrEqual(4.5);
  }
}

function declaredHexColors(source: string, declaration: string) {
  const declarationPattern = new RegExp(
    `(?:export\\s+)?const\\s+${declaration}\\s*=\\s*\\[([\\s\\S]*?)\\]`,
  );
  const match = source.match(declarationPattern);
  expect(match, declaration).not.toBeNull();
  return hexColors(match?.[1] ?? "");
}

function inlineBackgroundHexColors(source: string) {
  return [...source.matchAll(/background:\s*"([^"]+)"/g)].flatMap((match) =>
    hexColors(match[1]),
  );
}

function openingTagsNear(source: string, tagName: string, marker: string) {
  const tags: string[] = [];
  let markerIndex = source.indexOf(marker);

  while (markerIndex >= 0) {
    const start = source.lastIndexOf(`<${tagName}`, markerIndex);
    const end = source.indexOf(">", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    tags.push(source.slice(start, end + 1));
    markerIndex = source.indexOf(marker, markerIndex + marker.length);
  }

  expect(tags.length, marker).toBeGreaterThan(0);
  return tags;
}

describe("question game theme tokens", () => {
  it("keeps every built-in game palette readable under small white text", () => {
    expect(BUILT_IN_GAMES).toHaveLength(7);
    expect(new Set(BUILT_IN_GAMES.map((game) => game.accentColor)).size).toBe(7);
    expect(new Set(BUILT_IN_GAMES.map((game) => game.gradientCss)).size).toBe(7);

    for (const game of BUILT_IN_GAMES) {
      expectWhiteTextContrast([
        ...hexColors(game.gradientCss),
        game.accentColor,
      ]);
    }
  });

  it("keeps question dice colors readable under small white text", () => {
    for (const locale of ["ko", "en"] as const) {
      const colors = QUESTION_DICE_TYPES[locale].map(({ color }) => color);
      expect(colors).toHaveLength(6);
      expect(new Set(colors).size).toBe(6);
      expectWhiteTextContrast(colors);
    }
  });

  it("keeps custom game presets readable under small white text", () => {
    expect(GRADIENT_PRESETS).toHaveLength(8);
    expect(new Set(GRADIENT_PRESETS.map(({ id }) => id)).size).toBe(8);
    expect(new Set(GRADIENT_PRESETS.map(({ css }) => css)).size).toBe(8);

    for (const preset of GRADIENT_PRESETS) {
      expectWhiteTextContrast([...hexColors(preset.css), preset.accent]);
    }
  });

  it("keeps fixed inline game backgrounds readable under small white text", () => {
    for (const fileName of [
      "DiceGame.tsx",
      "MysteryBoxGame.tsx",
      "StoryDiceGame.tsx",
    ]) {
      expectWhiteTextContrast(inlineBackgroundHexColors(readGameSource(fileName)));
    }

    const page = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(student)/student-question-play/[gameId]/page.tsx",
      ),
      "utf8",
    );
    expectWhiteTextContrast(inlineBackgroundHexColors(page));

    const listPage = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(student)/student-question-play/page.tsx",
      ),
      "utf8",
    );
    expectWhiteTextContrast(inlineBackgroundHexColors(listPage));
  });

  it("keeps player and story marker palettes readable under white text", () => {
    const shared = readGameSource("roomShared.tsx");
    const lobby = readGameSource("RoomLobby.tsx");
    const relay = readGameSource("RelayGame.tsx");

    expectWhiteTextContrast(declaredHexColors(shared, "PLAYER_COLORS"));
    expectWhiteTextContrast(declaredHexColors(lobby, "PLAYER_COLORS"));
    expectWhiteTextContrast(declaredHexColors(relay, "PLAYER_COLORS"));
    const aiColor = relay.match(/const AI_COLOR = "(#[0-9a-f]{6})"/i)?.[1];
    expect(aiColor).toBeDefined();
    expectWhiteTextContrast(aiColor ? [aiColor] : []);
    expectWhiteTextContrast(Object.values(STORY_DICE_COLOR));
  });

  it.each([
    ["GameHeader.tsx", "{subtitle}"],
    ["roomShared.tsx", "subtitle ??"],
    ["RoomLobby.tsx", 't("lobbyWithFriends")'],
    ["LadderGame.tsx", "{text.ladderSubtitle}"],
    ["KabaGame.tsx", "{kabaText.subtitle}"],
    ["MysteryBoxGame.tsx", "text.mysteryAiSubtitle"],
    ["DiceGame.tsx", "{game.description}"],
    ["RelayGame.tsx", "{text.relaySubtitle}"],
    ["RelayGame.tsx", "{text.topic}: {finalTopic}"],
  ])("uses opaque white text for the gradient description in %s", (fileName, marker) => {
    const description = openingTagNear(readGameSource(fileName), "p", marker);

    expect(description).toMatch(/\btext-white\b/);
    expect(description).not.toMatch(/\btext-white\/(?:80|90)\b|\bopacity-80\b/);
  });

  it("uses opaque white text for gradient descriptions on game pages", () => {
    const detailPage = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(student)/student-question-play/[gameId]/page.tsx",
      ),
      "utf8",
    );
    const listPage = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(student)/student-question-play/page.tsx",
      ),
      "utf8",
    );

    for (const [source, marker] of [
      [detailPage, "{game.description}"],
      [listPage, '{t("subtitle")}'],
      [listPage, "{selectedGame.description}"],
    ]) {
      const description = openingTagNear(source, "p", marker);
      expect(description).toMatch(/\btext-white\b/);
      expect(description).not.toMatch(/\btext-white\/(?:80|90)\b/);
    }

    for (const marker of [
      '{t("gameCount", { count: games.length })}',
      "{selectedGame.playerCount}",
      "{selectedGame.duration}",
    ]) {
      const badge = openingTagNear(listPage, "span", marker);
      expect(badge).toMatch(/\bbg-black\/20\b/);
      expect(badge).not.toMatch(/\bbg-white\/(?:20|25)\b/);
    }
  });

  it("keeps accent colors on markers instead of small body text", () => {
    const relay = readGameSource("RelayGame.tsx");
    const story = readGameSource("StoryDiceGame.tsx");
    const kaba = readGameSource("KabaGame.tsx");
    const lobby = readGameSource("RoomLobby.tsx");
    const review = readGameSource("GameResultReview.tsx");
    const mystery = readGameSource("MysteryBoxGame.tsx");

    expect(relay).toMatch(
      /<p className="[^"]*text-foreground[^"]*">\s*\{item\.player\}/,
    );
    expect(relay).toMatch(
      /<span className="[^"]*text-foreground[^"]*">\s*\{item\.player\}/,
    );
    expect(relay).not.toMatch(
      /style=\{\{\s*color:\s*item\.isAI\s*\?\s*AI_COLOR/,
    );
    expect(relay).not.toContain("text-orange-500");
    for (const tag of openingTagsNear(story, "p", "getStoryDiceCategoryLabel(locale, cat)")) {
      expect(tag).toMatch(/\btext-foreground\b/);
      expect(tag).not.toContain("style=");
    }
    for (const [source, tagName, marker] of [
      [relay, "p", "{text.connectToQuestion}"],
      [kaba, "span", "{kabaText.correctCount(correctCount)}"],
      [lobby, "span", "{room.players.length}"],
      [review, "span", "{i + 1}."],
      [mystery, "div", 't("remainingLeft"'],
    ]) {
      const tag = openingTagNear(source, tagName, marker);
      expect(tag).toMatch(/\btext-foreground\b/);
      expect(tag).not.toMatch(/style=\{\{\s*color:/);
    }
  });

  it("keeps both lobby waiting messages readable without fading the text", () => {
    const source = readGameSource("RoomLobby.tsx");
    const emptySeat = openingTagNear(source, "span", 't("waitingForFriends")');
    const waitingGuest = openingTagNear(
      source,
      "div",
      't("waitingForTheHostTo")',
    );

    expect(emptySeat).toMatch(/\btext-secondary-foreground\b/);
    expect(emptySeat).not.toMatch(/\btext-muted-foreground\b|\banimate-pulse\b/);
    expect(waitingGuest).toMatch(/\btext-secondary-foreground\b/);
    expect(waitingGuest).not.toMatch(/\btext-muted-foreground\b/);
  });

  it("uses opaque white text for the shared room progress", () => {
    const source = readGameSource("roomShared.tsx");
    const progressGroup = openingTagNear(source, "div", "{room.players.length}");
    const progressLabel = openingTagNear(source, "p", "{text.inProgress}");

    expect(progressGroup).toMatch(/\btext-white\b/);
    expect(progressGroup).not.toMatch(/\btext-white\/(?:80|90)\b/);
    expect(progressLabel).not.toMatch(/\bopacity-80\b/);
  });

  it.each([
    "GameResultReview.tsx",
    "RoomLobby.tsx",
    "RoomResult.tsx",
    "RelayGame.tsx",
    "StoryDiceGame.tsx",
    "DiceGame.tsx",
    "KabaGame.tsx",
  ])("uses semantic colors for the body surfaces in %s", (fileName) => {
    const source = readGameSource(fileName);

    expect(source).toContain("bg-card");
    expect(source).toContain("border-border");
    expect(source).toContain("text-foreground");
    expect(source).toContain("text-muted-foreground");
    expect(source).not.toMatch(
      /\b(?:bg-white|bg-gray-(?:50|100)|text-gray-(?:300|400|500|600|700|800)|border-gray-(?:100|200|300))\b/,
    );
  });

  it.each([
    "RelayGame.tsx",
    "StoryDiceGame.tsx",
    "DiceGame.tsx",
    "KabaGame.tsx",
  ])("uses the form theme tokens in %s", (fileName) => {
    const source = readGameSource(fileName);

    expect(source).toContain("bg-background");
    expect(source).toContain("border-input");
    expect(source).toContain("text-foreground");
    expect(source).not.toMatch(
      /["']#(?:1f2937|374151|9ca3af|f3f4f6|e5e7eb|eef2ff)["']/i,
    );
  });

  it("uses semantic colors for shared room navigation and waiting states", () => {
    const header = readGameSource("GameHeader.tsx");
    const shared = readGameSource("roomShared.tsx");

    expect(header).toContain("text-muted-foreground");
    expect(header).not.toMatch(/text-gray-/);
    expect(shared).toContain("bg-secondary");
    expect(shared).toContain("text-muted-foreground");
    expect(shared).toContain("border-border");
    expect(shared).not.toMatch(/(?:text-gray-|bg-gray-|border-gray-)/);
  });

  it("uses semantic colors on the room code copy command", () => {
    const source = readGameSource("RoomLobby.tsx");
    const copyButton = openingTagNear(source, "button", "onClick={copyCode}");

    expect(copyButton).toMatch(/\bbg-secondary\b/);
    expect(copyButton).toMatch(/\btext-foreground\b/);
    expect(copyButton).toMatch(/\bborder-border\b/);
    expect(copyButton).not.toContain("game.accentColor");
  });

  it("uses readable semantic text for story flow authors", () => {
    const source = readGameSource("StoryDiceGame.tsx");
    const author = openingTagNear(
      source,
      "p",
      '{c.author} ({c.type === "story"',
    );

    expect(author).toMatch(/\btext-foreground\b/);
    expect(author).not.toContain("style=");
    expect(author).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("uses theme-aware ladder lines and labels", () => {
    const source = readGameSource("LadderBoard.tsx");

    const labelClasses = staticClassListContaining(
      source,
      "g",
      "fill-current",
    );
    const lineClasses = staticClassListContaining(
      source,
      "g",
      "text-muted-foreground",
    );

    expect(labelClasses).toEqual(
      expect.arrayContaining(["fill-current", "text-foreground"]),
    );
    expect(lineClasses).toContain("text-muted-foreground");
    expect(source).not.toMatch(/text-slate-/);
  });

  it("keeps the game page navigation and mode borders theme-aware", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(student)/student-question-play/[gameId]/page.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("text-muted-foreground");
    expect(source).toContain("hsl(var(--border))");
    expect(source).not.toMatch(/hover:text-gray-/);
    expect(source).not.toContain('"#e5e7eb"');
  });

  it("keeps teacher game statistics and header labels readable", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(teacher)/teacher-question-play/page.tsx",
      ),
      "utf8",
    );
    const statPalette = source.match(
      /\{ label: t\("statAll"\)[\s\S]*?\]\.map\(\(stat\)/,
    )?.[0] ?? "";
    expectWhiteTextContrast(hexColors(statPalette));

    for (const marker of ['t("builtIn")', 't("custom")']) {
      const label = openingTagNear(source, "span", marker);
      expect(label).toMatch(/\btext-white\b/);
      expect(label).not.toMatch(/\btext-white\/70\b/);
    }

    const visibilityBadge = openingTagNear(source, "span", "{visInfo.emoji}");
    expect(visibilityBadge).toMatch(/\bbg-black\/25\b/);
    expect(visibilityBadge).not.toMatch(/\bbg-white\/25\b/);

    const statLabel = openingTagNear(source, "div", "{stat.label}");
    expect(statLabel).toMatch(/\btext-white\b/);
    expect(statLabel).not.toMatch(/\bopacity-80\b/);
  });

  it("uses semantic surfaces for relay rules and AI guidance", () => {
    const source = readGameSource("RelayGame.tsx");
    const rules = openingTagNear(source, "div", "{text.gameRules}");
    const heading = openingTagNear(source, "p", "{text.gameRules}");
    const rule = openingTagNear(source, "p", "{r}");
    const aiGuide = openingTagNear(source, "p", "{text.relayAiOrder}");

    expect(rules).toMatch(/\bbg-secondary\b/);
    expect(rules).toMatch(/\bborder-border\b/);
    for (const tag of [heading, rule, aiGuide]) {
      expect(tag).toMatch(/\btext-foreground\b/);
      expect(tag).not.toMatch(/\btext-(?:orange|indigo)-/);
    }
    expect(aiGuide).toMatch(/\bbg-muted\b/);
  });

  it("keeps the student play button contrast unchanged on hover", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(student)/student-question-play/page.tsx",
      ),
      "utf8",
    );
    const playButton = openingTagNear(source, "button", '{t("play")}');

    expect(playButton).not.toMatch(/\bhover:opacity-/);
    expect(playButton).not.toMatch(/\bhover:brightness-/);
    expect(playButton).toMatch(/\bhover:shadow-/);
  });
});
