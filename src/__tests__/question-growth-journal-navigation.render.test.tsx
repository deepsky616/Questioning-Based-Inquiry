// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { QuestionGrowthJournal } from "@/components/reports/QuestionGrowthJournal";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "s1", role: "STUDENT" } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const record = { questionId: "q1", originalContent: "소금이 녹을까?", revisedContent: "물의 온도에 따라 소금이 녹는 양은 어떻게 달라질까?", changeNote: "온도를 비교하는 질문으로 고쳤어요.", reflection: "", revision: 1, updatedAt: "2026-09-08T00:00:00Z", question: { session: { id: "science-1", date: "2026-09-01", subject: "과학", topic: "용해와 용액" } } };
const response = (records = [record]) => ({ canEdit: true, records, pageInfo: { page: 1, pageSize: 8, total: records.length, totalPages: 1 }, summary: { total: records.length, complete: 0, pending: records.length } });
it("수업 안에서는 검색 없이 학생이 직접 쓴 내용을 바로 보여 주고 비어 있는 항목은 표시하지 않는다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response()))));
  renderWithIntl(<QuestionGrowthJournal sessionId="science-1" />);
  expect(await screen.findByText(record.changeNote)).toBeVisible();
  expect(screen.getByText(record.originalContent)).toBeVisible();
  expect(screen.getByText(record.revisedContent)).toBeVisible();
  expect(screen.getByText("처음 질문", { exact: true })).toBeVisible();
  expect(screen.getByText("고친 질문", { exact: true })).toBeVisible();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "성장 기록 작성 상태" })).not.toBeInTheDocument();
  expect(screen.queryByText("탐구 후 배운 점을 이어 쓸 수 있어요.")).not.toBeInTheDocument();
  expect(screen.queryByText("탐구하며 알게 된 점")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "성장 기록 이어쓰기" })).toHaveAttribute("href", "/student-questions?tab=mine&growth=q1");
});
it("수업을 바꾸면 해당 수업의 기록만 조회하고 학생이 쓴 내용이 없을 때 전체 검색을 제공하지 않는다", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    return new Response(JSON.stringify(response(params.get("view") === "session" && params.get("sessionId") === "math-1" ? [] : [record])));
  }));
  const view = renderWithIntl(<QuestionGrowthJournal sessionId="science-1" />);
  await screen.findByText(record.changeNote);
  view.rerender(<QuestionGrowthJournal sessionId="math-1" />);
  await screen.findByText("이 수업에 학생이 직접 남긴 성장 기록이 아직 없어요.");
  expect(screen.queryByText(record.changeNote)).not.toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "나의 질문에서 성장 기록 남기기" })).not.toBeInTheDocument();
});
it("기록이 많은 수업도 다음 쪽으로 이동해 학생이 쓴 배운 점을 읽는다", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const page = Number(new URL(url, "http://localhost").searchParams.get("page") ?? 1);
    return new Response(JSON.stringify({ ...response([{ ...record, questionId: `q${page}`, changeNote: "", reflection: page === 2 ? "실험 조건을 같게 맞추어야 해요." : "첫 번째 배운 점" }]), pageInfo: { page, pageSize: 8, total: 9, totalPages: 2 } }));
  }));
  renderWithIntl(<QuestionGrowthJournal sessionId="science-1" />);
  expect(await screen.findByText("첫 번째 배운 점")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
  expect(await screen.findByText("실험 조건을 같게 맞추어야 해요.")).toBeVisible();
  expect(screen.queryByText("첫 번째 배운 점")).not.toBeInTheDocument();
});

it("질문을 고치지 않은 기록은 나의 질문 하나와 학생이 직접 작성한 배운 점을 보여 준다", async () => {
  const unchanged = { ...record, revisedContent: record.originalContent, changeNote: "", reflection: "실험에서 비교할 조건을 정해야 해요." };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response([unchanged])))));
  renderWithIntl(<QuestionGrowthJournal sessionId="science-1" />);
  expect(await screen.findByText("나의 질문", { exact: true })).toBeVisible();
  expect(screen.getAllByText(unchanged.originalContent, { exact: true })).toHaveLength(1);
  expect(screen.queryByText("처음 질문", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("고친 질문", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("질문을 만들거나 고친 점", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText(unchanged.reflection)).toBeVisible();
});
it("처음 질문과 고친 질문에 작성한 돌아보기와 배운 점을 모두 연결하며 실제 저장된 문장을 유지한다", async () => {
  const completed = { ...record, reflection: "온도 외의 조건을 같게 맞추어야 비교할 수 있어요." };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response([completed])))));
  renderWithIntl(<QuestionGrowthJournal sessionId="science-1" />);
  expect(await screen.findByText(completed.originalContent)).toBeVisible();
  for (const text of [completed.revisedContent, completed.changeNote, completed.reflection]) expect(screen.getByText(text, { exact: true })).toBeVisible();
  expect(screen.getByRole("link", { name: "성장 기록 보기·수정" })).toHaveAttribute("href", "/student-questions?tab=mine&growth=q1");
  expect(screen.queryByRole("link", { name: "성장 기록 이어쓰기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
