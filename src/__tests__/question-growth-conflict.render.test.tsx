// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { QuestionGrowthEditor } from "@/components/reports/QuestionGrowthEditor";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "student-1", role: "STUDENT" } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("백그라운드 재조회 후에도 작성 시작 당시 버전으로 저장하고 충돌하면 입력을 보존한다", async () => {
  let revision = 1;
  const record = () => ({ questionId: "q1", originalContent: "소금이 얼마나 녹을까?", revisedContent: "온도에 따라 녹는 양이 어떻게 달라질까?", reflection: "한 가지 조건만 바꾸어 비교해야 해요.", revision, updatedAt: "2026-09-08T00:00:00Z" });
  const response = () => ({ canEdit: true, questions: [{ id: "q1", content: "소금이 얼마나 녹을까?", session: null }], records: [record()] });
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "PUT"
    ? new Response("{}", { status: 409 })
    : new Response(JSON.stringify(response()), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderWithIntl(<QuestionGrowthEditor questionId="q1" />, { queryClient: client });
  await screen.findByRole("textbox", { name: /한 줄 돌아보기/ });
  fireEvent.change(screen.getByRole("textbox", { name: /한 줄 돌아보기/ }), { target: { value: "새롭게 고쳐 쓴 나의 질문입니다." } });
  revision = 2;
  await client.invalidateQueries({ queryKey: ["question-growth"] });
  fireEvent.click(screen.getByRole("button", { name: "성장 기록 저장" }));
  await screen.findByRole("alert");
  const saved = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({ revision: 1 });
  expect(screen.getByRole("textbox", { name: /한 줄 돌아보기/ })).toHaveValue("새롭게 고쳐 쓴 나의 질문입니다.");
  expect(screen.getByRole("button", { name: "성장 기록 저장" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "성장 기록 저장" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "성장 기록 저장" }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2));
  const retried = fetcher.mock.calls.filter(([, init]) => init?.method === "PUT").at(-1);
  expect(JSON.parse(String(retried?.[1]?.body))).toMatchObject({ revision: 2 });
});

it("빠른 돌아보기의 저장 실패 후 입력을 보존하고 배운 점을 보내지 않는다", async () => {
  let writes = 0;
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") {
      writes += 1;
      return new Response("{}", { status: writes === 1 ? 500 : 200 });
    }
    return new Response(JSON.stringify({ canEdit: true, questions: [{ id: "q1", content: "나의 질문입니다.", session: null }], records: writes >= 2 ? [{ questionId: "q1", originalContent: "나의 질문입니다.", revisedContent: "나의 질문입니다.", changeNote: "비교할 조건을 넣었어요.", reflection: "", revision: 1, updatedAt: "2026-09-08T00:00:00Z" }] : [] }));
  });
  vi.stubGlobal("fetch", fetcher);
  renderWithIntl(<QuestionGrowthEditor questionId="q1" quick />);
  const input = await screen.findByRole("textbox", { name: /한 줄 돌아보기/ });
  fireEvent.change(input, { target: { value: "비교할 조건을 넣었어요." } });
  fireEvent.click(screen.getByRole("button", { name: "성장 기록 저장" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("비교할 조건을 넣었어요.");
  fireEvent.click(screen.getByRole("button", { name: "성장 기록 저장" }));
  await screen.findByText("성장 기록을 저장했어요.");
  expect(input).toHaveValue("비교할 조건을 넣었어요.");
  const saved = fetcher.mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(saved).toHaveLength(2);
  expect(JSON.parse(String(saved[1][1]?.body))).toEqual({ questionId: "q1", revision: 0, changeNote: "비교할 조건을 넣었어요." });
  expect(screen.queryByRole("textbox", { name: /새롭게 알게 된 점/ })).not.toBeInTheDocument();
});
