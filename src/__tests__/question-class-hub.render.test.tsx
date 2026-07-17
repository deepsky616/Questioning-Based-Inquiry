// @vitest-environment jsdom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import { TeacherQuestionClassActions } from "@/app/(teacher)/teacher-sessions/TeacherQuestionClassActions";
import { QuestionClassWorkspaceNav } from "@/app/(teacher)/teacher-sessions/QuestionClassWorkspaceNav";
import { TeacherSessionMonthList } from "@/app/(teacher)/teacher-sessions/TeacherSessionMonthList";
import { TeacherSessionRow } from "@/app/(teacher)/teacher-sessions/TeacherSessionRow";
import type {
  QuestionSession,
  TeacherSessionForm,
} from "@/app/(teacher)/teacher-sessions/types";
import { appQueryKeys } from "@/lib/app-queries";

const toastSpy = vi.hoisted(() => vi.fn());
const routerReplaceSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceSpy }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => vi.fn(),
}));

vi.mock("@/app/(teacher)/teacher-sessions/TeacherSessionCreateCard", () => ({
  TeacherSessionCreateCard: ({
    form,
    setForm,
    onCreate,
  }: {
    form: TeacherSessionForm;
    setForm: (updater: (previous: TeacherSessionForm) => TeacherSessionForm) => void;
    onCreate: () => void;
  }) => (
    <div data-testid="quick-create-form">
      <input
        aria-label="주제"
        value={form.topic}
        onChange={(event) =>
          setForm((previous) => ({ ...previous, topic: event.target.value }))
        }
      />
      <button
        type="button"
        onClick={() =>
          setForm(() => ({
            targetClassValue: "class:5:1",
            selectedStudentIds: ["student-1"],
            date: "2026-07-20",
            subject: "과학",
            topic: "별의 움직임",
            defaultQuestionPublic: false,
            likesVisibleToPeers: true,
            commentsVisibleToPeers: false,
            isActive: true,
          }))
        }
      >
        시험 자료 채우기
      </button>
      <button type="button" onClick={onCreate}>
        간단 수업 저장
      </button>
    </div>
  ),
}));

const students = [
  {
    id: "student-1",
    name: "학생",
    grade: "5",
    className: "1",
    studentNumber: "1",
  },
];
const teacherClasses = [{ grade: "5", className: "1" }];

function makeSession(overrides: Partial<QuestionSession> = {}): QuestionSession {
  return {
    id: "session-1",
    date: "2020-01-10",
    subject: "과학",
    topic: "지난 수업",
    teacher: { name: "교사" },
    defaultQuestionPublic: true,
    likesVisibleToPeers: true,
    commentsVisibleToPeers: true,
    isActive: true,
    ...overrides,
  };
}

function renderWithProviders(children: ReactNode, queryClient = new QueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    ),
  };
}

function renderActions(queryClient = new QueryClient()) {
  const onHighlight = vi.fn();
  const view = renderWithProviders(
    <TeacherQuestionClassActions
      students={students}
      teacherClasses={teacherClasses}
      onHighlight={onHighlight}
    />,
    queryClient,
  );
  return { ...view, onHighlight };
}

