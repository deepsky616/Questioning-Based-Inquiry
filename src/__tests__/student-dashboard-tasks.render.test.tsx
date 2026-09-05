// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { StudentDashboardTasksCard } from "@/app/(student)/student-dashboard/StudentDashboardTasksCard";
import type { DashboardQuestionClassRowProps } from "@/components/shared/DashboardQuestionClassRow";

afterEach(cleanup);
const schedule: DashboardQuestionClassRowProps = {
  status: "ready",
  item: { id: "수업1", label: "오늘 질문수업", countLabel: "질문 필요 1개", detail: "날씨", href: "/student-ask" },
  onSelect: vi.fn(), onRetry: vi.fn(),
  labels: { empty: "수업이 없어요", loading: "불러오는 중", error: "불러오지 못했어요", retry: "다시 시도" },
};

describe("오늘 할 일 안내", () => {
  it("오늘 수업이 있으면 할 일이 없다는 안내를 함께 표시하지 않는다", () => {
    render(<StudentDashboardTasksCard status="ready" taskItems={[]} onTaskClick={vi.fn()} onRetry={vi.fn()} schedule={schedule} />);
    expect(screen.getByText("질문 필요 1개")).toBeVisible();
    expect(screen.queryByText("지금 할 일이 없어요")).not.toBeInTheDocument();
  });

  it("수업과 요청이 모두 없을 때만 완료 안내를 보여준다", () => {
    render(<StudentDashboardTasksCard status="ready" taskItems={[]} onTaskClick={vi.fn()} onRetry={vi.fn()} schedule={{ ...schedule, item: null }} />);
    expect(screen.getByText("지금 할 일이 없어요")).toBeVisible();
  });
});
