// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { PracticeProgressSummary } from "@/components/student/PracticeProgressSummary";
import ko from "../../messages/ko.json";

const { queryState, refetch } = vi.hoisted(() => ({
  queryState: { current: {} as Record<string, unknown> },
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryState.current,
}));

const completedDiagnostic = {
  capped: false,
  activityAttempts: 6,
  diagnosticAttempts: 5,
  overall: { attempts: 5, correct: 3, accuracy: 60 },
  modes: {
    quiz: { attempts: 5, correct: 3, accuracy: 60 },
    transform: { attempts: 0, correct: 0, accuracy: null },
    create: { attempts: 0, correct: 0, accuracy: null },
  },
  types: {
    closed: { attempts: 1, correct: 1, accuracy: 100 },
    open: { attempts: 1, correct: 1, accuracy: 100 },
    factual: { attempts: 1, correct: 1, accuracy: 100 },
    conceptual: { attempts: 1, correct: 0, accuracy: 0 },
    controversial: { attempts: 1, correct: 0, accuracy: 0 },
  },
  unknownTypeAttempts: 0,
  recommendation: {
    kind: "focus" as const,
    tab: "quiz" as const,
    quizMode: "cognitive" as const,
    focus: "conceptual" as const,
  },
};

function renderSummary() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      <PracticeProgressSummary />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refetch.mockReset();
});

afterEach(cleanup);

describe("학생 개인 연습 진단 요약", () => {
  it("불러오는 동안 별도 상태를 표시한다", () => {
    queryState.current = { isLoading: true, isError: false, data: undefined, refetch };

    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent("내 연습 진단을 불러오는 중이에요");
  });

  it("불러오기 실패를 알리고 다시 시도한다", () => {
    queryState.current = { isLoading: false, isError: true, data: undefined, refetch };

    renderSummary();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.getByRole("alert")).toHaveTextContent("연습 진단을 불러오지 못했어요");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("진단할 자료가 없으면 전체 분류 연습으로 이동하게 한다", () => {
    queryState.current = {
      isLoading: false,
      isError: false,
      data: { ...completedDiagnostic, activityAttempts: 0, diagnosticAttempts: 0 },
      refetch,
    };

    renderSummary();

    expect(screen.getByText("아직 진단할 연습 기록이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "분류 연습 시작" })).toHaveAttribute(
      "href",
      "/student-practice?tab=quiz&quizMode=cognitive",
    );
  });

  it("진단 결과와 허용된 추천 주소를 보여 주되 학생 순위는 표시하지 않는다", () => {
    queryState.current = { isLoading: false, isError: false, data: completedDiagnostic, refetch };

    renderSummary();

    expect(screen.getByText("최근 30일 진단")).toBeInTheDocument();
    expect(screen.getByText("정답률 60% · 진단 시도 5회")).toBeInTheDocument();
    expect(screen.getByText("개념적 질문을 더 연습해 보세요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "맞춤 연습 시작" })).toHaveAttribute(
      "href",
      "/student-practice?tab=quiz&quizMode=cognitive&focus=conceptual",
    );
    expect(screen.queryByText(/등|순위/)).not.toBeInTheDocument();
  });
});
