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

describe("question game focused contrast regressions", () => {
  it("locks readable light and dark feedback colors in local games", () => {
    const kaba = read("src/app/(student)/student-question-play/games/KabaGame.tsx");
    const story = read("src/app/(student)/student-question-play/games/StoryDiceGame.tsx");
    const relay = read("src/app/(student)/student-question-play/games/RelayGame.tsx");

    expect(kaba.match(/text-green-900 dark:text-green-200/g)).toHaveLength(2);
    expect(kaba.match(/text-orange-800 dark:text-orange-200/g)).toHaveLength(2);
    expect(story).toContain("text-indigo-900 dark:text-indigo-200");
    expect(relay).toContain("text-red-800 dark:text-red-200");

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
});
