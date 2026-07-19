// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ token: "a".repeat(64) }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("비밀번호 재설정 화면", () => {
  it("공통 정책보다 약한 비밀번호는 서버에 보내지 않고 안내한다", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <ResetPasswordPage />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(ko.auth.newPassword), {
      target: { value: "abcdef" },
    });
    fireEvent.change(screen.getByLabelText(ko.auth.newPasswordConfirm), {
      target: { value: "abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: ko.auth.changePassword }));

    expect(screen.getByRole("alert")).toHaveTextContent("8~16자");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
