// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/teacher/NotificationBell";

const testState = vi.hoisted(() => ({
  flagged: {
    data: { total: 4, questions: 3, comments: 1 },
    isLoading: false,
    isError: false,
  },
  pending: {
    data: { count: 3 },
    isLoading: false,
    isError: false,
  },
  saved: {
    notifications: [
      {
        id: "saved-1",
        type: "NOTICE",
        title: "저장 알림",
        message: "새 질문수업 안내",
        href: "/teacher-sessions",
        sessionId: null,
        metadata: null,
        readAt: null,
        createdAt: "2026-07-13T00:00:00.000Z",
      },
    ],
    unreadCount: 2,
    isLoading: false,
    isError: false,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly string[] }) =>
    options.queryKey.at(-1) === "flagged" ? testState.flagged : testState.pending,
}));

vi.mock("@/lib/app-notifications", () => ({
  appNotificationQueryKeys: { teacher: ["teacher-app-notifications"] },
  useAppNotifications: () => testState.saved,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const labels: Record<string, string> = {
      title: "알림",
      empty: "새 알림이 없어요",
      flaggedItem: "부적절 의심 질문과 댓글",
      pendingItem: "추천 포인트 검토 대기",
      unread: "새 알림",
      markAllRead: "모두 읽음",
      tasksSection: "확인할 작업",
      savedSection: "새 알림",
      taskLoading: "확인할 작업을 불러오는 중입니다.",
      taskLoadError: "확인할 작업을 불러오지 못했습니다.",
      loading: "알림을 불러오는 중입니다.",
      loadError: "알림을 불러오지 못했습니다.",
      newFlagged: "새 부적절 의심 항목",
      tapToView: "확인하기",
    };
    const translate = (key: string) => labels[key] ?? key;
    translate.rich = (key: string) => labels[key] ?? key;
    return translate;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("교사 알림 종", () => {
  beforeEach(() => {
    testState.flagged = {
      data: { total: 4, questions: 3, comments: 1 },
      isLoading: false,
      isError: false,
    };
    testState.pending = {
      data: { count: 3 },
      isLoading: false,
      isError: false,
    };
    testState.saved = {
      notifications: [
        {
          id: "saved-1",
          type: "NOTICE",
          title: "저장 알림",
          message: "새 질문수업 안내",
          href: "/teacher-sessions",
          sessionId: null,
          metadata: null,
          readAt: null,
          createdAt: "2026-07-13T00:00:00.000Z",
        },
      ],
      unreadCount: 2,
      isLoading: false,
      isError: false,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    };
  });

  afterEach(cleanup);

  it("저장된 새 알림만 배지에 세고 작업과 새 알림을 구역으로 나눈다", () => {
    render(<NotificationBell />);

    const bell = screen.getByRole("button", { name: "알림: 새 알림 2" });
    expect(bell).toBeInTheDocument();
    const badge = screen.getByText("2");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("9")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "확인할 작업" })).toBeInTheDocument();
    const savedSectionHeader = screen.getByRole("heading", { name: "새 알림" }).parentElement;
    expect(savedSectionHeader).not.toBeNull();
    const markAllButton = within(savedSectionHeader as HTMLElement).getByRole("button", {
      name: "모두 읽음",
    });
    expect(screen.getByText("부적절 의심 질문과 댓글")).toBeInTheDocument();
    expect(screen.getByText("추천 포인트 검토 대기")).toBeInTheDocument();
    expect(screen.getByText("새 질문수업 안내")).toBeInTheDocument();

    fireEvent.click(markAllButton);
    expect(testState.saved.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("확인할 작업 수가 0이어도 두 작업 바로가기를 유지한다", () => {
    testState.flagged.data = { total: 0, questions: 0, comments: 0 };
    testState.pending.data = { count: 0 };
    testState.saved.notifications = [];
    testState.saved.unreadCount = 0;

    render(<NotificationBell />);

    expect(screen.getByRole("button", { name: "알림" })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /부적절 의심 질문과 댓글/ })).toHaveAttribute(
      "href",
      "/teacher-questions?flagged=1",
    );
    expect(screen.getByRole("link", { name: /추천 포인트 검토 대기/ })).toHaveAttribute(
      "href",
      "/teacher-points?tab=points",
    );
    expect(screen.getByText("새 알림이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모두 읽음" })).not.toBeInTheDocument();
  });

  it("조회 중과 실패를 0건이나 빈 알림으로 표시하지 않는다", () => {
    testState.flagged.data = undefined as never;
    testState.flagged.isLoading = true;
    testState.pending.data = undefined as never;
    testState.pending.isLoading = true;
    testState.saved.notifications = [];
    testState.saved.unreadCount = 0;
    testState.saved.isError = true;

    render(<NotificationBell />);

    expect(screen.getByRole("status", { name: "확인할 작업을 불러오는 중입니다." })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("알림을 불러오지 못했습니다.");
    expect(screen.queryByText("새 알림이 없어요")).not.toBeInTheDocument();
  });
});
