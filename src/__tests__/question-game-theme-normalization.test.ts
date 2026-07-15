import { describe, expect, it } from "vitest";
import * as questionGamesData from "@/lib/question-games-data";

function whiteContrastRatio(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return 0;
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 1.05 / (0.2126 * red + 0.7152 * green + 0.0722 * blue + 0.05);
}

describe("question game theme normalization", () => {
  it("exposes a pure response theme normalizer", () => {
    expect(questionGamesData.normalizeQuestionGameTheme).toBeTypeOf("function");
  });

  it("keeps a strict dark gradient and dark six-digit accent unchanged", () => {
    const game = {
      id: "safe-theme",
      gradientCss: "linear-gradient(135deg, #111827 0%, #1F2937 100%)",
      accentColor: "#111827",
    };

    expect(questionGamesData.normalizeQuestionGameTheme(game)).toBe(game);
  });

  it("maps a bright supported gradient to a safe preset in the same color family", () => {
    const green = questionGamesData.GRADIENT_PRESETS.find(({ id }) => id === "green");
    const game = {
      gradientCss: "linear-gradient(135deg, #34D399 0%, #059669 100%)",
      accentColor: "#065F46",
    };

    expect(questionGamesData.normalizeQuestionGameTheme(game)).toEqual({
      gradientCss: green?.css,
      accentColor: game.accentColor,
    });
  });

  it("normalizes an unsafe accent independently from an already safe gradient", () => {
    const game = {
      gradientCss: "linear-gradient(135deg, #111827 0%, #1F2937 100%)",
      accentColor: "#ffffff",
    };
    const normalized = questionGamesData.normalizeQuestionGameTheme(game);

    expect(normalized.gradientCss).toBe(game.gradientCss);
    expect(normalized.accentColor).toMatch(/^#[0-9A-F]{6}$/i);
    expect(normalized.accentColor).not.toBe(game.accentColor);
    expect(whiteContrastRatio(normalized.accentColor)).toBeGreaterThanOrEqual(4.5);
  });

  it("normalizes an unsafe gradient independently from an already safe accent", () => {
    const game = {
      gradientCss: "linear-gradient(135deg, #38BDF8 0%, #2563EB 100%)",
      accentColor: "#111827",
    };
    const normalized = questionGamesData.normalizeQuestionGameTheme(game);

    expect(normalized.gradientCss).not.toBe(game.gradientCss);
    expect(normalized.accentColor).toBe(game.accentColor);
  });

  it("replaces arbitrary CSS but preserves an independently safe accent without mutating input", () => {
    const fallback = questionGamesData.GRADIENT_PRESETS.find(({ id }) => id === "indigo");
    const game = {
      id: "legacy-theme",
      gradientCss: 'url("https://example.com/bright.png")',
      accentColor: "#111827",
    };
    const original = { ...game };

    expect(questionGamesData.normalizeQuestionGameTheme(game)).toEqual({
      ...game,
      gradientCss: fallback?.css,
      accentColor: game.accentColor,
    });
    expect(game).toEqual(original);
  });

  it("uses both supported gradient endpoints and a safe accent to choose the fallback family", () => {
    const green = questionGamesData.GRADIENT_PRESETS.find(({ id }) => id === "green");
    const game = {
      gradientCss: "linear-gradient(135deg, #FFFFFF 0%, #34D399 100%)",
      accentColor: "#065F46",
    };
    const normalized = questionGamesData.normalizeQuestionGameTheme(game);

    expect(normalized).toEqual({
      gradientCss: green?.css,
      accentColor: game.accentColor,
    });
    expect(questionGamesData.normalizeQuestionGameTheme(game)).toEqual(normalized);
  });

  it("falls back both unsupported gradient and unsafe accent without mutating input", () => {
    const fallback = questionGamesData.GRADIENT_PRESETS.find(({ id }) => id === "indigo");
    const game = {
      id: "unsafe-legacy-theme",
      gradientCss: 'url("https://example.com/bright.png")',
      accentColor: "#ffffff",
    };
    const original = { ...game };

    expect(questionGamesData.normalizeQuestionGameTheme(game)).toEqual({
      ...game,
      gradientCss: fallback?.css,
      accentColor: fallback?.accent,
    });
    expect(game).toEqual(original);
  });

  it("rejects a non-six-digit accent even when its color would otherwise be dark", () => {
    const game = {
      gradientCss: "linear-gradient(135deg, #111827 0%, #1F2937 100%)",
      accentColor: "#000",
    };
    const normalized = questionGamesData.normalizeQuestionGameTheme(game);

    expect(normalized.gradientCss).toBe(game.gradientCss);
    expect(normalized.accentColor).toMatch(/^#[0-9A-F]{6}$/i);
    expect(normalized.accentColor).not.toBe(game.accentColor);
    expect(whiteContrastRatio(normalized.accentColor)).toBeGreaterThanOrEqual(4.5);
  });
});
