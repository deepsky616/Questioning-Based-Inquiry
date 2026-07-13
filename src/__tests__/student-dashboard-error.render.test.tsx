// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudentDashboardPage from "@/app/(student)/student-dashboard/page";

const state = vi.hoisted(() => ({ refetch: vi.fn() }));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: {} }) }));
vi.mock("@/lib/auth-helpers", () => ({ getSessionUser: () => ({ id: "student-1" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    "studentDashboard.title": "학생 대시보드",
    "studentDashboard.description": "학생 대시보드 설명",
    totalQuestions: "내가 작성한 총 질문 수",
    viewAll: "전체 질문 보기",
    questionSummaryLoadError: "질문 통계를 불러오지 못했습니다.",
    questionSummaryRetry: "질문 통계 다시 불러오기",
  })[key] ?? key,
}));
vi.mock("@/lib/app-queries", () => ({
  useStudentQuestionSummary: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    refetch: state.refetch,
  }),
  useStudentSessions: () => ({
    data: [],
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/app-notifications", () => ({
  appNotificationQueryKeys: { student: ["student-notifications"] },
  useAppNotifications: () => ({
    data: { unreadSessionReminders: [] },
    notifications: [],
    isError: false,
    isSuccess: true,
    markRead: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/shared/PointsCard", () => ({ default: () => <div>포인트</div> }));
vi.mock("@/components/shared/PageHeader", () => ({ PageHeader: () => <div /> }));
vi.mock("@/components/shared/DashboardSkeleton", () => ({ DashboardSkeleton: () => <div>불러오는 중</div> }));
vi.mock("@/components/shared/StatBar", () => ({ StatBar: () => <div /> }));
vi.mock("@/components/shared/ClassificationDonut", () => ({ ClassificationDonut: () => <div /> }));
vi.mock("@/components/reports/StudentReportView", () => ({ StudentReportView: () => <div /> }));
vi.mock("@/app/(student)/student-dashboard/StudentDashboardTasksCard", () => ({
  StudentDashboardTasksCard: () => <div>지금 할 일</div>,
}));

describe("학생 대시보드 질문 요약 오류", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("조회 실패를 질문 0건과 구분하고 다시 불러온다", () => {
    render(<StudentDashboardPage />);

    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("질문 통계를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "질문 통계 다시 불러오기" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
});
