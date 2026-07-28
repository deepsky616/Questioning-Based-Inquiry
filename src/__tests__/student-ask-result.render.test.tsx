// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { createRef, StrictMode, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AskPage from "@/app/(student)/student-ask/page";
import { StudentAskInputCard } from "@/app/(student)/student-ask/StudentAskInputCard";
import { StudentAskResultCard } from "@/app/(student)/student-ask/StudentAskResultCard";
import type { ClassificationResult } from "@/app/(student)/student-ask/types";
import ko from "../../messages/ko.json";

const appState = vi.hoisted(() => ({
  search: "",
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  questionSummaryRefetch: vi.fn(),
  existingQuestionRefetch: vi.fn(),
  sessions: [
    {
      id: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "날씨",
      teacher: { name: "선생님" },
      sharedQuestions: [],
      defaultQuestionPublic: false,
    },
    {
      id: "session-2",
      date: "2026-07-14",
      subject: "사회",
      topic: "지역",
      teacher: { name: "선생님" },
      sharedQuestions: [],
      defaultQuestionPublic: false,
    },
  ],
  notifications: [] as Array<{
    id: string;
    type: string;
    sessionId: string | null;
    readAt: string | null;
  }>,
  unreadSessionReminders: undefined as
    | Array<{ id: string; sessionId: string | null; href: string | null }>
    | undefined,
  notificationIsLoading: false,
  notificationIsError: false,
  notificationIsSuccess: true,
  questionSummary: {
    recent: [],
    stats: {
      total: 0,
      byClosure: { closed: 0, open: 0 },
      byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
    },
    answeredSessionIds: [] as string[],
  },
  questionSummaryIsError: false,
  questionSummaryIsSuccess: true,
  existingQuestion: null as { id: string; content: string } | null,
  existingQuestionIsLoading: false,
  existingQuestionIsError: false,
}));

const queryClientState = vi.hoisted(() => ({
  cancelQueries: vi.fn(() => Promise.resolve()),
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: appState.routerPush, replace: appState.routerReplace }),
  useSearchParams: () => new URLSearchParams(appState.search),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: {} }),
}));

vi.mock("@/lib/auth-helpers", () => ({
  getSessionUser: () => ({ id: "student-1" }),
}));

