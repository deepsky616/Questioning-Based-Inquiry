// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { QuestionGrowthJournal } from "@/components/reports/QuestionGrowthJournal";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "s1", role: "STUDENT" } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const record = { questionId: "q1", originalContent: "소금이 녹을까?", revisedContent: "물의 온도에 따라 소금이 녹는 양은 어떻게 달라질까?", reflection: "온도를 같게 하고 비교해야 해요.", revision: 1, updatedAt: "2026-09-08T00:00:00Z", question: { session: { id: "science-1", date: "2026-09-01", subject: "과학", topic: "용해와 용액" } } };
const response = (records = [record]) => ({ canEdit: true, records, pageInfo: { page: 1, pageSize: 8, total: records.length, totalPages: 1 }, summary: { total: 1, complete: 1, pending: 0 } });
it("목록에서 수업과 작성 상태를 확인하고 기록을 펼쳐 해당 질문의 이어쓰기로 연결한다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response()))));
  renderWithIntl(<QuestionGrowthJournal />);
  const summary = await screen.findByText(record.revisedContent, { exact: true, selector: "summary p" });
  expect(screen.getByText(/용해와 용액/)).toBeInTheDocument();
  expect(screen.getByText(record.reflection)).not.toBeVisible();
  fireEvent.click(summary.closest("summary")!);
  expect(screen.getByText(record.reflection)).toBeVisible();
  expect(screen.getByRole("link", { name: /성장 기록 이어쓰기/ })).toHaveAttribute("href", "/student-questions?tab=mine&growth=q1");
});
it("검색 결과가 없어도 검색과 상태 필터를 해제하면 전체 기록으로 돌아온다", async () => {
  const fetcher = vi.fn(async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    return new Response(JSON.stringify(response(params.get("q") ? [] : [record])));
  });
  vi.stubGlobal("fetch", fetcher);
  renderWithIntl(<QuestionGrowthJournal />);
  await screen.findByText(record.revisedContent, { exact: true, selector: "summary p" });
  fireEvent.change(screen.getByRole("searchbox", { name: "성장 기록 검색" }), { target: { value: "없는 기록" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  await screen.findByText("조건에 맞는 성장 기록이 없어요.");
  fireEvent.click(screen.getByRole("button", { name: "전체 기록 보기" }));
  await screen.findByText(record.revisedContent, { exact: true, selector: "summary p" });
  await waitFor(() => expect(new URL(fetcher.mock.calls.at(-1)![0], "http://localhost").searchParams.get("q")).toBeNull());
});
