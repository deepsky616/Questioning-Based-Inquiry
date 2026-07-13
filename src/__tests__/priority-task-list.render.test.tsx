// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { PriorityTaskList } from "@/components/shared/PriorityTaskList";
import { TeacherTodayTasksCard } from "@/app/(teacher)/teacher-dashboard/TeacherTodayTasksCard";

const teacherLabels = {
  title: "우선 확인",
  description: "처리가 필요한 항목만 보여줍니다.",
  done: "우선 확인할 일이 없습니다",
  loading: "확인할 일을 불러오는 중입니다.",
  error: "일부 확인 항목을 불러오지 못했습니다.",
  retry: "다시 불러오기",
};

describe("PriorityTaskList", () => {
  it("우선순위 순서대로 최대 세 항목만 보여 준다", () => {
    render(
      <PriorityTaskList
        items={[
          { key: "flagged", label: "부적절 의심 활동", countLabel: "3건" },
          { key: "points", label: "검토할 추천 포인트", countLabel: "2건" },
          { key: "attention", label: "지도가 필요한 학생", countLabel: "5명" },
          { key: "hidden", label: "숨길 항목", countLabel: "1건" },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByText("숨길 항목")).not.toBeInTheDocument();
  });

  it("행 전체를 선택하면 해당 항목을 전달한다", () => {
    const onSelect = vi.fn();
    const item = {
      key: "attention",
      label: "지도가 필요한 학생",
      countLabel: "5명",
      detail: "전체 담당 학급",
    };

    render(<PriorityTaskList items={[item]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /지도가 필요한 학생.*5명/ }));

    expect(onSelect).toHaveBeenCalledWith(item);
  });
});

describe("TeacherTodayTasksCard", () => {
  it("모든 자료가 준비된 뒤에만 완료 문구를 보여 준다", () => {
    const props = {
      taskItems: [],
      onTaskClick: vi.fn(),
      onRetry: vi.fn(),
      labels: teacherLabels,
    };
    const view = render(<TeacherTodayTasksCard {...props} status="loading" />);

    expect(screen.queryByText(teacherLabels.done)).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: teacherLabels.loading })).toBeInTheDocument();

    view.rerender(<TeacherTodayTasksCard {...props} status="ready" />);
    expect(screen.getByText(teacherLabels.done)).toBeInTheDocument();
  });

  it("오류 상태에서 다시 불러오기를 실행한다", () => {
    const onRetry = vi.fn();
    render(
      <TeacherTodayTasksCard
        taskItems={[]}
        status="error"
        onTaskClick={vi.fn()}
        onRetry={onRetry}
        labels={teacherLabels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: teacherLabels.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
