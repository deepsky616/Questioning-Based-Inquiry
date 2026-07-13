// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { TeacherQuestionPageNavigation } from "@/app/(teacher)/teacher-questions/TeacherQuestionPageNavigation";

const labels = {
  previous: "이전 질문 페이지",
  next: "다음 질문 페이지",
  status: (page: number, totalPages: number, total: number) =>
    `${page} / ${totalPages} 페이지 · 총 ${total}개`,
};

describe("TeacherQuestionPageNavigation", () => {
  it("앞뒤 페이지로 이동하고 현재 위치를 보여 준다", () => {
    const onPageChange = vi.fn();
    render(
      <TeacherQuestionPageNavigation
        page={2}
        totalPages={3}
        total={61}
        onPageChange={onPageChange}
        labels={labels}
      />,
    );

    expect(screen.getByText("2 / 3 페이지 · 총 61개")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: labels.previous }));
    fireEvent.click(screen.getByRole("button", { name: labels.next }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("첫 페이지에서는 이전 단추를 비활성화한다", () => {
    render(
      <TeacherQuestionPageNavigation
        page={1}
        totalPages={2}
        total={31}
        onPageChange={vi.fn()}
        labels={labels}
      />,
    );

    expect(screen.getByRole("button", { name: labels.previous })).toBeDisabled();
    expect(screen.getByRole("button", { name: labels.next })).toBeEnabled();
  });
});
