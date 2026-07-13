// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTeacherQuestionViewState } from "@/app/(teacher)/teacher-questions/useTeacherQuestionViewState";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

describe("교사 질문 조회 주소 훅", () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams("session=session-1&page=2");
    navigation.push.mockReset();
    navigation.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("주소를 초기 상태로 복원하고 사용자 변경은 방문 기록에 추가한다", () => {
    const { result } = renderHook(() => useTeacherQuestionViewState());

    expect(result.current.viewState.session).toBe("session-1");
    expect(result.current.viewState.page).toBe(2);

    act(() => result.current.updateViewState({ session: "session-2", page: 1 }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/teacher-questions?session=session-2",
      { scroll: false },
    );
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("입력 지연 검색은 방문 기록을 늘리지 않고 현재 주소를 교체한다", () => {
    vi.useFakeTimers();
    navigation.params = new URLSearchParams();
    const { result } = renderHook(() => useTeacherQuestionViewState());

    act(() => result.current.setSearch("  별 질문  "));
    act(() => vi.advanceTimersByTime(300));

    expect(navigation.replace).toHaveBeenCalledWith(
      "/teacher-questions?search=%EB%B3%84+%EC%A7%88%EB%AC%B8",
      { scroll: false },
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
