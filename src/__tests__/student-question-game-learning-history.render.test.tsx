// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { StudentQuestionGameLearningHistory } from "@/components/question-games/StudentQuestionGameLearningHistory";

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

describe("학생 질문놀이 학습 기록", () => {
  it("불러오는 상태를 알리고 완료되면 나의 기록을 보여 준다", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    })));

    render(<StudentQuestionGameLearningHistory />);

    expect(screen.getByRole("status")).toHaveTextContent("이력을 불러오는 중입니다");
    await waitFor(() => expect(resolveResponse).toBeTypeOf("function"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/question-games?summary=1",
      { cache: "no-store" },
    );

    await act(async () => {
      resolveResponse?.(new Response(JSON.stringify({
        totals: { plays: 2, points: 12, goodQuestions: 3 },
        modes: {
          solo: { plays: 1, points: 4, goodQuestions: 1 },
          ai: { plays: 0, points: 0, goodQuestions: 0 },
          friend: { plays: 1, points: 8, goodQuestions: 2 },
        },
        recent: [],
        nextCursor: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });

    expect(await screen.findByRole("heading", { name: "나의 학습 기록" })).toBeVisible();
  });

  it("서버 응답이 비어 있어도 이해할 수 있는 오류를 보여 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    render(<StudentQuestionGameLearningHistory />);

    expect(await screen.findByText("이력을 불러오지 못했습니다.")).toBeVisible();
    expect(screen.queryByText(/Unexpected end of JSON input/)).not.toBeInTheDocument();
  });
});
