// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import StudentQuestionPlayPage from "@/app/(student)/student-question-play/page";
import TeacherQuestionPlayPage from "@/app/(teacher)/teacher-question-play/page";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/lib/app-queries", () => ({
  useTeacherStudents: () => ({
    data: {
      teacherClasses: [{ grade: "5", className: "1" }],
      students: [{
        id: "student-1",
        name: "학생",
        grade: "5",
        className: "1",
      }],
    },
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => vi.fn(),
}));

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: NoopResizeObserver,
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function learningHistory() {
  return {
    totals: { plays: 2, points: 10, goodQuestions: 3 },
    modes: {
      solo: { plays: 1, points: 4, goodQuestions: 1 },
      ai: { plays: 0, points: 0, goodQuestions: 0 },
      friend: { plays: 1, points: 6, goodQuestions: 2 },
    },
    daily: [],
    recent: [],
    nextCursor: null,
  };
}

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  vi.unstubAllGlobals();
});

describe("질문놀이 페이지 큰 탭", () => {
  beforeEach(() => {
    const game = BUILT_IN_GAMES[0];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games") return jsonResponse([game]);
      if (url === "/api/teacher/question-games") {
        return jsonResponse({ games: [game], visibilityMap: {} });
      }
      if (url.endsWith("/stats")) return jsonResponse({ byGame: {} });
      if (url.includes("/api/reports/question-games?")) {
        return jsonResponse(learningHistory());
      }
      return jsonResponse(null);
    }));
  });

  it("학생은 놀이와 나의 학습 기록을 분리하고 기록 탭을 열 때 조회한다", async () => {
    const game = BUILT_IN_GAMES[0];
    render(<StudentQuestionPlayPage />);

    expect(await screen.findByText(game.title)).toBeVisible();
    expect(screen.getByRole("tab", { name: "질문놀이" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("heading", { name: "나의 학습 기록" }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(
      ([input]) => String(input).includes("/api/reports/question-games?"),
    )).toBe(false);

    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "나의 학습 기록" }),
      { button: 0, ctrlKey: false },
    );

    expect(
      await screen.findByRole("heading", {
        name: "나의 학습 기록",
      }),
    ).toBeVisible();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(
      ([input]) => String(input).includes("/api/reports/question-games?"),
    )).toBe(true));
    expect(screen.queryByText(game.title)).not.toBeInTheDocument();
  });

  it("교사는 놀이 관리와 학급 학습 현황을 분리하고 현황 탭을 열 때 조회한다", async () => {
    const game = BUILT_IN_GAMES[0];
    render(<TeacherQuestionPlayPage />);

    expect(await screen.findByText(game.title)).toBeVisible();
    expect(screen.getByRole("tab", { name: "질문놀이" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("heading", { name: "학급 학습 현황" }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(
      ([input]) => String(input).includes("/api/reports/question-games?"),
    )).toBe(false);

    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "학급 학습 현황" }),
      { button: 0, ctrlKey: false },
    );

    expect(
      await screen.findByRole("heading", {
        name: "학급 학습 현황",
      }),
    ).toBeVisible();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(
      ([input]) => String(input).includes("/api/reports/question-games?"),
    )).toBe(true));
    expect(screen.queryByText(game.title)).not.toBeInTheDocument();
  });

  it("학생 질문놀이 응답이 비어 있으면 오류를 알리고 다시 불러온다", async () => {
    const game = BUILT_IN_GAMES[0];
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/question-games") return jsonResponse(null);
      attempts += 1;
      return attempts === 1
        ? new Response(null, { status: 200 })
        : jsonResponse([game]);
    }));

    render(<StudentQuestionPlayPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "질문놀이를 불러오지 못했습니다.",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText(game.title)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("교사 통계 응답만 비어 있어도 놀이 목록을 유지하고 다시 불러오기를 제공한다", async () => {
    const game = BUILT_IN_GAMES[0];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/teacher/question-games") {
        return jsonResponse({ games: [game], visibilityMap: {} });
      }
      if (url.endsWith("/stats")) return new Response(null, { status: 200 });
      return jsonResponse(null);
    }));

    render(<TeacherQuestionPlayPage />);

    expect(await screen.findByText(game.title)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "일부 질문놀이 자료를 불러오지 못했습니다.",
    );
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
  });
});
