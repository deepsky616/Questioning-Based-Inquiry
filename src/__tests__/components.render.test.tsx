// @vitest-environment jsdom
/**
 * 공용 컴포넌트 렌더 스모크 테스트 (jsdom).
 * 큰 페이지 리팩터링의 안전망 1단계 — 핵심 공용 컴포넌트가 프롭에 따라
 * 올바른 구조(aria·글리프·타입 전환)로 렌더되는지 고정한다.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../messages/ko.json";

import { SectionToggle, CollapseChevron } from "@/components/shared/SectionToggle";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { LanguageToggle } from "@/components/shared/LanguageToggle";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SectionToggle / CollapseChevron", () => {
  it("접힘 상태는 ▸, 펼침 상태는 ▾를 표시하고 aria-expanded를 반영한다", () => {
    const { rerender } = render(<SectionToggle title="테스트 섹션" open={false} onToggle={() => {}} />);
    const btn = screen.getByRole("button", { name: /테스트 섹션/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn.textContent).toContain("▸");

    rerender(<SectionToggle title="테스트 섹션" open onToggle={() => {}} />);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn.textContent).toContain("▾");
  });

  it("클릭하면 onToggle이 호출된다", () => {
    const onToggle = vi.fn();
    render(<SectionToggle title="섹션" open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("CollapseChevron은 열림 여부에 따라 글리프가 바뀐다", () => {
    const { rerender, container } = render(<CollapseChevron open={false} />);
    expect(container.textContent).toBe("▸");
    rerender(<CollapseChevron open />);
    expect(container.textContent).toBe("▾");
  });
});

describe("PasswordInput", () => {
  it("기본은 password, 눈 버튼 클릭 시 text로 전환되고 다시 누르면 복귀한다", () => {
    renderWithIntl(<PasswordInput id="pw" placeholder="••••" />);
    const input = screen.getByPlaceholderText("••••");
    expect(input).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: ko.auth.showPassword });
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: ko.auth.hidePassword })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("LanguageToggle", () => {
  it("작은 상단에서는 아이콘 조작으로 줄고 메뉴에서는 전체 선택기를 표시한다", () => {
    const compact = renderWithIntl(<LanguageToggle />);
    const compactSelect = screen.getByRole("combobox", { name: ko.common.language });
    expect(compactSelect).toHaveAttribute("id", "lang-select");
    expect(compactSelect).toHaveClass("absolute", "opacity-0", "sm:static", "sm:opacity-100");
    compact.unmount();

    renderWithIntl(<LanguageToggle id="mobile-lang-select" compactOnMobile={false} />);
    const fullSelect = screen.getByRole("combobox", { name: ko.common.language });
    expect(fullSelect).toHaveAttribute("id", "mobile-lang-select");
    expect(fullSelect).not.toHaveClass("absolute", "opacity-0");
  });
});

describe("DesignReferenceView", () => {
  it("단원 제목·핵심 아이디어·탐구 질문을 렌더한다", () => {
    renderWithIntl(
      <DesignReferenceView
        data={{
          title: "광합성",
          sessionDate: "2026-07-07",
          subject: "과학",
          area: "생명",
          coreIdea: "식물은 빛으로 양분을 만든다",
          coreSentences: ["핵심 문장 하나"],
          essentialQuestions: ["핵심 질문 하나"],
          inquiryQuestions: [{
            type: "factual",
            content: "잎은 왜 초록색일까?",
            studentGuide: {
              meaning: "잎이 초록색으로 보이는 까닭을 확인하는 질문이에요.",
              keywords: [{ term: "엽록소", meaning: "빛을 받아들이는 초록색 물질" }],
              thinkingStart: "잎의 색과 빛의 관계를 먼저 살펴보세요.",
            },
          }],
        }}
      />,
    );
    expect(screen.getByText(/광합성/)).toBeInTheDocument();
    expect(screen.getByText(/식물은 빛으로 양분을 만든다/)).toBeInTheDocument();
    expect(screen.getByText(/잎은 왜 초록색일까\?/)).toBeInTheDocument();
    expect(screen.getByText("질문이 묻는 것")).toBeInTheDocument();
    expect(screen.getByText(/잎이 초록색으로 보이는 까닭/)).toBeInTheDocument();
    expect(screen.getByText(/엽록소/)).toBeInTheDocument();
    expect(screen.getByText("생각 시작하기")).toBeInTheDocument();
    expect(screen.getByText(/핵심 문장 하나/)).toBeInTheDocument();
  });
});
