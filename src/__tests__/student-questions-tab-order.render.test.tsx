// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import StudentQuestionsPage from "@/app/(student)/student-questions/page";

vi.mock("@/components/student/MyQuestionsView", () => ({
  MyQuestionsView: () => <div data-testid="mine-content" />,
}));
vi.mock("@/components/student/ExploreQuestionsView", () => ({
  ExploreQuestionsView: () => <div data-testid="explore-content" />,
}));
vi.mock("@/components/student/UnitDesignView", () => ({
  UnitDesignView: () => <div data-testid="design-content" />,
}));

afterEach(cleanup);

describe("학생 질문탐구 탭", () => {
  it("전체 탐구, 수업 탐구, 내 질문 순서로 표시하고 전체 탐구를 먼저 연다", () => {
    render(<StudentQuestionsPage />);

    const tabs = screen.getAllByRole("button");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("전체 질문 탐구");
    expect(tabs[1]).toHaveTextContent("수업 탐구 질문");
    expect(tabs[2]).toHaveTextContent("내 질문");
    expect(screen.getByTestId("explore-content")).toBeVisible();

    fireEvent.click(tabs[2]);
    expect(screen.getByTestId("mine-content")).toBeVisible();
  });
});
