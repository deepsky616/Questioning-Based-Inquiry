// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";

const sessions = [
  {
    id: "july-published-session",
    date: "2026-07-16",
    subject: "국어",
    topic: "주장과 근거의 적절성 판단하기",
    unitDesignId: "design-1",
    sharedQuestions: [{ type: "conceptual", content: "좋은 근거란 무엇일까요?" }],
  },
  {
    id: "august-direct-session",
    date: "2026-08-04",
    subject: "국어",
    topic: "질문을 만들며 글 읽기",
    unitDesignId: "design-2",
    sharedQuestions: [],
  },
];

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "student-1", role: "STUDENT", name: "김질문" } },
    status: "authenticated",
  }),
}));

vi.mock("@/lib/app-queries", () => ({
  useStudentSessions: () => ({ data: sessions }),
}));

vi.mock("@/components/student/StudentMonthlySessionLookup", () => ({
  StudentMonthlyDateSelect: () => <select aria-label="날짜" />,
  StudentMonthlySessionLookup: ({ sessions: visibleSessions }: { sessions: typeof sessions }) => (
    <div data-testid="my-question-session-options">
      {visibleSessions.map((session) => (
        <span key={session.id} data-testid={`session-${session.id}`}>
          {session.topic}
        </span>
      ))}
    </div>
  ),
}));

import { MyQuestionsView } from "@/components/student/MyQuestionsView";

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

describe("내 질문 수업 목록", () => {
  it("내 질문이 있는 칠월의 수업 탐구 질문 배포 수업도 선택 목록에 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [{
        id: "question-1",
        content: "주장을 믿으려면 어떤 근거를 살펴봐야 할까요?",
        closure: "open",
        cognitive: "conceptual",
        closureScore: 0.9,
        cognitiveScore: 0.9,
        isPublic: true,
        createdAt: "2026-07-16T09:00:00.000Z",
        likeCount: 2,
        commentCount: 1,
        comments: [],
        session: {
          id: "july-published-session",
          date: "2026-07-16",
          subject: "국어",
          topic: "주장과 근거의 적절성 판단하기",
        },
      }],
    })));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
          <ConfirmProvider>
            <MyQuestionsView />
          </ConfirmProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("session-july-published-session")).toHaveTextContent(
      "주장과 근거의 적절성 판단하기",
    );
    expect(screen.getByTestId("session-august-direct-session")).toHaveTextContent(
      "질문을 만들며 글 읽기",
    );
  });
});
