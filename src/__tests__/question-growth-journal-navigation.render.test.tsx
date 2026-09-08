// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { QuestionGrowthJournal } from "@/components/reports/QuestionGrowthJournal";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "s1", role: "STUDENT" } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("리포트는 기록을 읽고 해당 질문의 이어쓰기 화면으로 연결한다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ canEdit: true, questions: [{ id: "q1", content: "새 질문", session: null }], records: [{ questionId: "q1", originalContent: "소금이 녹을까?", revisedContent: "물의 온도에 따라 소금이 녹는 양은 어떻게 달라질까?", reflection: "온도를 같게 하고 비교해야 해요.", revision: 1, updatedAt: "2026-09-08T00:00:00Z" }] }))));
  renderWithIntl(<QuestionGrowthJournal />);
  await screen.findByText("온도를 같게 하고 비교해야 해요.");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /성장 기록 이어쓰기/ })).toHaveAttribute("href", "/student-questions?tab=mine&growth=q1");
});
