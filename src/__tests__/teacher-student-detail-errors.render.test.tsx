// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import { StudentDetailDialog } from "@/app/(teacher)/teacher-students/StudentDetailDialog";

const toastMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn(async () => false));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => confirmMock,
}));

const student = {
  id: "student-1",
  name: "김하늘",
  grade: "5",
  className: "2",
  studentNumber: "7",
  questionCount: 4,
  commentCount: 3,
  totalPoints: 10,
  lastActivityAt: null,
  sessionProgress: {
    total: 2,
    completed: 1,
    remaining: 1,
    percent: 50,
    actionableRemaining: 1,
  },
};

const statsBody = {
  student: {
    ...student,
    totalPoints: 10,
    questionCount: 4,
    commentCount: 3,
    likesReceived: 9,
    commentsReceived: 8,
    goodQuestions: 2,
    gamePlays: 1,
  },
  classification: {
    total: 0,
    closure: { closed: 0, open: 0 },
    cognitive: { factual: 0, conceptual: 0, controversial: 0 },
  },
  events: [],
  recentQuestions: [],
  recentComments: [],
  recentPoints: [],
  questionGames: {
    totals: { plays: 0, points: 0, goodQuestions: 0 },
    modes: {
      solo: { plays: 0, points: 0, goodQuestions: 0 },
      ai: { plays: 0, points: 0, goodQuestions: 0 },
      friend: { plays: 0, points: 0, goodQuestions: 0 },
    },
    recent: [],
  },
};

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function renderDialog(onChanged = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <StudentDetailDialog
          student={student}
          onClose={vi.fn()}
          onChanged={onChanged}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

  return { onChanged };
}

afterEach(() => {
  cleanup();
  toastMock.mockReset();
  confirmMock.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("학생 상세 자료 오류", () => {
  it("상세 통계 실패를 알리고 해당 자료만 다시 불러온다", async () => {
    let statsAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.endsWith("/stats")) {
        statsAttempts += 1;
        return statsAttempts === 1 ? response({}, false) : response(statsBody);
      }
      if (href === "/api/teacher/points/pending") return response({ pending: [] });
      throw new Error(`Unexpected request: ${href}`);
    }));

    renderDialog();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("학생 상세 활동을 불러오지 못했습니다.");
    fireEvent.click(within(alert).getByRole("button", { name: "상세 활동 다시 불러오기" }));

    await waitFor(() => {
      expect(screen.getByText(ko.students.receivedLikes).parentElement).toHaveTextContent("9");
    });
    expect(statsAttempts).toBe(2);
  });

  it("검토 대기 포인트 실패를 빈 목록과 구분하고 다시 불러온다", async () => {
    let pendingAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.endsWith("/stats")) return response(statsBody);
      if (href === "/api/teacher/points/pending") {
        pendingAttempts += 1;
        if (pendingAttempts === 1) return response({}, false);
        return response({
          pending: [{
            id: "pending-1",
            studentId: student.id,
            sessionId: null,
            bonusType: "GOOD_QUESTION",
            points: 3,
            reason: "좋은 질문",
          }],
        });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    renderDialog();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("검토 대기 포인트를 불러오지 못했습니다.");
    fireEvent.click(within(alert).getByRole("button", { name: "검토 대기 포인트 다시 불러오기" }));

    expect(await screen.findByText("AI 추천 대기 1건")).toBeInTheDocument();
    expect(pendingAttempts).toBe(2);
  });

  it("포인트 변경 실패 때 입력을 보존하고 성공한 뒤에만 초기화한다", async () => {
    let pointAttempts = 0;
    const onChanged = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input);
      if (href.endsWith("/stats")) return response(statsBody);
      if (href === "/api/teacher/points/pending") return response({ pending: [] });
      if (href === "/api/teacher/points" && init?.method === "POST") {
        pointAttempts += 1;
        return pointAttempts === 1
          ? response({ error: "포인트 변경 실패" }, false)
          : response({ ok: true });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    renderDialog(onChanged);
    await screen.findByText(ko.students.receivedLikes);

    fireEvent.click(screen.getByRole("button", { name: "+3" }));
    fireEvent.change(screen.getByPlaceholderText(ko.students.reasonPlaceholder), {
      target: { value: "수업 참여" },
    });
    fireEvent.click(screen.getByRole("button", { name: "3점 지급" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        variant: "destructive",
        description: ko.students.pointChangeFailed,
      });
    });
    expect(screen.getByPlaceholderText(ko.students.scorePlaceholder)).toHaveValue(3);
    expect(screen.getByPlaceholderText(ko.students.reasonPlaceholder)).toHaveValue("수업 참여");
    expect(onChanged).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "3점 지급" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        variant: "success",
        description: "김하늘 학생의 포인트를 변경했습니다.",
      });
    });
    expect(screen.getByPlaceholderText(ko.students.scorePlaceholder)).toHaveValue(null);
    expect(screen.getByPlaceholderText(ko.students.reasonPlaceholder)).toHaveValue("");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(pointAttempts).toBe(2);
  });

  it("상세 보기의 탭과 지표 선택 상태를 화면 읽기 도구에 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.endsWith("/stats")) return response(statsBody);
      if (href === "/api/teacher/points/pending") return response({ pending: [] });
      throw new Error(`Unexpected request: ${href}`);
    }));

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(ko.students.receivedLikes).parentElement).toHaveTextContent("9");
    });

    expect(screen.getByRole("button", { name: ko.students.periodMonth })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: ko.students.metricQuestion })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /최근 질문.*0/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("spinbutton", { name: ko.students.scoreLabel })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: ko.students.reasonLabel })).toBeInTheDocument();

    const quickPoints = screen.getByRole("button", { name: "+3" });
    const quickReason = screen.getByRole("button", { name: ko.students.presetGoodQuestion });
    expect(quickPoints).toHaveAttribute("aria-pressed", "false");
    expect(quickReason).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(quickPoints);
    fireEvent.click(quickReason);
    expect(quickPoints).toHaveAttribute("aria-pressed", "true");
    expect(quickReason).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /최근 답변.*0/ }));
    expect(screen.getByRole("button", { name: /최근 답변.*0/ })).toHaveAttribute("aria-pressed", "true");
  });
});
