// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import TeacherSessionsPage from "@/app/(teacher)/teacher-sessions/page";

const queryState = vi.hoisted(() => ({
  sessions: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const navigationState = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

vi.mock("@/lib/app-queries", () => ({
  appQueryKeys: {
    teacherSessions: ["teacher-sessions"],
    teacherStudents: ["teacher-students"],
  },
  useTeacherSessions: () => ({
    data: queryState.sessions,
    isLoading: queryState.isLoading,
    isError: queryState.isError,
    refetch: queryState.refetch,
  }),
  useTeacherStudents: () => ({
    data: { students: [], teacherClasses: [] },
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => vi.fn(),
}));

vi.mock("@/app/(teacher)/teacher-sessions/TeacherQuestionClassActions", () => ({
  TeacherQuestionClassActions: () => null,
}));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <TeacherSessionsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  queryState.sessions = [];
  queryState.isLoading = false;
  queryState.isError = false;
  queryState.refetch.mockReset();
  navigationState.search = "";
  vi.useRealTimers();
});

describe("질문수업 목록 상태", () => {
  it("조회 오류를 빈 목록으로 표시하지 않는다", () => {
    queryState.isError = true;
    renderPage();

    expect(screen.getByText(ko.sessions.loadFailedTitle)).toBeInTheDocument();
    expect(screen.queryByText(ko.sessions.emptyTitle)).not.toBeInTheDocument();
  });

  it("조회에 성공한 실제 빈 목록만 빈 상태로 표시한다", () => {
    renderPage();

    expect(screen.getByText(ko.sessions.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByText(ko.sessions.loadFailedTitle)).not.toBeInTheDocument();
  });

  it("주소 대상이 실제 목록에 나타난 뒤부터 강조 시간을 센다", () => {
    vi.useFakeTimers();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    navigationState.search = "session=late-session";
    queryState.isLoading = true;
    const view = renderPage();

    act(() => vi.advanceTimersByTime(5000));
    queryState.sessions = [{
      id: "late-session",
      date: "2020-01-10",
      subject: "과학",
      topic: "늦게 도착한 수업",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    queryState.isLoading = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
          <TeacherSessionsPage />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const highlightedRow = document.querySelector('[data-session-id="late-session"]');
    expect(highlightedRow).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /2020년 1월/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    act(() => vi.advanceTimersByTime(3999));
    expect(highlightedRow).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('[data-session-id="late-session"]')).toBeInTheDocument();
    expect(document.querySelector('[data-session-id="late-session"]')).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("button", { name: /2020년 1월/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
