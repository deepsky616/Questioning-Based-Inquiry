// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import TeacherSessionsPage from "@/app/(teacher)/teacher-sessions/page";

const queryState = vi.hoisted(() => ({
  sessions: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const navigationState = vi.hoisted(() => ({ search: "" }));
const toastMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

vi.mock("@/lib/app-queries", () => ({
  appQueryKeys: {
    teacherSessions: ["teacher-sessions"],
    teacherStudents: ["teacher-students"],
  },
  useTeacherSessions: () => ({
    data: queryState.sessions,
    isLoading: queryState.isLoading,
    isError: queryState.isError,
    refetch: queryState.refetch,
  }),
  useTeacherStudents: () => ({
    data: { students: [], teacherClasses: [] },
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("@/app/(teacher)/teacher-sessions/TeacherQuestionClassActions", () => ({
  TeacherQuestionClassActions: () => null,
}));

function renderPage() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["teacher-sessions"], queryState.sessions);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <TeacherSessionsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

afterEach(() => {
  cleanup();
  queryState.sessions = [];
  queryState.isLoading = false;
  queryState.isError = false;
  queryState.refetch.mockReset();
  toastMock.mockReset();
  confirmMock.mockReset();
  navigationState.search = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("질문수업 목록 상태", () => {
  it("조회 오류를 빈 목록으로 표시하지 않는다", () => {
    queryState.isError = true;
    renderPage();

    expect(screen.getByText(ko.sessions.loadFailedTitle)).toBeInTheDocument();
    expect(screen.queryByText(ko.sessions.emptyTitle)).not.toBeInTheDocument();
  });

  it("조회에 성공한 실제 빈 목록만 빈 상태로 표시한다", () => {
    renderPage();

    expect(screen.getByText(ko.sessions.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByText(ko.sessions.loadFailedTitle)).not.toBeInTheDocument();
  });

  it("주소 대상이 실제 목록에 나타난 뒤부터 강조 시간을 센다", () => {
    vi.useFakeTimers();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    navigationState.search = "session=late-session";
    queryState.isLoading = true;
    const view = renderPage();

    act(() => vi.advanceTimersByTime(5000));
    queryState.sessions = [{
      id: "late-session",
      date: "2020-01-10",
      subject: "과학",
      topic: "늦게 도착한 수업",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    queryState.isLoading = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
          <TeacherSessionsPage />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const highlightedRow = document.querySelector('[data-session-id="late-session"]');
    expect(highlightedRow).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /2020년 1월/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    act(() => vi.advanceTimersByTime(3999));
    expect(highlightedRow).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('[data-session-id="late-session"]')).toBeInTheDocument();
    expect(document.querySelector('[data-session-id="late-session"]')).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("button", { name: /2020년 1월/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("설정 요청이 연결 오류로 실패하면 화면 자료를 되돌리고 서버에서 다시 읽는다", async () => {
    queryState.sessions = [{
      id: "session-1",
      date: "2999-01-10",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")));
    const { queryClient } = renderPage();

    fireEvent.click(screen.getAllByRole("switch")[0]);

    await waitFor(() => expect(queryState.refetch).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData<typeof queryState.sessions>(["teacher-sessions"]))
      .toEqual(queryState.sessions);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive",
      description: ko.sessions.toggleFailed,
    }));
  });

  it("각 설정 스위치에 수업과 설정을 구분하는 이름을 제공한다", () => {
    queryState.sessions = [{
      id: "session-1",
      date: "2999-01-10",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    renderPage();

    for (const settingLabel of [
      ko.sequencePanel.activeLabel,
      ko.sequencePanel.publicLabel,
      ko.sequencePanel.likesLabel,
      ko.sequencePanel.commentsLabel,
    ]) {
      expect(screen.getByRole("switch", {
        name: `2999년 1월 10일 · 과학 · 물질의 변화 · ${settingLabel}`,
      })).toBeInTheDocument();
    }
  });

  it("설정 저장 중 같은 수업의 다른 설정과 수정을 잠근다", async () => {
    queryState.sessions = [{
      id: "session-1",
      date: "2999-01-10",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    let finishRequest!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      finishRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    for (const settingSwitch of switches) {
      expect(settingSwitch).toBeDisabled();
    }
    const editButton = screen.getByRole("button", { name: ko.common.edit });
    expect(editButton).toBeDisabled();
    const deleteButton = screen.getByRole("button", { name: ko.common.delete });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(switches[1]);
    fireEvent.click(editButton);
    fireEvent.click(deleteButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finishRequest(new Response("{}", { status: 200 }));
    await waitFor(() => expect(switches[0]).not.toBeDisabled());
  });

  it("편집 저장 중 같은 수업의 추가 저장과 설정 변경을 잠근다", async () => {
    queryState.sessions = [{
      id: "session-1",
      date: "2999-01-10",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    let finishRequest!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      finishRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: ko.common.edit }));
    fireEvent.change(screen.getByDisplayValue("물질의 변화"), {
      target: { value: "물질의 상태 변화" },
    });
    const saveButton = screen.getByRole("button", { name: ko.common.save });
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(saveButton).toBeDisabled();
    for (const settingSwitch of screen.getAllByRole("switch")) {
      expect(settingSwitch).toBeDisabled();
      fireEvent.click(settingSwitch);
    }
    fireEvent.click(saveButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finishRequest(new Response("{}", { status: 200 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: ko.common.save })).not.toBeInTheDocument());
  });

  it("설정 변경 전에 진행 중 목록 조회를 취소하고 성공 뒤 다시 읽는다", async () => {
    queryState.sessions = [{
      id: "session-1",
      date: "2999-01-10",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient } = renderPage();
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(screen.getAllByRole("switch")[0]);

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["teacher-sessions"],
    }));
    expect(cancelSpy).toHaveBeenCalledWith({
      queryKey: ["teacher-sessions"],
      exact: true,
    });
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(invalidateSpy.mock.invocationCallOrder[0]);
  });

  it("삭제도 목록 조회를 취소하고 성공 뒤 다시 읽는다", async () => {
    queryState.sessions = [{
      id: "session-1",
      date: "2999-01-10",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
      defaultQuestionPublic: true,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: true,
      isActive: true,
    }];
    confirmMock.mockResolvedValue(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient } = renderPage();
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: ko.common.delete }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["teacher-sessions"],
    }));
    expect(cancelSpy).toHaveBeenCalledWith({
      queryKey: ["teacher-sessions"],
      exact: true,
    });
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(invalidateSpy.mock.invocationCallOrder[0]);
  });
});
