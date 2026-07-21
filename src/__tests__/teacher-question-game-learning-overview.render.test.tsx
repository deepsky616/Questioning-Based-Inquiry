// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { TeacherQuestionGameLearningOverview } from "@/components/question-games/TeacherQuestionGameLearningOverview";

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: NoopResizeObserver,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("교사 질문놀이 학습 현황", () => {
  it("담당 학급의 주간 변화와 놀이별 완료율을 불러온다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      totals: { plays: 3, points: 18, goodQuestions: 7 },
      modes: {
        solo: { plays: 1, points: 4, goodQuestions: 1 },
        ai: { plays: 0, points: 0, goodQuestions: 0 },
        friend: { plays: 2, points: 14, goodQuestions: 6 },
      },
      weekly: [{ weekStart: "2026-07-13", plays: 3, goodQuestions: 7 }],
      recent: [],
      nextCursor: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TeacherQuestionGameLearningOverview
        classes={[{ grade: "5", className: "1" }]}
        students={[{ id: "student-1", grade: "5", className: "1" }]}
        statsByGame={{
          relay: {
            students: [{ id: "student-1", plays: 4, completions: 3 }],
          },
        }}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/question-games?summary=1&grade=5&className=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(await screen.findByRole("heading", { name: "학급 질문놀이 학습 현황" })).toBeVisible();
    expect(screen.getByText("최근 6주 변화")).toBeVisible();
    expect(screen.getByText("놀이별 완료율")).toBeVisible();
    expect(screen.getByText("질문 릴레이: 참여 4회 중 완료 3회, 완료율 75%").closest("ul"))
      .toHaveClass("sr-only");
  });
});
