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

  it("uses theme-aware ladder lines and labels", () => {
    const source = readGameSource("LadderBoard.tsx");

    expect(source).toContain('className="fill-current text-foreground"');
    expect(source).toContain('className="text-muted-foreground"');
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
