// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import StudentsPage from "@/app/(teacher)/teacher-students/page";

const navigationState = vi.hoisted(() => ({
  params: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.params),
}));

const directoryStudents = [
  { id: "student-1", name: "김하늘", grade: "5", className: "2", studentNumber: "7" },
  { id: "student-2", name: "이바다", grade: "5", className: "2", studentNumber: "12" },
  { id: "student-3", name: "박누리", grade: "6", className: "1", studentNumber: "27" },
];

const activity = [
  {
    studentId: "student-1",
    questionCount: 4,
    commentCount: 3,
    totalPoints: 10,
    lastActivityAt: null,
    sessionProgress: { total: 2, completed: 1, remaining: 1, percent: 50, actionableRemaining: 1 },
  },
  {
    studentId: "student-2",
    questionCount: 1,
    commentCount: 2,
    totalPoints: 5,
    lastActivityAt: null,
    sessionProgress: { total: 2, completed: 2, remaining: 0, percent: 100, actionableRemaining: 0 },
  },
  {
    studentId: "student-3",
    questionCount: 100,
    commentCount: 100,
    totalPoints: 100,
    lastActivityAt: null,
    sessionProgress: { total: 2, completed: 0, remaining: 2, percent: 0, actionableRemaining: 2 },
  },
];

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

vi.mock("@/lib/app-queries", () => ({
  appQueryKeys: { teacherStudents: ["teacher-students"] },
  mergeTeacherStudentActivity: () => directoryStudents.map((student) => {
    const item = activity.find((row) => row.studentId === student.id);
    return { ...student, ...item };
  }),
  useTeacherStudentDirectory: () => ({
    data: {
      students: directoryStudents,
      teacherClasses: [
        { grade: "5", className: "2" },
        { grade: "6", className: "1" },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTeacherStudentActivity: () => ({
    data: { activity },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <StudentsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerenderPage: () => view.rerender(tree()), queryClient };
}

afterEach(() => {
  cleanup();
  navigationState.params = "";
  navigationState.replace.mockReset();
  vi.unstubAllGlobals();
});

describe("학생관리 표시 범위", () => {
  it("검색 입력과 결과 수를 화면 읽기 도구에 알리고 선택 상태를 노출한다", () => {
    renderPage();

    const searchInput = screen.getByRole("textbox", { name: "학생 검색" });
    expect(screen.getByRole("status")).toHaveTextContent("담당 학생 3명 기준");
    expect(screen.getByRole("button", { name: ko.students.tabList })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "5학년 2반" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: ko.students.filterRemainingSessions })).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(searchInput, { target: { value: "김하늘" } });
    expect(screen.getByRole("status")).toHaveTextContent("김하늘 검색 결과: 전체 3명 중 1명 표시");

    fireEvent.change(searchInput, { target: { value: "이바다" } });
    expect(screen.getByRole("status")).toHaveTextContent("이바다 검색 결과: 전체 3명 중 1명 표시");

    fireEvent.click(screen.getByRole("button", { name: "5학년 2반" }));
    fireEvent.click(screen.getByRole("button", { name: ko.students.filterRemainingSessions }));
    expect(screen.getByRole("button", { name: "5학년 2반" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: ko.students.filterRemainingSessions })).toHaveAttribute("aria-pressed", "true");
  });

  it("학급 필터를 적용하면 상단 요약도 현재 학생 범위로 계산한다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "5학년 2반" }));

    expect(screen.getByText("전체 3명 중 현재 2명 표시")).toBeInTheDocument();
    expect(within(screen.getByText(ko.students.allStudents).parentElement!).getByText("2명")).toBeInTheDocument();
    expect(within(screen.getAllByText(ko.students.totalQuestions)[0].parentElement!).getByText("5")).toBeInTheDocument();
    expect(within(screen.getAllByText(ko.students.totalAnswers)[0].parentElement!).getByText("5")).toBeInTheDocument();
    expect(screen.getByText(ko.students.totalPointsAvg).parentElement).toHaveTextContent(/15\s*\/\s*8/);
  });

  it.each([
    ["27", ["박누리"]],
    ["5학년 2반", ["김하늘", "이바다"]],
    ["5-2", ["김하늘", "이바다"]],
  ])("검색어 %s로 번호와 학년반을 찾는다", (query, expectedNames) => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(ko.students.searchPlaceholder), {
      target: { value: query },
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      `${query} 검색 결과: 전체 3명 중 ${expectedNames.length}명 표시`,
    );
    for (const name of expectedNames) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    for (const name of ["김하늘", "이바다", "박누리"].filter((name) => !expectedNames.includes(name))) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  });

  it("검색·학급·진도·정렬 상태를 한 번에 초기화한다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "5학년 2반" }));
    fireEvent.change(screen.getByPlaceholderText(ko.students.searchPlaceholder), {
      target: { value: "김하늘" },
    });
    fireEvent.click(screen.getByRole("button", { name: ko.students.filterRemainingSessions }));
    fireEvent.click(screen.getByRole("button", { name: ko.students.sortLowProgress }));
    fireEvent.click(screen.getByRole("button", { name: "검색·필터 초기화" }));

    expect(screen.getByPlaceholderText(ko.students.searchPlaceholder)).toHaveValue("");
    expect(screen.getByText("담당 학생 3명 기준")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ko.students.sortLowProgress })).toBeInTheDocument();
    for (const name of ["김하늘", "이바다", "박누리"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("대시보드에서 전달된 기간과 학급 조건도 초기화한다", () => {
    navigationState.params = "filter=noQuestions&period=month&grade=5&className=2";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ activeStudentIds: ["student-1"] }),
    })));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "검색·필터 초기화" }));

    expect(navigationState.replace).toHaveBeenCalledWith("/teacher-students");
  });

  it("활성 필터로 학생이 없으면 필터 조건 안내와 초기화 동작을 보여준다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "5학년 2반" }));
    fireEvent.change(screen.getByRole("textbox", { name: "학생 검색" }), {
      target: { value: "박누리" },
    });

    expect(screen.getByText("조건에 맞는 학생이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("적용된 검색이나 필터를 바꿔보세요")).toBeInTheDocument();
    fireEvent.click(within(screen.getByText("조건에 맞는 학생이 없습니다").parentElement!).getByRole("button", {
      name: "검색·필터 초기화",
    }));
    expect(screen.getByRole("textbox", { name: "학생 검색" })).toHaveValue("");
    expect(screen.getByText("담당 학생 3명 기준")).toBeInTheDocument();
  });

  it("질문 활동 조회 실패 뒤 주소 필터가 사라지면 전체 요약을 다시 보여준다", async () => {
    navigationState.params = "filter=noQuestions&period=month";
    vi.stubGlobal("fetch", vi.fn(async () => response({}, false)));
    const view = renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      ko.students.filterActivityLoadError,
    );

    navigationState.params = "";
    view.rerenderPage();

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("담당 학생 3명 기준");
    });
  });
});
