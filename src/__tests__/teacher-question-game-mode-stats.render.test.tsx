// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import TeacherQuestionPlayPage from "@/app/(teacher)/teacher-question-play/page";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: NoopResizeObserver,
});

let teacherClasses = [
  { grade: "5", className: "1" },
  { grade: "5", className: "2" },
];
let teacherStudents = [
  { id: "student-1", name: "첫째", grade: "5", className: "1" },
  { id: "student-2", name: "둘째", grade: "5", className: "2" },
];

vi.mock("@/lib/app-queries", () => ({
  useTeacherStudents: () => ({
    data: {
      teacherClasses,
      students: teacherStudents,
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
      const body = url.includes("/api/reports/question-games?")
        ? {
            totals: { plays: 5, points: 42, goodQuestions: 8 },
            modes: {
              solo: { plays: 2, points: 12, goodQuestions: 3 },
              ai: { plays: 1, points: 8, goodQuestions: 2 },
              friend: { plays: 2, points: 22, goodQuestions: 3 },
            },
            weekly: [{ weekStart: "2026-07-13", plays: 5, goodQuestions: 8 }],
            recent: [],
            nextCursor: null,
          }
        : url.endsWith("/stats")
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
                  name: "첫째",
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
                }, {
                  id: "student-2",
                  name: "둘째",
                  studentNumber: "2",
                  plays: 3,
                  completions: 3,
                  points: 21,
                  goodQuestions: 4,
                  modes: {
                    solo: { plays: 1, completions: 1, points: 5, goodQuestions: 1 },
                    ai: { plays: 1, completions: 1, points: 7, goodQuestions: 1 },
                    friend: { plays: 1, completions: 1, points: 9, goodQuestions: 2 },
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

    expect(await screen.findByRole("heading", { name: "학급 질문놀이 학습 현황" })).toBeVisible();
    expect(screen.getByLabelText("학급 선택")).toHaveValue("5|1");
    expect(screen.getByText("완료한 놀이").nextSibling).toHaveTextContent("5");
    expect(screen.getByText("혼자 하기 2회")).toBeVisible();
    expect(screen.getByText("인공지능과 함께 1회")).toBeVisible();
    expect(screen.getByText("친구와 함께 2회")).toBeVisible();

    const participation = screen.getByRole("button", { name: /참여 현황/ });
    fireEvent.click(participation);

    expect(await screen.findByRole("heading", { name: "놀이 방식 비교" })).toBeVisible();
    expect(screen.getByText("3회 · 완료 3회")).toBeVisible();
    expect(screen.getByText("2회 · 완료 2회")).toBeVisible();
    expect(screen.getByText("4회 · 완료 3회")).toBeVisible();
    expect(screen.getByText("혼자 2 · 인공지능 1 · 친구 3")).toBeVisible();
  });
});
