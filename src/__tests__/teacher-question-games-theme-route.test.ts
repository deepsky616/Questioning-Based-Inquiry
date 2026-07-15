import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/question-game-settings-store", () => ({
  createQuestionGame: vi.fn(),
  loadQuestionGameSettings: vi.fn(),
}));

import { GET, POST } from "@/app/api/teacher/question-games/route";
import { auth } from "@/lib/auth";
import {
  createQuestionGame,
  loadQuestionGameSettings,
} from "@/lib/question-game-settings-store";
import { GRADIENT_PRESETS } from "@/lib/question-games-data";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createQuestionGame as unknown as ReturnType<typeof vi.fn>;
const mockLoad = loadQuestionGameSettings as unknown as ReturnType<typeof vi.fn>;

const unsafeTheme = {
  gradientCss: 'url("https://example.com/bright.png")',
  accentColor: "#ffffff",
};

const customGame = {
  id: "custom-unsafe",
  teacherId: "teacher-1",
  title: "직접 만든 놀이",
  description: "설명",
  emoji: "🎮",
  ...unsafeTheme,
  playerCount: "2~8명",
  duration: "10분",
  instructions: [],
  isBuiltIn: false as const,
  order: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockLoad.mockResolvedValue({
    customGames: [customGame],
    visibilityMap: {},
    orderIds: null,
  });
  mockCreate.mockResolvedValue(customGame);
});

describe("교사 질문놀이 색 응답 경계", () => {
  it("목록 조회에서 저장된 임의 CSS를 안전한 기본색으로 바꾼다", async () => {
    const response = await GET();
    const data = await response.json();
    const custom = data.games.find((game: { id: string }) => game.id === customGame.id);
    const fallback = GRADIENT_PRESETS.find(({ id }) => id === "indigo");

    expect(custom).toMatchObject({
      gradientCss: fallback?.css,
      accentColor: fallback?.accent,
    });
  });

  it("생성 입력은 그대로 저장하고 반환 응답만 안전한 기본색으로 바꾼다", async () => {
    const request = new NextRequest("http://localhost/api/teacher/question-games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customGame),
    });

    const response = await POST(request);
    const data = await response.json();
    const fallback = GRADIENT_PRESETS.find(({ id }) => id === "indigo");

    expect(mockCreate).toHaveBeenCalledWith("teacher-1", expect.objectContaining(unsafeTheme));
    expect(data.game).toMatchObject({
      gradientCss: fallback?.css,
      accentColor: fallback?.accent,
    });
    expect(customGame).toMatchObject(unsafeTheme);
  });
});
