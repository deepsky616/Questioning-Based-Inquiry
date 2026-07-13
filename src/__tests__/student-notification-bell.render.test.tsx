// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { MouseEventHandler, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentNotificationBell } from "@/components/student/StudentNotificationBell";

const state = vi.hoisted(() => ({
  notifications: [] as Array<Record<string, unknown>>,
  unreadCount: 0,
  isLoading: false,
  isError: false,
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));
const popoverState = vi.hoisted(() => ({
  open: undefined as boolean | undefined,
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
}));

vi.mock("@/lib/app-notifications", () => ({
  appNotificationQueryKeys: { student: ["student-app-notifications"] },
  notificationMetadataText: () => null,
  useAppNotifications: () => state,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    title: "알림",
    empty: "새 알림이 없어요",
    unread: "새 알림",
    markAllRead: "모두 읽음",
    savedSection: "새 알림",
    loading: "알림을 불러오는 중입니다.",
    loadError: "알림을 불러오지 못했습니다.",
  })[key] ?? key,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    popoverState.open = open;
    popoverState.onOpenChange = onOpenChange;
    return <div data-testid="student-notification-popover" data-open={String(open)}>{children}</div>;
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div onClick={() => popoverState.onOpenChange?.(true)}>{children}</div>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("학생 알림 종", () => {
  beforeEach(() => {
    state.notifications = [];
    state.unreadCount = 0;
    state.isLoading = false;
    state.isError = false;
    popoverState.open = undefined;
    popoverState.onOpenChange = undefined;
  });

  afterEach(cleanup);

  it("조회 실패를 빈 알림으로 표시하지 않는다", () => {
    state.isError = true;

    render(<StudentNotificationBell />);

    expect(screen.getByRole("alert")).toHaveTextContent("알림을 불러오지 못했습니다.");
    expect(screen.queryByText("새 알림이 없어요")).not.toBeInTheDocument();
  });

  it("읽지 않은 알림이 없으면 배지를 숨기고 저장된 알림 연결은 유지한다", () => {
    state.notifications = [{
      id: "notice-1",
      type: "NOTICE",
      title: "수업 안내",
      message: "과학 질문수업을 확인하세요",
      href: "/student-ask?sessionId=session-1",
      readAt: "2026-07-13T01:00:00.000Z",
      createdAt: "2026-07-13T00:00:00.000Z",
    }];

    render(<StudentNotificationBell />);

    expect(screen.getByRole("button", { name: "알림" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /과학 질문수업을 확인하세요/ })).toHaveAttribute(
      "href",
      "/student-ask?sessionId=session-1",
    );
  });

  it("알림 연결을 누르면 열린 알림 창을 닫는다", () => {
    state.notifications = [{
      id: "notice-1",
      type: "NOTICE",
      title: "수업 안내",
      message: "과학 질문수업을 확인하세요",
      href: "/student-ask?sessionId=session-1",
      readAt: null,
      createdAt: "2026-07-13T00:00:00.000Z",
    }];
    state.unreadCount = 1;
    render(<StudentNotificationBell />);

    fireEvent.click(screen.getByRole("button", { name: "알림: 새 알림 1" }));
    expect(screen.getByTestId("student-notification-popover")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByRole("link", { name: /과학 질문수업을 확인하세요/ }));
    expect(screen.getByTestId("student-notification-popover")).toHaveAttribute("data-open", "false");
  });
});
