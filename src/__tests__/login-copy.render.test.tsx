// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import LoginPage from "@/app/(auth)/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("로그인 화면 소개 문구", () => {
  it("교사와 학생 모두를 포괄하는 제목과 설명을 보여준다", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <LoginPage />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "질문으로 함께 배우는 교실" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("교사와 학생이 질문하고 탐구하며 함께 성장하는 배움 공간"),
    ).toBeInTheDocument();
    expect(screen.queryByText("질문기반 탐구수업 웹앱")).not.toBeInTheDocument();
  });
});
