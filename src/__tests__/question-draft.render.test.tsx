// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, type ReactNode } from "react";
import { useQuestionDraft } from "@/lib/use-question-draft";
import { clearQuestionDrafts } from "@/lib/question-draft";

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); });
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe("질문 초안 화면 수명", () => {
  it("수업을 오가거나 화면을 다시 열어도 각 수업의 초안을 보존한다", async () => {
    const first = renderHook(({ sessionId }) => useQuestionDraft("학생1", sessionId), { initialProps: { sessionId: "수업1" }, wrapper });
    act(() => first.result.current.setContent("첫 수업 질문"));
    first.rerender({ sessionId: "수업2" });
    expect(first.result.current.content).toBe("");
    act(() => first.result.current.setContent("두 번째 수업 질문"));
    first.rerender({ sessionId: "수업1" });
    await waitFor(() => expect(first.result.current.content).toBe("첫 수업 질문"));
    first.unmount();
    const reopened = renderHook(() => useQuestionDraft("학생1", "수업2"), { wrapper });
    await waitFor(() => expect(reopened.result.current.content).toBe("두 번째 수업 질문"));
    expect(reopened.result.current.draftStatus).toBe("restored");
  });

  it("저장소가 막혀도 입력과 수업 간 이동을 유지하며 저장 실패를 알린다", async () => {
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), "setItem").mockImplementation(() => { throw new Error("저장소 차단"); });
    const view = renderHook(({ sessionId }) => useQuestionDraft("학생1", sessionId), { initialProps: { sessionId: "수업1" } });
    act(() => view.result.current.setContent("보존할 질문"));
    expect(view.result.current.draftStatus).toBe("error");
    view.rerender({ sessionId: "수업2" });
    view.rerender({ sessionId: "수업1" });
    await waitFor(() => expect(view.result.current.content).toBe("보존할 질문"));
  });

  it("다른 수업을 쓰는 동안 이전 수업 제출이 끝나도 현재 초안을 보존한다", async () => {
    const view = renderHook(({ sessionId }) => useQuestionDraft("학생1", sessionId), { initialProps: { sessionId: "수업1" } });
    act(() => view.result.current.setContent("제출할 질문"));
    const finishSubmission = view.result.current.markSubmitted;
    view.rerender({ sessionId: "수업2" });
    act(() => view.result.current.setContent("새 수업 질문"));
    act(() => finishSubmission("제출할 질문"));
    expect(view.result.current.content).toBe("새 수업 질문");
    view.rerender({ sessionId: "수업1" });
    await waitFor(() => expect(view.result.current.content).toBe(""));
  });

  it("로그아웃 시 초안만 지우고 다른 저장 설정은 유지한다", () => {
    const view = renderHook(() => useQuestionDraft("학생1", "수업1"));
    act(() => view.result.current.setContent("질문"));
    window.sessionStorage.setItem("별도설정", "유지");
    clearQuestionDrafts(window.sessionStorage);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem("별도설정")).toBe("유지");
  });
});
