// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
        students={[
          { id: "student-1", grade: "5", className: "1" },
          { id: "student-2", grade: "5", className: "1" },
          { id: "student-3", grade: "5", className: "2" },
        ]}
        statsByGame={{
          relay: {
            students: [{
              id: "student-1",
              plays: 4,
              completions: 3,
              modes: {
                solo: { plays: 2, completions: 2 },
                ai: { plays: 0, completions: 0 },
                friend: { plays: 2, completions: 1 },
              },
            }, {
              id: "student-2",
              plays: 1,
              completions: 1,
              modes: {
                solo: { plays: 0, completions: 0 },
                ai: { plays: 0, completions: 0 },
                friend: { plays: 1, completions: 1 },
              },
            }, {
              id: "student-3",
              plays: 5,
              completions: 5,
              modes: {
                solo: { plays: 0, completions: 0 },
                ai: { plays: 5, completions: 5 },
                friend: { plays: 0, completions: 0 },
              },
            }],
          },
        }}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/question-games?summary=1&grade=5&className=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    const heading = await screen.findByRole("heading", { name: "학급 질문놀이 학습 현황" });
    expect(heading).toBeVisible();
    const overviewHeader = heading.closest("header");
    expect(overviewHeader).not.toBeNull();
    expect(within(overviewHeader!).getByLabelText("학급 선택")).toHaveValue("5|1");
    expect(screen.getAllByRole("heading", { name: "학급 질문놀이 학습 현황" })).toHaveLength(1);
    expect(screen.getByText("최근 6주 변화")).toBeVisible();
    expect(screen.getByText("놀이별 참여 방식")).toBeVisible();
    expect(screen.getByText(
      "질문 릴레이: 친구와 함께 참여 2명, 학급 참여율 100%, 완료 2회",
    ).closest("ul")).toHaveClass("sr-only");
    expect(screen.queryByText(/인공지능과 함께 참여 1명/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "완료율" }));
    expect(screen.getByText("질문 릴레이: 참여 5회 중 완료 4회, 완료율 80%").closest("ul"))
      .toHaveClass("sr-only");
  });
});