vi.mock("@/lib/app-queries", () => ({
  appQueryKeys: {
    studentQuestionSummary: (userId: string) => ["student-question-summary", userId],
    studentSessionQuestion: (userId: string, sessionId: string) =>
      ["student-session-question", userId, sessionId],
  },
  useStudentSessions: () => ({
    data: appState.sessions,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useStudentQuestionSummary: () => ({
    data: appState.questionSummary,
    isError: appState.questionSummaryIsError,
    isSuccess: appState.questionSummaryIsSuccess,
    refetch: appState.questionSummaryRefetch,
  }),
  useStudentSessionQuestion: () => ({
    data: { existingQuestion: appState.existingQuestion },
    isLoading: appState.existingQuestionIsLoading,
    isError: appState.existingQuestionIsError,
    refetch: appState.existingQuestionRefetch,
  }),
}));

vi.mock("@/lib/app-notifications", () => ({
  appNotificationQueryKeys: {
    student: ["student-notifications"],
  },
  useAppNotifications: () => ({
    data: appState.unreadSessionReminders === undefined
      ? undefined
      : { unreadSessionReminders: appState.unreadSessionReminders },
    notifications: appState.notifications,
    unreadSessionReminders: appState.unreadSessionReminders ?? [],
    isLoading: appState.notificationIsLoading,
    isError: appState.notificationIsError,
    isSuccess: appState.notificationIsSuccess,
    refetch: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientState,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
      {ui}
    </NextIntlClientProvider>,
  );
}

const result: ClassificationResult = {
  closure: "open",
  cognitive: "conceptual",
  closureScore: 0.9,
  cognitiveScore: 0.8,
  reasoning: "여러 원인의 관계를 생각하게 합니다.",
  feedback: "원인과 결과를 더 구체적으로 연결해 보세요.",
  improvedExample: "기온과 습도는 비가 내리는 과정에 어떤 영향을 줄까요?",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  appState.search = "";
  appState.sessions = [
    {
      id: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "날씨",
      teacher: { name: "선생님" },
      sharedQuestions: [],
      defaultQuestionPublic: false,
    },
    {
      id: "session-2",
      date: "2026-07-14",
      subject: "사회",
      topic: "지역",
      teacher: { name: "선생님" },
      sharedQuestions: [],
      defaultQuestionPublic: false,
    },
  ];
  appState.notifications = [];
  appState.unreadSessionReminders = undefined;
  appState.notificationIsLoading = false;
  appState.notificationIsError = false;
  appState.notificationIsSuccess = true;
  appState.questionSummary.answeredSessionIds = [];
  appState.questionSummaryIsError = false;
  appState.questionSummaryIsSuccess = true;
  appState.existingQuestion = null;
  appState.existingQuestionIsLoading = false;
  appState.existingQuestionIsError = false;
});

describe("학생 질문 분석 결과", () => {
  it("주소로 연 수업 뒤 학생이 직접 고른 수업을 다시 덮지 않고 주소를 맞춘다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.search = "sessionId=session-2";
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response),
    ));

    renderWithIntl(<StrictMode><AskPage /></StrictMode>);
    const sessionSelect = await screen.findByLabelText(/질문수업 선택/);
    await waitFor(() => expect(sessionSelect).toHaveValue("session-2"));
    expect(appState.routerReplace).not.toHaveBeenCalled();

    fireEvent.change(sessionSelect, { target: { value: "session-1" } });

    await waitFor(() => expect(sessionSelect).toHaveValue("session-1"));
    expect(appState.routerReplace).toHaveBeenCalledWith(
      "/student-ask?sessionId=session-1",
      { scroll: false },
    );
  });

  it("주소의 수업이 없으면 첫 수업을 고르고 올바른 주소로 바꾼다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.search = "sessionId=missing-session";
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response),
    ));

    renderWithIntl(<AskPage />);

    expect(await screen.findByLabelText(/질문수업 선택/)).toHaveValue("session-1");
    await waitFor(() => expect(appState.routerReplace).toHaveBeenCalledWith(
      "/student-ask?sessionId=session-1",
      { scroll: false },
    ));
  });

  it("질문 작성 상태를 불러오지 못하면 진행률을 미작성으로 표시하지 않고 다시 시도한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.questionSummaryIsError = true;
    appState.questionSummaryIsSuccess = false;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response),
    ));

    renderWithIntl(<AskPage />);

    expect(await screen.findByText("작성한 질문 상태를 불러오지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText(/작성 완료/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/질문수업 선택/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(appState.questionSummaryRefetch).toHaveBeenCalledTimes(1);
  });

  it("선택한 수업의 기존 질문 조회가 실패하면 구분된 안내와 다시 시도를 제공한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.existingQuestionIsError = true;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response),
    ));

    renderWithIntl(<AskPage />);

    expect(await screen.findByText("이 수업에 작성한 질문을 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(appState.existingQuestionRefetch).toHaveBeenCalledTimes(1);
  });

  it("수업을 빠르게 바꿔도 늦게 온 이전 수업 참고 자료로 덮이지 않는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.sessions = appState.sessions.map((session, index) => ({
      ...session,
      unitDesignId: `design-${index + 1}`,
    }));
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const firstContext = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const secondContext = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/sessions/session-1/design-context") return firstContext;
      if (url === "/api/sessions/session-2/design-context") return secondContext;
      return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
    }));

    renderWithIntl(<AskPage />);
    const sessionSelect = await screen.findByLabelText(/질문수업 선택/);
    await waitFor(() => expect(sessionSelect).toHaveValue("session-1"));
    fireEvent.change(sessionSelect, { target: { value: "session-2" } });
    await waitFor(() => expect(sessionSelect).toHaveValue("session-2"));

    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({ context: { title: "둘째 참고 자료" } }),
      } as Response);
      await secondContext;
    });
    expect(await screen.findByText("둘째 참고 자료")).toBeInTheDocument();

    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({ context: { title: "첫째 참고 자료" } }),
      } as Response);
      await firstContext;
    });
    expect(screen.getByText("둘째 참고 자료")).toBeInTheDocument();
    expect(screen.queryByText("첫째 참고 자료")).not.toBeInTheDocument();
  });

  it("배포된 수업 탐구 질문을 단원 설계 참고자료의 네 번째 영역에 표시한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.sessions = [
      {
        id: "session-1",
        date: "2026-07-13",
        subject: "과학",
        topic: "물의 상태 변화",
        teacher: { name: "선생님" },
        unitDesignId: "design-1",
        sharedQuestions: [
          {
            type: "conceptual",
            content: "물의 모습이 달라져도 같은 물질이라고 할 수 있을까요?",
            contentGroup: "공통 성질",
            priority: 2,
          },
          {
            type: "factual",
            content: "얼음이 녹을 때 어떤 변화가 나타날까요?",
            contentGroup: "변화 관찰",
            priority: 1,
          },
        ],
        defaultQuestionPublic: false,
      },
    ] as never;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/sessions/session-1/design-context") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            context: {
              title: "물의 모습과 변화를 알아보아요",
              subject: "과학",
              gradeRange: "3-4",
              grade: "4",
              area: "물질",
              coreIdea: "물은 온도에 따라 상태가 달라질 수 있습니다.",
              achievements: [{
                code: "[4과10-02]",
                content: "물의 상태가 변할 때 나타나는 모습을 관찰할 수 있습니다.",
              }],
              coreSentences: ["물은 얼고 녹으며 모습이 달라집니다."],
              essentialQuestions: ["물의 상태 변화는 생활과 어떻게 이어질까요?"],
              learningGuides: {
                achievements: [{
                  index: 0,
                  explanation: "물이 얼고 녹거나 수증기로 바뀔 때 달라지는 모습을 살펴보는 목표예요.",
                }],
                coreSentences: [],
                essentialQuestions: [],
              },
              inquiryQuestions: [
                {
                  type: "controversial",
                  content: "처음 단원 설계에 저장된 질문입니다.",
                },
              ],
            },
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ configured: true }),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithIntl(<AskPage />);

    expect(await screen.findByText("물의 모습과 변화를 알아보아요")).toBeInTheDocument();
    expect(screen.getByText("물은 온도에 따라 상태가 달라질 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText("[4과10-02]")).toBeInTheDocument();
    expect(screen.getByText("물의 상태가 변할 때 나타나는 모습을 관찰할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByText(
      "물이 얼고 녹거나 수증기로 바뀔 때 달라지는 모습을 살펴보는 목표예요.",
    )).toBeInTheDocument();
    expect(screen.getByText("물은 얼고 녹으며 모습이 달라집니다.")).toBeInTheDocument();
    expect(screen.getByText("물의 상태 변화는 생활과 어떻게 이어질까요?")).toBeInTheDocument();
    expect(screen.getByText("변화 관찰")).toBeInTheDocument();
    expect(screen.getByText("공통 성질")).toBeInTheDocument();
    expect(screen.getByText("얼음이 녹을 때 어떤 변화가 나타날까요?")).toBeInTheDocument();
    expect(screen.getByText("물의 모습이 달라져도 같은 물질이라고 할 수 있을까요?")).toBeInTheDocument();
    expect(screen.queryByText("처음 단원 설계에 저장된 질문입니다.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-1/design-context");

    const coreIdea = container.querySelector('[data-design-reference-section="core-idea"]');
    const achievement = container.querySelector('[data-design-reference-section="achievement"]');
    const coreSentence = container.querySelector('[data-design-reference-section="core-sentence"]');
    expect(coreIdea?.compareDocumentPosition(achievement as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(achievement?.compareDocumentPosition(coreSentence as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(achievement).toHaveClass(
      "border-teal-200/80",
      "bg-teal-50/70",
      "dark:border-teal-800/60",
      "dark:bg-teal-950/20",
    );
    for (const [name, number] of [
      ["core-idea", "1"],
      ["achievement", "2"],
      ["core-sentence", "3"],
      ["essential-question", "4"],
      ["inquiry-question", "5"],
    ] as const) {
      expect(
        container
          .querySelector(`[data-design-reference-section="${name}"]`)
          ?.querySelector("[data-design-reference-number]"),
      ).toHaveTextContent(number);
    }
  });

  it("저장 전에 기존 질문 조회를 취소하고 기존 질문과 요약 캐시를 함께 갱신한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/classify") {
        return Promise.resolve({ ok: true, json: async () => result } as Response);
      }
      if (url === "/api/questions" && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ id: "saved-1", awardedPoints: 2 }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
    }));

    renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    fireEvent.change(input, { target: { value: "저장할 질문입니다" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 분석하기" }));
    await screen.findByText("분석 결과");
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));

    const existingKey = ["student-session-question", "student-1", "session-1"];
    await waitFor(() => expect(queryClientState.cancelQueries).toHaveBeenCalledWith({ queryKey: existingKey }));
    expect(queryClientState.setQueryData).toHaveBeenCalledWith(existingKey, {
      existingQuestion: { id: "saved-1", content: "저장할 질문입니다" },
    });
    const summaryCall = queryClientState.setQueryData.mock.calls.find(
      ([queryKey]) => JSON.stringify(queryKey) === JSON.stringify(["student-question-summary", "student-1"]),
    );
    expect(summaryCall).toBeDefined();
    const updateSummary = summaryCall?.[1] as (previous: typeof appState.questionSummary) => typeof appState.questionSummary;
    expect(updateSummary(appState.questionSummary).answeredSessionIds).toContain("session-1");
    expect(queryClientState.cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      queryClientState.setQueryData.mock.invocationCallOrder[0],
    );
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["points-card"] });
  });

  it.each([
    ["오늘", "today-unasked", 0],
    ["지난", "past-unasked", -1],
  ])("%s 미작성 범위가 준비된 뒤 교사 요청 수업을 제외한다", async (_label, taskScope, dayOffset) => {
    Element.prototype.scrollIntoView = vi.fn();
    const sessionDate = new Date();
    sessionDate.setDate(sessionDate.getDate() + dayOffset);
    const sessionDateText = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, "0")}-${String(sessionDate.getDate()).padStart(2, "0")}`;
    appState.search = `task=${taskScope}`;
    appState.sessions = [
      {
        id: "requested-session",
        date: sessionDateText,
        subject: "과학",
        topic: "요청 수업",
        teacher: { name: "선생님" },
        sharedQuestions: [],
        defaultQuestionPublic: false,
      },
      {
        id: "regular-session",
        date: sessionDateText,
        subject: "사회",
        topic: "일반 수업",
        teacher: { name: "선생님" },
        sharedQuestions: [],
        defaultQuestionPublic: false,
      },
    ];
    appState.notifications = [];
    appState.unreadSessionReminders = [
      {
        id: "request-1",
        sessionId: "requested-session",
        href: "/student-ask?sessionId=requested-session",
      },
    ];
    appState.notificationIsLoading = true;
    appState.notificationIsSuccess = false;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/config") {
        return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }));

    const view = renderWithIntl(<AskPage />);
    expect(screen.getByText("질문수업 확인 중...")).toBeInTheDocument();
    expect(screen.queryAllByText("요청 수업")).toHaveLength(0);
    expect(screen.queryAllByText("일반 수업")).toHaveLength(0);

    appState.notificationIsLoading = false;
    appState.notificationIsSuccess = true;
    view.rerender(
      <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
        <AskPage />
      </NextIntlClientProvider>,
    );

    expect((await screen.findAllByText("일반 수업")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("요청 수업")).toHaveLength(0);
    expect(screen.getByText("전체 1개 중 0개 작성 완료, 1개 남음")).toBeInTheDocument();
  });

  it("전체 수업 보기에서 기존 검색어도 함께 지운다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.search = "task=past-unasked";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    appState.sessions = [{
      id: "past-session",
      date: `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`,
      subject: "과학",
      topic: "날씨",
      teacher: { name: "선생님" },
      sharedQuestions: [],
      defaultQuestionPublic: false,
    }];
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response),
    ));

    renderWithIntl(<AskPage />);
    const searchInput = await screen.findByRole("searchbox", { name: "주제·교과 검색" });
    fireEvent.change(searchInput, { target: { value: "날씨" } });
    expect(searchInput).toHaveValue("날씨");

    fireEvent.click(screen.getByRole("button", { name: "전체 수업 보기" }));

    expect(searchInput).toHaveValue("");
  });

  it("저장 뒤 다른 수업을 선택할 때 기존 검색어도 함께 지운다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/classify") {
        return Promise.resolve({ ok: true, json: async () => result } as Response);
      }
      if (url === "/api/questions" && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ id: "saved-1" }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
    }));

    renderWithIntl(<AskPage />);
    const searchInput = await screen.findByRole("searchbox", { name: "주제·교과 검색" });
    fireEvent.change(searchInput, { target: { value: "날씨" } });
    const input = screen.getByLabelText("질문");
    fireEvent.change(input, { target: { value: "저장할 질문입니다" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 분석하기" }));
    await screen.findByText("분석 결과");
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));
    await screen.findByText("질문이 저장되었습니다");

    fireEvent.click(screen.getByRole("button", { name: "다른 수업 선택하기" }));

    expect(searchInput).toHaveValue("");
  });

  it("최근 놓친 수업 범위에서 30일보다 오래된 수업은 제외한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    appState.search = "task=past-unasked";
    appState.sessions = [
      {
        id: "recent-session",
        date: dateKey(recentDate),
        subject: "과학",
        topic: "최근 수업",
        teacher: { name: "선생님" },
        sharedQuestions: [],
        defaultQuestionPublic: false,
      },
      {
        id: "old-session",
        date: dateKey(oldDate),
        subject: "사회",
        topic: "오래된 수업",
        teacher: { name: "선생님" },
        sharedQuestions: [],
        defaultQuestionPublic: false,
      },
    ];
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => [] } as Response),
    ));

    renderWithIntl(<AskPage />);

    expect((await screen.findAllByText("최근 수업")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("오래된 수업")).toHaveLength(0);
    expect(screen.getByText("전체 1개 중 0개 작성 완료, 1개 남음")).toBeInTheDocument();
  });

  it("오늘 미작성 범위에서 알림 조회가 실패하면 오류 화면을 표시한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.search = "task=today-unasked";
    appState.notificationIsError = true;
    appState.notificationIsSuccess = false;
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => [] } as Response),
    ));

    renderWithIntl(<AskPage />);

    expect(await screen.findByText("질문수업 정보를 불러오지 못했습니다. 페이지를 새로고침해 주세요.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/질문수업 선택/)).not.toBeInTheDocument();
  });

  it("수정된 질문에는 이전 피드백을 남기고 저장을 막으며 개선 예시를 전달한다", () => {
    const onRewrite = vi.fn();
    const onUseImprovedExample = vi.fn();
    const onSave = vi.fn();

    renderWithIntl(
      <StudentAskResultCard
        result={result}
        analyzedContent="왜 비가 올까요?"
        analysisCurrent={false}
        saveComplete={false}
        isSaving={false}
        onRewrite={onRewrite}
        onUseImprovedExample={onUseImprovedExample}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(result.feedback!)).toBeInTheDocument();
    expect(screen.getByText("수정한 질문을 다시 분석해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "예시를 초안으로 사용" }));
    expect(onUseImprovedExample).toHaveBeenCalledWith(result.improvedExample);
  });

  it("추천 질문 영역에 어두운 테마용 고대비 글자색을 적용한다", () => {
    renderWithIntl(
      <StudentAskResultCard
        result={result}
        analyzedContent="왜 비가 올까요?"
        analysisCurrent
        saveComplete={false}
        isSaving={false}
        onRewrite={() => {}}
        onUseImprovedExample={() => {}}
        onSave={() => {}}
      />,
    );

    expect(screen.getByText("이렇게 바꿔보면 어떨까요?")).toHaveClass(
      "dark:text-green-200",
    );
    expect(screen.getByText((text) => text.includes(result.improvedExample!))).toHaveClass(
      "dark:text-green-100",
    );
    expect(
      screen.getByText("이 질문을 참고해서 더 깊이 생각할 수 있는 질문을 만들어보세요!"),
    ).toHaveClass("dark:text-green-300");
  });

  it("인공지능 분석이면 완료 상태만 보여주고 분석 모델은 숨긴다", () => {
    renderWithIntl(
      <StudentAskResultCard
        result={{
          ...result,
          analysisSource: "ai",
          analysisModel: "gemini-2.5-flash",
        }}
        analyzedContent="왜 비가 올까요?"
        analysisCurrent
        saveComplete={false}
        isSaving={false}
        onRewrite={() => {}}
        onUseImprovedExample={() => {}}
        onSave={() => {}}
      />,
    );

    expect(screen.getByText("인공지능 질문 분석 완료")).toBeInTheDocument();
    expect(
      screen.queryByText("분석 모델: gemini-2.5-flash"),
    ).not.toBeInTheDocument();
  });

  it("기본 분석이면 인공지능 분석이 아님을 분명하게 안내한다", () => {
    renderWithIntl(
      <StudentAskResultCard
        result={{
          ...result,
          analysisSource: "fallback",
          fallbackReason: "busy",
        }}
        analyzedContent="왜 비가 올까요?"
        analysisCurrent
        saveComplete={false}
        isSaving={false}
        onRewrite={() => {}}
        onUseImprovedExample={() => {}}
        onSave={() => {}}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "인공지능 분석을 사용할 수 없어 기본 분석 결과를 보여드려요. 잠시 후 다시 분석해 주세요.",
    );
    expect(screen.queryByText("인공지능 질문 분석 완료")).not.toBeInTheDocument();
  });

  it.each(["busy", "invalid-response"] as const)(
    "일시적인 %s 기본 분석은 한 번 자동 재시도해 인공지능 결과로 복구한다",
    async (fallbackReason) => {
      Element.prototype.scrollIntoView = vi.fn();
      let classifyAttempts = 0;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        if (String(input) === "/api/classify") {
          classifyAttempts += 1;
          const responseBody = classifyAttempts === 1
            ? { ...result, analysisSource: "fallback", fallbackReason }
            : {
                ...result,
                analysisSource: "ai",
                analysisModel: "gemini-2.5-flash",
              };
          return Promise.resolve({
            ok: true,
            json: async () => responseBody,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ configured: true }),
        } as Response);
      });
      vi.stubGlobal("fetch", fetchMock);

      renderWithIntl(<AskPage />);
      const input = await screen.findByLabelText("질문");
      fireEvent.change(input, { target: { value: "광합성에 필요한 것은 무엇인가요?" } });
      fireEvent.click(screen.getByRole("button", { name: "질문 분석하기" }));

      expect(
        await screen.findByText("인공지능 질문 분석 완료", {}, { timeout: 3_000 }),
      ).toBeInTheDocument();
      expect(classifyAttempts).toBe(2);
      expect(screen.queryByText(
        "인공지능 분석을 사용할 수 없어 기본 분석 결과를 보여드려요. 잠시 후 다시 분석해 주세요.",
      )).not.toBeInTheDocument();
    },
  );

  it("키 누락처럼 기다려도 해결되지 않는 기본 분석은 자동 재시도하지 않는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    let classifyAttempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/classify") {
        classifyAttempts += 1;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...result,
            analysisSource: "fallback",
            fallbackReason: "missing-key",
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ configured: true }),
      } as Response);
    }));

    renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    fireEvent.change(input, { target: { value: "광합성에 필요한 것은 무엇인가요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 분석하기" }));

    expect(await screen.findByText(
      "인공지능 분석을 사용할 수 없어 기본 분석 결과를 보여드려요. 잠시 후 다시 분석해 주세요.",
    )).toBeInTheDocument();
    expect(classifyAttempts).toBe(1);
  });

  it("이전 분석이 있으면 입력 카드의 기본 행동을 다시 분석으로 표시한다", () => {
    renderWithIntl(
      <StudentAskInputCard
        sessionSelector={<div />}
        referencePanel={<div />}
        selectedSession={null}
        flowSteps={[]}
        currentStep={3}
        existingQuestion={null}
        isCheckingExisting={false}
        content="왜 비가 올까요?"
        textareaRef={createRef<HTMLTextAreaElement>()}
        canAsk
        isLoading={false}
        hasAnalysis
        onContentChange={() => {}}
        onAnalyze={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "다시 분석" })).toBeInTheDocument();
  });

  it("분석 요청 뒤 본문을 고치면 늦게 온 결과를 요청 당시 본문과 묶는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    let resolveClassification!: (response: Response) => void;
    const delayedClassification = new Promise<Response>((resolve) => {
      resolveClassification = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/classify") return delayedClassification;
      if (url === "/api/config") {
        return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }));

    renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    fireEvent.change(input, { target: { value: "처음 분석을 요청한 질문입니다" } });
    const analyzeButton = screen.getByRole("button", { name: "질문 분석하기" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    fireEvent.click(analyzeButton);

    fireEvent.change(input, { target: { value: "요청 뒤에 고친 질문입니다" } });
    await act(async () => {
      resolveClassification({
        ok: true,
        json: async () => result,
      } as Response);
      await delayedClassification;
    });

    expect(input).toHaveValue("요청 뒤에 고친 질문입니다");
    expect(screen.getByText("분석 결과")).toBeInTheDocument();
    expect(screen.getByText("처음 분석을 요청한 질문입니다")).toBeInTheDocument();
    expect(screen.getByText("수정한 질문을 다시 분석해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();
  });

  it("저장 요청 뒤 본문을 고치면 이전 저장 완료를 현재 초안에 표시하지 않는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    let resolveSave!: (response: Response) => void;
    const delayedSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/classify") {
        return Promise.resolve({ ok: true, json: async () => result } as Response);
      }
      if (url === "/api/questions" && init?.method === "POST") return delayedSave;
      if (url === "/api/config") {
        return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }));

    renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    fireEvent.change(input, { target: { value: "저장을 요청한 질문입니다" } });
    const analyzeButton = screen.getByRole("button", { name: "질문 분석하기" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    fireEvent.click(analyzeButton);
    await screen.findByText("분석 결과");
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));

    fireEvent.change(input, { target: { value: "저장 중에 고친 새 초안입니다" } });
    await act(async () => {
      resolveSave({ ok: true, json: async () => ({ id: "saved-1" }) } as Response);
      await delayedSave;
    });

    expect(input).toHaveValue("저장 중에 고친 새 초안입니다");
    expect(screen.queryByText("질문이 저장되었습니다")).not.toBeInTheDocument();
  });

  it("주소 동기화로 수업이 바뀌면 늦은 이전 수업 분석을 적용하지 않는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    appState.search = "sessionId=session-1";
    let resolveClassification!: (response: Response) => void;
    const delayedClassification = new Promise<Response>((resolve) => {
      resolveClassification = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/classify") return delayedClassification;
      if (url === "/api/config") {
        return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }));

    const view = renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    const sessionSelect = screen.getByLabelText(/질문수업 선택/);
    await waitFor(() => expect(sessionSelect).toHaveValue("session-1"));
    fireEvent.change(input, { target: { value: "어느 수업에도 같은 질문입니다" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 분석하기" }));

    appState.search = "sessionId=session-2";
    view.rerender(
      <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
        <AskPage />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(sessionSelect).toHaveValue("session-2"));
    await act(async () => {
      resolveClassification({ ok: true, json: async () => result } as Response);
      await delayedClassification;
    });

    expect(screen.queryByText("분석 결과")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "질문 저장" })).not.toBeInTheDocument();
  });
});
