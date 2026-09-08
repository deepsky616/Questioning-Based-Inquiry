// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { CommentThread } from "@/components/shared/CommentThread";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";
import ko from "../../messages/ko.json";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "s1", role: "STUDENT" } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul"><ConfirmProvider><CommentThread questionId="q1" /></ConfirmProvider></NextIntlClientProvider></QueryClientProvider>);
}
it("조회 실패를 빈 목록으로 표시하지 않고 재시도로 실제 댓글을 복구한다", async () => {
  let failed = true;
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(failed ? { error: "조회 실패" } : [{ id: "c1", content: "실제로 있는 댓글", author: { id: "s2", name: "학생2" }, createdAt: "2026-09-01T00:00:00Z" }]), { status: failed ? 503 : 200 }));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent("댓글을 불러오지 못했어요");
  expect(screen.queryByText("아직 댓글이 없습니다")).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText("실제로 있는 댓글")).toBeInTheDocument();
});
it("등록 실패를 알리고 입력을 보존하며 재등록 성공 후에만 초안을 비운다", async () => {
  let failed = true;
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? (failed ? { error: "등록 실패" } : { id: "c1", content: "내 생각", author: { id: "s1", name: "김질문" }, createdAt: "2026-09-01T00:00:00Z" }) : []), { status: init?.method === "POST" && failed ? 503 : 200 }));
  show();
  const input = await screen.findByPlaceholderText("댓글을 입력하세요...");
  fireEvent.change(input, { target: { value: "내 생각" } });
  fireEvent.click(screen.getByRole("button", { name: "등록" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("댓글을 등록하지 못했어요");
  expect(input).toHaveValue("내 생각");
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "등록" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(screen.getByText("내 생각")).toBeInTheDocument();
});
