import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(path: string) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function blend(foreground: string, background: string, alpha: number) {
  const toChannels = (hex: string) =>
    hex.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16));
  const foregroundChannels = toChannels(foreground);
  const backgroundChannels = toChannels(background);
  return `#${foregroundChannels.map((channel, index) =>
    Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha))
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}

function expectReadable(pairs: Array<[string, string]>) {
  for (const [foreground, background] of pairs) {
    expect(contrast(foreground, background), `${foreground} on ${background}`)
      .toBeGreaterThanOrEqual(4.5);
  }
}

function expectDistinguishable(pairs: Array<[string, string]>) {
  for (const [foreground, background] of pairs) {
    expect(contrast(foreground, background), `${foreground} on ${background}`)
      .toBeGreaterThanOrEqual(3);
  }
}

describe("question game focused contrast regressions", () => {
  it("locks readable light and dark feedback colors in local games", () => {
    const kaba = read("src/app/(student)/student-question-play/games/KabaGame.tsx");
    const story = read("src/app/(student)/student-question-play/games/StoryDiceGame.tsx");
    const relay = read("src/app/(student)/student-question-play/games/RelayGame.tsx");

    expect(kaba.match(/text-green-900 dark:text-green-200/g)).toHaveLength(2);
    expect(kaba.match(/text-orange-800 dark:text-orange-200/g)).toHaveLength(2);
    expect(story).toContain("text-indigo-900 dark:text-indigo-200");
    expect(relay).toContain(
      "text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200",
    );

    expectReadable([
      ["#14532d", "#f1f5f9"],
      ["#bbf7d0", "#1e293b"],
      ["#9a3412", "#f1f5f9"],
      ["#fed7aa", "#1e293b"],
      ["#312e81", "#ffffff"],
      ["#c7d2fe", "#020617"],
      ["#991b1b", "#fef2f2"],
      ["#fecaca", blend("#ef4444", "#111827", 0.14)],
    ]);
  });

  it("locks readable teacher statistics and preview states", () => {
    const teacher = read("src/app/(teacher)/teacher-question-play/page.tsx");
    const preview = read("src/app/(teacher)/teacher-question-play/[gameId]/preview/page.tsx");

    for (const classes of [
      "text-indigo-900 dark:text-indigo-200",
      "text-emerald-900 dark:text-emerald-200",
      "text-amber-900 dark:text-amber-200",
      "text-rose-900 dark:text-rose-200",
    ]) {
      expect(teacher).toContain(classes);
    }
    expect(preview).toContain("border-border bg-secondary");
    expect(preview).toContain("text-foreground");
    expect(preview).toContain("linear-gradient(135deg, #6D28D9, #BE185D)");

    expectReadable([
      ["#312e81", "#ffffff"],
      ["#c7d2fe", "#111827"],
      ["#064e3b", "#ffffff"],
      ["#a7f3d0", "#111827"],
      ["#78350f", "#ffffff"],
      ["#fde68a", "#111827"],
      ["#881337", "#ffffff"],
      ["#fecdd3", "#111827"],
      ["#020617", "#f1f5f9"],
      ["#f8fafc", "#1e293b"],
      ["#ffffff", "#6D28D9"],
      ["#ffffff", "#BE185D"],
    ]);
  });

  it("locks readable small award details in both themes", () => {
    const source = read("src/app/(student)/student-question-play/games/useSingleAward.tsx");

    expect(source).toContain("text-xs text-amber-900 dark:text-amber-200");
    expect(source).toContain("text-xs text-emerald-800 dark:text-emerald-200");

    expectReadable([
      ["#78350f", "#ecfdf5"],
      ["#fde68a", blend("#10b981", "#111827", 0.14)],
      ["#065f46", "#ecfdf5"],
      ["#a7f3d0", blend("#10b981", "#111827", 0.14)],
    ]);
  });

  it("pairs fixed question game status surfaces with matching dark surfaces", () => {
    const compatibility = read(
      "src/app/(student)/student-question-play/games/RoomCompatibilityNotice.tsx",
    );
    const relay = read(
      "src/app/(student)/student-question-play/games/RelayGame.tsx",
    );
    const result = read(
      "src/app/(student)/student-question-play/games/RoomResult.tsx",
    );
    const roomFlow = read(
      "src/components/question-games/QuestionGameRoomFlow.tsx",
    );
    const award = read(
      "src/app/(student)/student-question-play/games/useSingleAward.tsx",
    );

    expect(compatibility).toContain(
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-50",
    );
    expect(compatibility).toContain(
      "border border-border bg-card text-card-foreground",
    );
    expect(compatibility).not.toMatch(/\bbg-white\b/);

    expect(relay).toContain(
      "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200",
    );
    expect(relay).toContain('<div role="alert" className="rounded-xl');

    expect(result.match(/text-red-700 dark:text-red-300/g)).toHaveLength(2);
    expect(result).not.toMatch(/\btext-red-600\b/);
    expect(result).toContain(
      "border-primary border-t-transparent",
    );
    expect(result.match(/text-xs text-secondary-foreground ml-1/g)).toHaveLength(2);

    expect(roomFlow).toContain(
      "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200",
    );
    expect(roomFlow).not.toMatch(/\btext-destructive\b/);

    expect(award).toContain(
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
    );
    expect(award).toContain(
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    );

    expectReadable([
      ["#78350f", "#fffbeb"],
      ["#fef3c7", "#451a03"],
      ["#78350f", "#fef3c7"],
      ["#fef3c7", "#451a03"],
      ["#064e3b", "#ecfdf5"],
      ["#d1fae5", "#022c22"],
      ["#991b1b", "#fef2f2"],
      ["#fecaca", "#260f17"],
      ["#b91c1c", "#ffffff"],
      ["#fca5a5", "#111827"],
    ]);
  });

  it("uses theme-aware accent text for local game progress and feedback", () => {
    const dice = read(
      "src/app/(student)/student-question-play/games/DiceGame.tsx",
    );
    const kaba = read(
      "src/app/(student)/student-question-play/games/KabaGame.tsx",
    );

    expect(dice).toContain("text-indigo-700 dark:text-indigo-300");
    expect(dice).toContain("text-amber-800 dark:text-amber-300");
    expect(dice).toContain(
      "border-primary border-t-transparent",
    );
    expect(dice).not.toMatch(/\btext-indigo-600\b|\btext-amber-700\b/);
    expect(kaba).toContain("text-blue-700 dark:text-blue-300");
    expect(kaba).toContain(
      "border-primary border-t-transparent",
    );
    expect(kaba).toContain(
      "text-xs text-foreground font-medium mb-2 uppercase tracking-wider",
    );
    expect(kaba).toContain(
      "gap-3 mt-4 text-foreground",
    );
    expect(kaba).not.toMatch(/\btext-blue-600\b/);

    expectReadable([
      ["#4338ca", "#ffffff"],
      ["#a5b4fc", "#111827"],
      ["#92400e", "#f1f5f9"],
      ["#fcd34d", "#1e293b"],
      ["#1d4ed8", "#ffffff"],
      ["#93c5fd", "#111827"],
      ["#020617", "#f0f6f8"],
    ]);

    expectDistinguishable([
      ["#2563eb", "#ffffff"],
      ["#3b82f6", "#1e293b"],
    ]);
  });

  it("keeps secondary surface copy readable in every shared local state", () => {
    const relay = read(
      "src/app/(student)/student-question-play/games/RelayGame.tsx",
    );
    const dice = read(
      "src/app/(student)/student-question-play/games/DiceGame.tsx",
    );
    const kaba = read(
      "src/app/(student)/student-question-play/games/KabaGame.tsx",
    );
    const story = read(
      "src/app/(student)/student-question-play/games/StoryDiceGame.tsx",
    );
    const shared = read(
      "src/app/(student)/student-question-play/games/roomShared.tsx",
    );
    const result = read(
      "src/app/(student)/student-question-play/games/RoomResult.tsx",
    );
    const modePage = read(
      "src/app/(student)/student-question-play/[gameId]/page.tsx",
    );

    expect(relay.match(/bg-secondary text-secondary-foreground/g)).toHaveLength(3);
    expect(relay).toContain(
      "text-secondary-foreground text-sm font-medium",
    );
    expect(relay).toContain("readOnly={interactionBusy || questionNeedsConfirmation}");
    expect(relay).not.toContain("disabled:text-secondary-foreground");
    expect(dice).toContain("bg-secondary text-secondary-foreground");
    expect(dice).toContain(
      "text-secondary-foreground text-xs bg-secondary",
    );
    expect(kaba).toContain("bg-secondary text-secondary-foreground");
    expect(kaba.match(/text-xs text-secondary-foreground/g)).toHaveLength(3);
    expect(kaba.match(/text-secondary-foreground text-sm/g)).toHaveLength(3);
    expect(story).toContain("disabled:text-secondary-foreground");
    expect(story).toContain(
      "bg-secondary border border-border rounded-xl p-3 text-center text-secondary-foreground",
    );
    expect(shared).toContain("bg-secondary text-secondary-foreground");
    expect(result).toContain(
      'text-secondary-foreground text-xs">💬 {bestQ.reason}',
    );
    expect(modePage).toContain(
      'text-foreground text-xs text-center leading-tight">{m.desc}',
    );
    expect(modePage.match(/text-secondary-foreground text-xs/g)).toHaveLength(2);

    expectReadable([
      ["#020617", "#f1f5f9"],
      ["#f8fafc", "#1e293b"],
    ]);
  });

  it("keeps every CSS loading ring distinguishable in both themes", () => {
    for (const fileName of [
      "DiceGame.tsx",
      "MemoryGame.tsx",
      "MysteryBoxGame.tsx",
      "RoomLobby.tsx",
      "RoomResult.tsx",
      "StoryDiceGame.tsx",
      "roomShared.tsx",
    ]) {
      const source = read(
        `src/app/(student)/student-question-play/games/${fileName}`,
      );
      expect(source).toContain(
        "border-primary border-t-transparent",
      );
    }

    const kaba = read(
      "src/app/(student)/student-question-play/games/KabaGame.tsx",
    );
    expect(kaba).toContain(
      "border-primary border-t-transparent",
    );

    expectDistinguishable([
      ["#2563eb", "#f1f5f9"],
      ["#3b82f6", "#1e293b"],
    ]);
  });
});
