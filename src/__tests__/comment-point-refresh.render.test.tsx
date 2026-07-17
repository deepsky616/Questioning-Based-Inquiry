// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import ko from "../../messages/ko.json";
import { CommentThread } from "@/components/shared/CommentThread";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "student-2", role: "STUDENT", name: "학생" } },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("답변 점수 화면 갱신", () => {
  it("친구 질문 답변으로 점수를 받으면 포인트 카드 자료를 즉시 새로고침한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "comment-new",
      content: "좋은 질문이에요",
      createdAt: "2026-07-16T00:00:00.000Z",
      author: { id: "student-2", name: "학생" },
      awardedPoints: 1,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
          <ConfirmProvider>
            <CommentThread questionId="question-1" preloaded={[]} />
          </ConfirmProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("댓글을 입력하세요..."), {
      target: { value: "좋은 질문이에요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await screen.findByText("좋은 질문이에요");
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["points-card"] });
    });
  });
});
