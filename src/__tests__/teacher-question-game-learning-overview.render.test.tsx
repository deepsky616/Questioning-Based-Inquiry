// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
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
  it("담당 학급의 최근 14일 변화와 놀이별 참여 현황을 불러온다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      totals: { plays: 3, points: 18, goodQuestions: 7 },
      modes: {
        solo: { plays: 1, points: 4, goodQuestions: 1 },
        ai: { plays: 0, points: 0, goodQuestions: 0 },
        friend: { plays: 2, points: 14, goodQuestions: 6 },
      },
      daily: [{ date: "2026-07-17", plays: 3, goodQuestions: 7 }],
      recent: [],
      nextCursor: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TeacherQuestionGameLearningOverview
        classes={[{ grade: "5", className: "1" }]}
        students={[
          { id: "student-1", name: "첫째", grade: "5", className: "1" },
          { id: "student-2", name: "둘째", grade: "5", className: "1" },
          { id: "student-3", name: "셋째", grade: "5", className: "2" },
        ]}
        statsByGame={{
          relay: {
            students: [{
              id: "student-1",
              plays: 4,
              completions: 3,
              lastPlayedAt: "2026-07-24T00:00:00.000Z",
              modes: {
                solo: { plays: 2, completions: 2, goodQuestions: 3 },
                ai: { plays: 0, completions: 0 },
                friend: { plays: 2, completions: 1, goodQuestions: 2 },
              },
            }, {
              id: "student-2",
              plays: 1,
              completions: 1,
              lastPlayedAt: "2026-06-01T00:00:00.000Z",
              modes: {
                solo: { plays: 0, completions: 0 },
                ai: { plays: 0, completions: 0 },
                friend: { plays: 1, completions: 1, goodQuestions: 1 },
              },
            }, {
              id: "student-3",
              plays: 5,
              completions: 5,
              lastPlayedAt: "2026-07-24T00:00:00.000Z",
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
    const heading = await screen.findByRole("heading", { name: "학급 학습 현황" });
    expect(heading).toBeVisible();
    const overviewHeader = heading.closest("header");
    expect(overviewHeader).not.toBeNull();
    expect(within(overviewHeader!).getByLabelText("학급 선택")).toHaveValue("5|1");
    expect(screen.getAllByRole("heading", { name: "학급 학습 현황" })).toHaveLength(1);
    expect(screen.getByText("전체 누적 요약")).toBeVisible();
    expect(screen.getByText("최근 14일 변화")).toBeVisible();
    expect(screen.getByText("놀이별 참여 방식")).toBeVisible();
    expect(screen.getByText("전체 누적 기준")).toBeVisible();
    expect(screen.getByText("참여 학생").nextSibling).toHaveTextContent("2/2명 · 100%");
    expect(screen.getByText(
      "질문 릴레이: 친구와 함께 참여 2명, 학급 참여율 100%, 완료 2회, 학생당 평균 1.0회, 인정 3개 · 완료당 1.5개",
    ).closest("ul")).toHaveClass("sr-only");
    expect(screen.queryByText(/인공지능과 함께 참여 1명/)).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "완료율" })).not.toBeInTheDocument();
    const friendCell = screen.getByRole("cell", {
      name: "2명 (100%) 완료 2회 · 1명당 1.0회 인정 3개 · 완료당 1.5개",
    });
    expect(friendCell).toBeVisible();
    expect(screen.getByText("최근 14일 활동이 없는 학생 · 1명")).toBeVisible();
    expect(screen.getByText("완료한 놀이가 한 번인 학생 · 1명")).toBeVisible();
    expect(screen.getAllByText("둘째")).toHaveLength(2);
  });
});
