// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { QuestionClassificationReview } from "@/components/shared/QuestionClassificationReview";
import { renderWithIntl } from "./test-utils/render-with-intl";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "s1" } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("펼칠 때만 이력을 읽고 교사의 실제 설명을 원문 그대로 보여 준다", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ page: 1, hasMore: false, records: [{ id: "r1", previousClosure: "closed", previousCognitive: "factual", closure: "open", cognitive: "factual", reason: "여러 사례를 자료에서 확인할 수 있어요.", createdAt: "2026-09-09T00:00:00Z", reviewer: { name: "김탐구" } }] })));
  vi.stubGlobal("fetch", fetcher);
  renderWithIntl(<QuestionClassificationReview questionId="q1" reviewed />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "교사 확인 이력" }));
  expect(await screen.findByText("여러 사례를 자료에서 확인할 수 있어요.")).toBeVisible();
  expect(screen.getByText("닫힌 질문 · 사실적 질문")).toBeVisible();
  expect(screen.getByText("열린 질문 · 사실적 질문")).toBeVisible();
});
it("이전 질문의 빈 이력에서 과거 교사 확인을 추정하지 않는다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ page: 1, hasMore: false, records: [] }))));
  renderWithIntl(<QuestionClassificationReview questionId="q1" reviewed={false} teacher />);
  fireEvent.click(screen.getByRole("button", { name: "분류 확인 이력" }));
  expect(await screen.findByText(/아직 저장된 교사 확인 이력이 없습니다/)).toBeVisible();
});
