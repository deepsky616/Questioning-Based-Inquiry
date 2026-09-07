// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithIntl as render } from "./test-utils/render-with-intl";
import { QuestionClassWorkspaceNav } from "@/app/(teacher)/teacher-sessions/QuestionClassWorkspaceNav";

afterEach(cleanup);

// 마우스·키보드·터치의 실제 표시 방식은 learning-design.spec.ts에서 검증한다.
describe("질문수업 만들기 안내", () => {
  it("탐구 수업 링크에 짧은 설명을 연결하고 별도의 안내 버튼을 만들지 않는다", () => {
    render(<QuestionClassWorkspaceNav activeView="list" />);
    const link = screen.getByRole("link", { name: "탐구질문으로 수업 만들기" });
    expect(link).toHaveAccessibleDescription("탐구질문을 만들거나 불러와, 학생들이 질문할 수업을 만들어요.");
    expect(link).toHaveAttribute("href", "/teacher-curriculum");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("간단 수업 링크에 준비할 항목을 안내하고 기존 이동 주소를 유지한다", () => {
    render(<QuestionClassWorkspaceNav activeView="quick" />);
    const link = screen.getByRole("link", { name: "간단 질문수업 만들기" });
    expect(link).toHaveAccessibleDescription("날짜·교과·주제를 정하고, 학생들이 질문을 올릴 수업을 빠르게 만들어요.");
    expect(link).toHaveAttribute("href", "/teacher-sessions?view=quick");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
