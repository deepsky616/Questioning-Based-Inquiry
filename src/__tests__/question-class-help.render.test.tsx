// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithIntl as render } from "./test-utils/render-with-intl";
import { QuestionClassWorkspaceNav } from "@/app/(teacher)/teacher-sessions/QuestionClassWorkspaceNav";

afterEach(cleanup);

describe("질문수업 만들기 안내", () => {
  it("버튼과 안내 위에 마우스를 올려 두는 동안 설명을 읽을 수 있다", () => {
    render(<QuestionClassWorkspaceNav activeView="list" />);
    const link = screen.getByRole("link", { name: "탐구질문으로 수업 만들기" });
    expect(link).toHaveAccessibleDescription(/교육과정과 성취기준/);
    const description = document.getElementById(link.getAttribute("aria-describedby")!)!;
    expect(description).not.toBeVisible();
    fireEvent.mouseEnter(link.parentElement!);
    expect(description).toBeVisible();
    fireEvent.mouseEnter(description);
    expect(description).toBeVisible();
    fireEvent.mouseLeave(link.parentElement!);
    expect(description).not.toBeVisible();
    fireEvent.mouseEnter(link.parentElement!);
    expect(description).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(description).not.toBeVisible();
  });

  it("키보드 초점으로 설명을 열고 이스케이프 키로 닫아도 이동 링크는 유지한다", () => {
    render(<QuestionClassWorkspaceNav activeView="list" />);
    const link = screen.getByRole("link", { name: "간단 질문수업 만들기" });
    expect(link).toHaveAccessibleDescription(/바로 질문을 받을 수 있습니다/);
    const description = document.getElementById(link.getAttribute("aria-describedby")!)!;
    fireEvent.focus(link);
    expect(description).toBeVisible();
    fireEvent.keyDown(link, { key: "Escape" });
    expect(description).not.toBeVisible();
    expect(link).toHaveAttribute("href", "/teacher-sessions?view=quick");
    fireEvent.blur(link);
    fireEvent.focus(link);
    expect(description).toBeVisible();
  });
});
