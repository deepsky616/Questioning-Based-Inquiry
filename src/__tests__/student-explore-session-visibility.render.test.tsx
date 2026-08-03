// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";

const sessions = [
  {
    id: "published-design-session",
    date: "2026-08-01",
    subject: "국어",
    topic: "주장과 근거 살펴보기",
    unitDesignId: "design-1",
    sharedQuestions: [{ type: "conceptual", content: "좋은 근거란 무엇일까요?" }],
  },
  {
    id: "direct-inquiry-session",
    date: "2026-08-02",
    subject: "수학",
    topic: "각도 재기",
    unitDesignId: "design-2",
    sharedQuestions: [],
  },
];

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "student-1", role: "STUDENT", name: "학생" } },
    status: "authenticated",
  }),
}));

vi.mock("@/lib/app-queries", () => ({
  useStudentSessions: () => ({ data: sessions }),
}));

vi.mock("@/components/student/StudentMonthlySessionLookup", () => ({
  StudentMonthlyDateSelect: () => <select aria-label="날짜" />,
  StudentMonthlySessionLookup: ({ sessions: visibleSessions }: { sessions: typeof sessions }) => (
    <div data-testid="session-options">
      {visibleSessions.map((session) => (
        <span key={session.id} data-testid={`session-${session.id}`}>
          {session.topic}
        </span>
      ))}
    </div>
  ),
}));

import { ExploreQuestionsView } from "@/components/student/ExploreQuestionsView";

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: NoopResizeObserver,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("전체 질문 탐구 수업 주제 표시", () => {
  it("수업 탐구 질문이 배포된 수업도 학생 질문의 수업 주제로 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [],
    })));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
          <ExploreQuestionsView />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("session-published-design-session")).toHaveTextContent(
      "주장과 근거 살펴보기",
    );
    expect(screen.getByTestId("session-direct-inquiry-session")).toHaveTextContent("각도 재기");
  });
});