beforeEach(() => {
  toastSpy.mockReset();
  routerReplaceSpy.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("질문수업 상단 행동", () => {
  it("세 작업공간을 모두 표시하고 현재 화면을 알린다", () => {
    renderWithProviders(<QuestionClassWorkspaceNav activeView="inquiry" />);

    expect(screen.getByRole("link", { name: ko.sessions.listViewTitle })).toHaveAttribute(
      "href",
      "/teacher-sessions",
    );
    expect(screen.getByRole("link", { name: ko.sessions.createInquiryQuestionClass })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: ko.sessions.createQuickQuestionClass })).toHaveAttribute(
      "href",
      "/teacher-sessions?view=quick",
    );
  });

  it("간단 만들기 양식을 별도 화면 본문으로 바로 표시한다", () => {
    renderActions();

    expect(screen.getByTestId("quick-create-form")).toBeInTheDocument();
  });

  it("저장 실패와 식별값 없는 응답에서 입력과 양식을 보존한다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "시험 자료 채우기" }));
    fireEvent.click(screen.getByRole("button", { name: "간단 수업 저장" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("quick-create-form")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "주제" })).toHaveValue("별의 움직임");

    fireEvent.click(screen.getByRole("button", { name: "간단 수업 저장" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId("quick-create-form")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "주제" })).toHaveValue("별의 움직임");
  });

  it("유효한 성공에서만 캐시를 갱신하고 새 수업이 선택된 목록으로 이동한다", async () => {
    const created = makeSession({
      id: "created-session",
      date: "2026-07-20",
      topic: "별의 움직임",
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(created), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const queryClient = new QueryClient();
    queryClient.setQueryData<QuestionSession[]>(appQueryKeys.teacherSessions, [
      makeSession({ id: "created-session", topic: "이전 임시 자료" }),
      makeSession({ id: "old-session" }),
    ]);
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const { onHighlight } = renderActions(queryClient);

    fireEvent.click(screen.getByRole("button", { name: "시험 자료 채우기" }));
    fireEvent.click(screen.getByRole("button", { name: "간단 수업 저장" }));

    await waitFor(() => expect(routerReplaceSpy).toHaveBeenCalledWith(
      "/teacher-sessions?session=created-session",
    ));
    const cached = queryClient.getQueryData<QuestionSession[]>(appQueryKeys.teacherSessions) ?? [];
    expect(cached.filter((session) => session.id === created.id)).toHaveLength(1);
    expect(cached.find((session) => session.id === created.id)?.topic).toBe("별의 움직임");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: appQueryKeys.teacherSessions });
    expect(onHighlight).toHaveBeenCalledWith(created.id);

    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      date: "2026-07-20",
      subject: "과학",
      topic: "별의 움직임",
      targetClassValue: "class:5:1",
      selectedStudentIds: ["student-1"],
      defaultQuestionPublic: false,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: false,
      isActive: true,
      targetType: "CLASS",
      targetGrade: "5",
      targetClassName: "1",
      targetStudentIds: ["student-1"],
    });
  });
});

const rowHandlers = {
  onDelete: vi.fn(),
  onToggleActive: vi.fn(),
  onTogglePublic: vi.fn(),
  onToggleLikes: vi.fn(),
  onToggleCommentsVisible: vi.fn(),
  onEditSave: vi.fn(async () => true),
};

describe("질문수업 행 강조와 종류", () => {
  it("지난 수업이 강조 대상이면 해당 월을 펼치고 행으로 이동한다", async () => {
    const session = makeSession();
    renderWithProviders(
      <TeacherSessionMonthList
        groups={[{ key: "2020-01", label: "2020-01", sessions: [session] }]}
        collapsible
        highlightSessionId={session.id}
        {...rowHandlers}
      />,
    );

    expect(screen.getByRole("button", { name: /2020-01/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(ko.sessions.badgeQuickQuestionClass)).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("공유 질문 유무와 상관없이 설계 식별값만으로 두 배지를 나눈다", () => {
    const inquiry = makeSession({
      id: "inquiry",
      unitDesignId: "design-1",
      sharedQuestions: [{ type: "FACTUAL", content: "질문" }],
    });
    const view = renderWithProviders(
      <TeacherSessionRow session={inquiry} isHighlighted={false} {...rowHandlers} />,
    );
    expect(screen.getByText(ko.sessions.badgeInquiryQuestionClass)).toBeInTheDocument();
    expect(screen.queryByText(ko.sessions.badgeQuickQuestionClass)).not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
          <TeacherSessionRow
            session={makeSession({ id: "quick", unitDesignId: null })}
            isHighlighted={false}
            {...rowHandlers}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText(ko.sessions.badgeQuickQuestionClass)).toBeInTheDocument();
    expect(screen.queryByText(ko.sessions.badgeInquiryQuestionClass)).not.toBeInTheDocument();
  });
});
