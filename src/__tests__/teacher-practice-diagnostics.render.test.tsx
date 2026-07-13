// @vitest-environment jsdom

import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import TeacherPracticePage from "@/app/(teacher)/teacher-practice/page";
import { TeacherQuestionLearningGuide } from "@/components/teacher/TeacherQuestionLearningGuide";
import ko from "../../messages/ko.json";

const { practiceProps, queryState, refetch, replace, searchState } = vi.hoisted(() => ({
  practiceProps: { current: undefined as undefined | Record<string, unknown> },
  queryState: { current: {} as Record<string, unknown> },
  refetch: vi.fn(),
  replace: vi.fn(),
  searchState: { current: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(searchState.current),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryState.current,
}));

vi.mock("@/components/shared/QuestionPracticeView", () => ({
  QuestionPracticeView: (props: Record<string, unknown>) => {
    practiceProps.current = props;
    return <div data-testid="question-practice-view" />;
  },
}));

vi.mock("@/components/shared/QuestionLearningSummary", () => ({
  QuestionLearningSummary: () => <div data-testid="question-learning-summary" />,
}));

vi.mock("@/components/teacher/PracticeBankManager", () => ({
  PracticeBankManager: () => <div data-testid="practice-bank-manager" />,
}));

const summary = {
  activityAttempts: 9,
  diagnosticAttempts: 8,
  overall: { attempts: 8, correct: 5, accuracy: 63 },
  modes: {
    quiz: { attempts: 6, correct: 4, accuracy: 67 },
    transform: { attempts: 2, correct: 1, accuracy: 50 },
    create: { attempts: 0, correct: 0, accuracy: null },
  },
  types: {
    closed: { attempts: 3, correct: 2, accuracy: 67 },
    open: { attempts: 2, correct: 1, accuracy: 50 },
    factual: { attempts: 3, correct: 2, accuracy: 67 },
    conceptual: { attempts: 0, correct: 0, accuracy: null },
    controversial: { attempts: 0, correct: 0, accuracy: null },
  },
  unknownTypeAttempts: 0,
  recommendation: {
    kind: "focus" as const,
    tab: "quiz" as const,
    quizMode: "closure" as const,
    focus: "open" as const,
  },
};

const students = [
  {
    id: "s1",
    name: "가학생",
    grade: "4",
    className: "1",
    studentNumber: "2",
    todayPoints: 4,
    weekPoints: 7,
    quizCount: 2,
    transformCount: 1,
    createCount: 0,
    ...summary,
    activityAttempts: 5,
    diagnosticAttempts: 4,
    overall: { attempts: 4, correct: 3, accuracy: 75 },
    capped: false,
  },
];

function pageElement() {
  return (
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      <TeacherPracticePage />
    </NextIntlClientProvider>
  );
}

function renderPage() {
  return render(pageElement());
}

function renderTeachingGuide() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      <TeacherQuestionLearningGuide titleRef={createRef<HTMLHeadingElement>()} onBack={() => {}} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  searchState.current = "view=stats";
  practiceProps.current = undefined;
  refetch.mockReset();
  replace.mockReset();
  queryState.current = {
    isLoading: false,
    isError: false,
    data: { summary, students },
    refetch,
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

afterEach(cleanup);

describe("교사 학급 연습 진단", () => {
  it("학급 요약을 표시하고 학생 한 행을 펼쳐 모드와 유형별 진단을 보여 준다", () => {
    renderPage();

    expect(screen.getByText("학급 정답률")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getAllByText("열린 질문 표본이 더 필요해요")).toHaveLength(2);
    expect(screen.queryByText("가장 약한 유형: 열린 질문")).not.toBeInTheDocument();
    const studentButton = screen.getByRole("button", { name: /가학생/ });
    expect(studentButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(studentButton);

    expect(studentButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("연습 모드별 정답률")).toBeVisible();
    expect(screen.getByText("사고 유형별 정답률")).toBeVisible();
  });

  it("불러오기 오류를 빈 자료보다 먼저 알리고 다시 시도한다", () => {
    queryState.current = {
      isLoading: false,
      isError: true,
      data: { summary: { ...summary, activityAttempts: 0 }, students: [] },
      refetch,
    };

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.getByRole("alert")).toHaveTextContent("학급 연습 진단을 불러오지 못했어요");
    expect(screen.queryByText("담당 학생이 없어요")).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("학생이 없으면 같은 통계 보기 안에서 빈 상태를 표시한다", () => {
    queryState.current = {
      isLoading: false,
      isError: false,
      data: { summary: { ...summary, activityAttempts: 0 }, students: [] },
      refetch,
    };

    renderPage();

    expect(screen.getByText("담당 학생이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "학생 연습 현황" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("표본 없는 선택 유형에서 미리보기, 학생 주소 복사, 문항 은행 관리를 나눈다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "개념적 질문" }));

    expect(screen.getByRole("link", { name: "내장 연습 미리보기" })).toHaveAttribute(
      "href",
      "/teacher-practice?view=try&tab=quiz&quizMode=cognitive&focus=conceptual",
    );
    expect(screen.getByRole("link", { name: "문항 은행 관리" })).toHaveAttribute(
      "href",
      "/teacher-practice?view=bank",
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 학생용 주소 복사" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining(
          "/student-practice?tab=quiz&quizMode=cognitive&focus=conceptual",
        ),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("학생용 연습 주소를 복사했어요");
  });

  it("학생 주소 복사 실패를 화면에 알린다", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "개념적 질문" }));

    fireEvent.click(screen.getByRole("button", { name: "전체 학생용 주소 복사" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "학생용 연습 주소를 복사하지 못했어요",
    );
  });

  it("바깥 직접 해보기와 안쪽 집중 선택을 주소에서 따로 읽는다", () => {
    searchState.current = "view=try&tab=quiz&quizMode=cognitive&focus=conceptual";

    renderPage();

    expect(screen.getByRole("tab", { name: "직접 해보기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(practiceProps.current).toMatchObject({
      audience: "teacher",
      initialSelection: {
        tab: "quiz",
        quizMode: "cognitive",
        focus: "conceptual",
      },
    });
  });

  it("바깥 보기 탭을 바꾸면 안쪽 선택을 보존해 주소도 맞춘다", () => {
    searchState.current = "view=stats&tab=quiz&quizMode=cognitive&focus=conceptual";
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: "문항 은행" }));

    expect(screen.getByRole("tab", { name: "문항 은행" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(replace).toHaveBeenCalledWith(
      "/teacher-practice?view=bank&tab=quiz&quizMode=cognitive&focus=conceptual",
      { scroll: false },
    );
  });

  it("통계 주소의 초점을 유형 필터로 소비하고 주소만 바뀌어도 맞춘다", async () => {
    const view = renderPage();
    expect(screen.getByRole("button", { name: "전체 유형" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    searchState.current = "view=stats&tab=quiz&quizMode=cognitive&focus=conceptual";
    view.rerender(pageElement());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "개념적 질문" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("link", { name: "내장 연습 미리보기" })).toHaveAttribute(
      "href",
      "/teacher-practice?view=try&tab=quiz&quizMode=cognitive&focus=conceptual",
    );
  });

  it("초점이 있는 수업 활용 항목을 공통 선택 주소의 학급 통계로 연결한다", () => {
    renderTeachingGuide();

    const article = screen.getByRole("heading", { name: "개념적 질문" }).closest("article");
    expect(article).not.toBeNull();
    expect(within(article as HTMLElement).getByRole("link", { name: "학급 진단 보기" })).toHaveAttribute(
      "href",
      "/teacher-practice?view=stats&tab=quiz&quizMode=cognitive&focus=conceptual",
    );
  });
});
