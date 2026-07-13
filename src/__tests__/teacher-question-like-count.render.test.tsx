// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeacherQuestionLikeCount } from "@/app/(teacher)/teacher-questions/TeacherQuestionLikeCount";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TeacherQuestionLikeCount", () => {
  it("초점을 받을 때 좋아요 사용자 명단을 한 번만 늦게 불러온다", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ likedBy: [{ id: "student-1", name: "학생 한 명" }] }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TeacherQuestionLikeCount
        questionId="question-1"
        likeCount={2}
        likeCountLabel="2 likes"
        likedByLabel="좋아요한 학생"
      />,
    );

    const button = screen.getByRole("button", { name: "2 likes" });
    fireEvent.focus(button);
    fireEvent.mouseEnter(button);

    expect(await screen.findByText("학생 한 명")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/questions/question-1/likes");
  });

  it("좋아요 수가 바뀌면 이전 명단을 숨기고 새 명단을 다시 불러온다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ likedBy: [{ id: "student-1", name: "첫 학생" }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ likedBy: [{ id: "student-2", name: "새 학생" }] }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <TeacherQuestionLikeCount
        questionId="question-1"
        likeCount={1}
        likeCountLabel="1 like"
        likedByLabel="Students who liked"
      />,
    );

    fireEvent.focus(screen.getByRole("button", { name: "1 like" }));
    expect(await screen.findByText("첫 학생")).toBeVisible();

    view.rerender(
      <TeacherQuestionLikeCount
        questionId="question-1"
        likeCount={2}
        likeCountLabel="2 likes"
        likedByLabel="Students who liked"
      />,
    );
    expect(screen.queryByText("첫 학생")).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole("button", { name: "2 likes" }));
    expect(await screen.findByText("새 학생")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
