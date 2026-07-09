import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const headerPath = "src/app/(student)/student-question-play/games/GameHeader.tsx";
const memorySource = readFileSync("src/app/(student)/student-question-play/games/MemoryGame.tsx", "utf8");
const storyDiceSource = readFileSync("src/app/(student)/student-question-play/games/StoryDiceGame.tsx", "utf8");

describe("student game shared header", () => {
  it("uses one shared game header for repeated built-in game screens", () => {
    expect(existsSync(headerPath)).toBe(true);
    const headerSource = readFileSync(headerPath, "utf8");

    expect(headerSource).toContain("game-shared-header");
    expect(headerSource).toContain("game.gradientCss");
    expect(headerSource).toContain("game.emoji");
    expect(headerSource).toContain("game.title");

    expect(memorySource).toContain("GameHeader");
    expect(memorySource).not.toContain("function Header");
    expect(storyDiceSource).toContain("GameHeader");
    expect(storyDiceSource).not.toContain("function Header");
  });
});
