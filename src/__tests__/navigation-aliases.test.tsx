// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import { AppNav, isNavPageActive, type NavPage } from "@/components/shared/AppNav";
import { PageNav } from "@/components/shared/PageNav";

const navigationState = vi.hoisted(() => ({ pathname: "/teacher-curriculum" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/components/shared/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/components/shared/LanguageToggle", () => ({
  LanguageToggle: () => null,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const pages: NavPage[] = [
  { href: "/teacher-dashboard", label: "대시보드" },
  { href: "/teacher-question-learning", label: "질문학습" },
  { href: "/teacher-practice", label: "질문연습" },
  {
    href: "/teacher-sessions",
    label: "질문수업",
    aliases: ["/teacher-curriculum"],
  },
  { href: "/teacher-questions", label: "질문탐구" },
  { href: "/teacher-question-play", label: "질문놀이" },
];

let availableWidth = 10_000;

class ImmediateResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe() {
    this.callback([], this as unknown as ResizeObserver);
  }

  disconnect() {}

  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ImmediateResizeObserver,
});

Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => availableWidth,
});

vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
  () =>
    ({
      bottom: 0,
      height: 40,
      left: 0,
      right: 120,
      top: 0,
      width: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect,
);

function renderWithMessages(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      {children}
    </NextIntlClientProvider>,
  );
}

function expectActive(link: HTMLElement) {
  expect(link).toHaveClass("bg-muted", "text-primary");
}

describe("내비게이션 주소 별칭", () => {
  it.each(["/teacher-settings", "/teacher-students", "/student-settings"])("%s에는 학습 단계 이동을 표시하지 않는다", (pathname) => {
    navigationState.pathname = pathname;
    const { container } = renderWithMessages(<PageNav pages={pages} />);
    expect(container).toBeEmptyDOMElement();
  });
  beforeEach(() => {
    availableWidth = 10_000;
    navigationState.pathname = "/teacher-curriculum";
  });

  it("대표 주소와 별칭의 정확한 주소 경계만 활성화한다", () => {
    const questionClassPage = pages[3];

    expect(isNavPageActive("/teacher-sessions", questionClassPage)).toBe(true);
    expect(isNavPageActive("/teacher-sessions/archive", questionClassPage)).toBe(true);
    expect(isNavPageActive("/teacher-curriculum", questionClassPage)).toBe(true);
    expect(isNavPageActive("/teacher-curriculum/steps", questionClassPage)).toBe(true);
    expect(isNavPageActive("/teacher-curriculum-extra", questionClassPage)).toBe(false);
  });

  it("넓은 화면과 모바일 메뉴에서 같은 질문수업 항목을 활성화한다", async () => {
    navigationState.pathname = "/teacher-curriculum/steps";
    renderWithMessages(
      <AppNav pages={pages} userName="교사" roleSuffix="선생님" />,
    );

    expectActive(await screen.findByRole("link", { name: "질문수업" }));

    fireEvent.click(screen.getByRole("button", { name: ko.nav.openMenu }));
    const questionClassLinks = await screen.findAllByRole("link", { name: "질문수업" });
    expect(questionClassLinks).toHaveLength(2);
    questionClassLinks.forEach(expectActive);
  });

  it("넘침 메뉴와 더보기 단추도 별칭 화면에서 활성화한다", async () => {
    availableWidth = 80;
    navigationState.pathname = "/teacher-curriculum";
    renderWithMessages(
      <AppNav pages={pages} userName="교사" roleSuffix="선생님" />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: ko.nav.more })).toBeInTheDocument());
    expectActive(screen.getByRole("button", { name: ko.nav.more }));
    expectActive(screen.getByRole("link", { name: "질문수업" }));
  });

  it("역할에 맞는 계정 설정 이름을 데스크톱과 모바일 메뉴에 표시한다", () => {
    const { unmount } = renderWithMessages(
      <AppNav
        pages={pages}
        userName="교사"
        roleSuffix="선생님"
        accountLinks={{ settingsHref: "/teacher-settings", settingsType: "settings" }}
      />,
    );

    expect(screen.getAllByRole("link", { name: ko.nav.settings })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: ko.nav.openMenu }));
    expect(screen.getAllByRole("link", { name: ko.nav.settings })).toHaveLength(2);
    unmount();

    renderWithMessages(
      <AppNav
        pages={pages}
        userName="학생"
        roleSuffix="학생"
        accountLinks={{ settingsHref: "/student-settings", settingsType: "password" }}
      />,
    );

    expect(screen.getAllByRole("link", { name: ko.nav.changePassword })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: ko.nav.openMenu }));
    expect(screen.getAllByRole("link", { name: ko.nav.changePassword })).toHaveLength(2);
  });

  it("별칭 화면을 대표 메뉴 순번으로 삼아 이전과 다음을 계산한다", () => {
    navigationState.pathname = "/teacher-curriculum/steps";
    renderWithMessages(<PageNav pages={pages} />);

    expect(screen.getByText("4 / 6")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /질문연습/ })).toHaveAttribute(
      "href",
      "/teacher-practice",
    );
    expect(screen.getByRole("link", { name: /질문탐구/ })).toHaveAttribute(
      "href",
      "/teacher-questions",
    );
  });
});
