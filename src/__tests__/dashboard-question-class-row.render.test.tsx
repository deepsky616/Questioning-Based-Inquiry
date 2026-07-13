// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { DashboardQuestionClassRow } from "@/components/shared/DashboardQuestionClassRow";

const labels = {
  empty: "예정 질문수업 없음",
  loading: "질문수업 일정을 불러오는 중입니다.",
  error: "질문수업 일정을 불러오지 못했습니다.",
  retry: "질문수업 일정 다시 불러오기",
  expand: "질문수업 목록 펼치기",
  collapse: "질문수업 목록 접기",
};

const summary = {
  id: "session-1",
  label: "오늘 질문수업",
  countLabel: "2개",
  detail: "과학 · 물질의 변화",
  href: "/student-ask?sessionId=session-1",
};

const choices = [
  summary,
  {
    id: "session-2",
    label: "사회",
    countLabel: "질문 완료",
    detail: "지역의 변화",
    href: "/student-ask?sessionId=session-2",
  },
];

describe("DashboardQuestionClassRow", () => {
  it("수업이 하나면 요약 행에서 바로 선택한다", () => {
    const onSelect = vi.fn();
    render(
      <DashboardQuestionClassRow
        status="ready"
        item={summary}
        choices={[summary]}
        onSelect={onSelect}
        onRetry={vi.fn()}
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByTestId("dashboard-question-class-row"));
    expect(onSelect).toHaveBeenCalledWith(summary);
  });

  it("수업이 여러 개면 목록을 펼친 뒤 고른 수업을 전달한다", () => {
    const onSelect = vi.fn();
    render(
      <DashboardQuestionClassRow
        status="ready"
        item={summary}
        choices={choices}
        onSelect={onSelect}
        onRetry={vi.fn()}
        labels={labels}
      />,
    );

    const summaryRow = screen.getByTestId("dashboard-question-class-row");
    expect(summaryRow).toHaveAttribute("aria-expanded", "false");
    expect(summaryRow).toHaveAccessibleName(new RegExp(labels.expand));
    fireEvent.click(summaryRow);

    expect(onSelect).not.toHaveBeenCalled();
    expect(summaryRow).toHaveAttribute("aria-expanded", "true");
    expect(summaryRow).toHaveAccessibleName(new RegExp(labels.collapse));
    fireEvent.click(screen.getByRole("button", { name: /사회.*지역의 변화.*질문 완료/ }));

    expect(onSelect).toHaveBeenCalledWith(choices[1]);
    expect(summaryRow).toHaveAttribute("aria-expanded", "false");
  });

  it("일정 선택지가 바뀌면 펼친 목록을 접는다", () => {
    const view = render(
      <DashboardQuestionClassRow
        status="ready"
        item={summary}
        choices={choices}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        labels={labels}
      />,
    );
    fireEvent.click(screen.getByTestId("dashboard-question-class-row"));
    expect(screen.getByText("지역의 변화")).toBeVisible();

    const nextSummary = { ...summary, detail: "영어 · 이야기" };
    view.rerender(
      <DashboardQuestionClassRow
        status="ready"
        item={nextSummary}
        choices={[nextSummary, { ...choices[1], detail: "다른 이야기" }]}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("dashboard-question-class-row")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("다른 이야기")).not.toBeInTheDocument();
  });
});
