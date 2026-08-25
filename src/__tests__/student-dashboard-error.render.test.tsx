// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudentDashboardPage from "@/app/(student)/student-dashboard/page";

const state = vi.hoisted(() => ({
  refetch: vi.fn(),
  mode: "error" as "error" | "success",
  questions: [] as Array<{
    id: string;
    content: string;
    closure: "closed" | "open";
    cognitive: "factual" | "conceptual" | "controversial";
  }>,
}));

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
    recentTitle: "최근 질문",
    recentDesc: "내가 작성한 최근 질문 목록입니다",
    empty: "아직 질문이 없어요",
    emptyDesc: "첫 질문을 작성해 보세요!",
    viewAllMine: "내 질문 전체 보기",
    writeFirst: "첫 질문 작성하기",
    questionSummaryLoadError: "질문 통계를 불러오지 못했습니다.",
    questionSummaryRetry: "질문 통계 다시 불러오기",
  })[key] ?? key,
}));
vi.mock("@/lib/app-queries", () => ({
  useStudentQuestionSummary: () => state.mode === "error"
    ? {
        data: undefined,
        isLoading: false,
        isError: true,
        isSuccess: false,
        refetch: state.refetch,
      }
    : {
        data: {
          recent: state.questions,
          stats: {
            total: state.questions.length,
            byClosure: { closed: state.questions.length, open: 0 },
            byCognitive: { factual: state.questions.length, conceptual: 0, controversial: 0 },
          },
          answeredSessionIds: [],
        },
        isLoading: false,
        isError: false,
        isSuccess: true,
        refetch: state.refetch,
      },
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

describe("학생 대시보드 질문 요약", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    state.mode = "error";
    state.questions = [];
  });

  it("조회 실패를 질문 0건과 구분하고 다시 불러온다", () => {
    render(<StudentDashboardPage />);

    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("질문 통계를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "질문 통계 다시 불러오기" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("총 질문 수는 지표만 표시하고 최근 질문에서 내 질문 전체 목록으로 이동한다", () => {
    state.mode = "success";
    state.questions = [{
      id: "question-1",
      content: "하늘은 왜 파란가요?",
      closure: "open",
      cognitive: "conceptual",
    }];

    const { container } = render(<StudentDashboardPage />);
    const summary = container.querySelector(".student-dashboard-question-summary");

    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(summary as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "내 질문 전체 보기" })).toHaveAttribute(
      "href",
      "/student-questions?tab=mine",
    );
  });

  it("질문이 없으면 빈 내 질문 목록 대신 첫 질문 작성으로 이동한다", () => {
    state.mode = "success";

    render(<StudentDashboardPage />);

    expect(screen.getByRole("link", { name: "첫 질문 작성하기" })).toHaveAttribute("href", "/student-ask");
    expect(screen.queryByRole("link", { name: "내 질문 전체 보기" })).not.toBeInTheDocument();
  });
});
