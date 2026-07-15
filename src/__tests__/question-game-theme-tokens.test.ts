import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("question game theme tokens", () => {
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

  it("uses muted semantic text for story flow authors", () => {
    const source = readGameSource("StoryDiceGame.tsx");
    const author = openingTagNear(
      source,
      "p",
      '{c.author} ({c.type === "story"',
    );

    expect(author).toMatch(/\btext-muted-foreground\b/);
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
});
