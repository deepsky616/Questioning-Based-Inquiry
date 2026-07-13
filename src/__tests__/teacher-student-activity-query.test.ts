// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

import { useTeacherStudentActivity } from "@/lib/app-queries";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 13, 23, 59));
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ activity: [] }),
  });
  mocks.useQuery.mockReset();
  global.fetch = mocks.fetch as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
});

describe("교사 학생 활동 조회 날짜", () => {
  it("자정이 지나면 조회 키와 요청 날짜를 같은 새 날짜로 바꾼다", async () => {
    renderHook(() => useTeacherStudentActivity());
    const initialOptions = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };

    expect(initialOptions.queryKey).toEqual([
      "teacher-students",
      "activity",
      "2026-07-13",
    ]);
    await initialOptions.queryFn();
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/api/teacher/students?view=activity&today=2026-07-13",
    );

    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    const nextOptions = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };

    expect(nextOptions.queryKey).toEqual([
      "teacher-students",
      "activity",
      "2026-07-14",
    ]);
    await nextOptions.queryFn();
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/api/teacher/students?view=activity&today=2026-07-14",
    );
  });
});
