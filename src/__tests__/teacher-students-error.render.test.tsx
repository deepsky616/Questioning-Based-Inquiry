// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import StudentsPage from "@/app/(teacher)/teacher-students/page";

const queryState = vi.hoisted(() => ({
  directoryError: false,
  activityError: false,
  directoryRefetch: vi.fn(),
  activityRefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/app-queries", () => ({
  appQueryKeys: { teacherStudents: ["teacher-students"] },
  mergeTeacherStudentActivity: () => [],
  useTeacherStudentDirectory: () => ({
    data: { students: [], teacherClasses: [] },
    isLoading: false,
    isError: queryState.directoryError,
    refetch: queryState.directoryRefetch,
  }),
  useTeacherStudentActivity: () => ({
    data: { activity: [] },
    isLoading: false,
    isError: queryState.activityError,
    refetch: queryState.activityRefetch,
  }),
}));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
        <StudentsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  queryState.directoryError = false;
  queryState.activityError = false;
  queryState.directoryRefetch.mockReset();
  queryState.activityRefetch.mockReset();
});

describe("학생 관리 자료 실패 표시", () => {
  it.each([
    ["명단", "directoryError"],
    ["활동", "activityError"],
  ] as const)("%s 자료만 실패해도 오류와 다시 불러오기를 보여준다", (_, key) => {
    queryState[key] = true;
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      ko.students.filterActivityLoadError,
    );
    expect(screen.queryByText(ko.students.emptyTitle)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: ko.students.filterActivityRetry,
    }));
    expect(queryState.directoryRefetch).toHaveBeenCalledTimes(1);
    expect(queryState.activityRefetch).toHaveBeenCalledTimes(1);
  });
});
