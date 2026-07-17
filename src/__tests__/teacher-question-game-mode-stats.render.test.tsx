// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import TeacherQuestionPlayPage from "@/app/(teacher)/teacher-question-play/page";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";

vi.mock("@/lib/app-queries", () => ({
  useTeacherStudents: () => ({
    data: {
      teacherClasses: [{ grade: "5", className: "1" }],
      students: [{ id: "student-1", name: "학생", grade: "5", className: "1" }],
    },
  }),
}));
vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => vi.fn(async () => true),
}));

describe("교사 질문놀이 방식 비교", () => {
  beforeEach(() => {
    const game = BUILT_IN_GAMES[0];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/stats")
        ? {
            byGame: {
              [game.id]: {
                participants: 1,
                plays: 6,
                completions: 5,
                goodQuestions: 8,
                lastPlayedAt: "2026-07-17T00:00:00.000Z",
                nonParticipants: [],
                students: [{
                  id: "student-1",
                  name: "학생",
                  studentNumber: "1",
                  plays: 6,
                  completions: 5,
                  points: 42,
                  goodQuestions: 8,
                  modes: {
                    solo: { plays: 2, completions: 2, points: 12, goodQuestions: 3 },
                    ai: { plays: 1, completions: 1, points: 8, goodQuestions: 2 },
                    friend: { plays: 3, completions: 2, points: 22, goodQuestions: 3 },
                  },
                }],
              },
            },
          }
        : { games: [game], visibilityMap: {} };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("전체 방식과 학생별 횟수를 같은 참여 화면에서 보여 준다", async () => {
    render(<TeacherQuestionPlayPage />);

    const participation = await screen.findByRole("button", { name: /참여 현황/ });
    participation.click();

    expect(await screen.findByRole("heading", { name: "놀이 방식 비교" })).toBeVisible();
    expect(screen.getByText("2회 · 완료 2회")).toBeVisible();
    expect(screen.getByText("1회 · 완료 1회")).toBeVisible();
    expect(screen.getByText("3회 · 완료 2회")).toBeVisible();
    expect(screen.getByText("혼자 2 · 인공지능 1 · 친구 3")).toBeVisible();
  });
});
