// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuestionGrowthEditor } from "@/components/reports/QuestionGrowthEditor";
import { QuestionGrowthDialog } from "@/components/reports/QuestionGrowthDialog";
import { readGrowthDraft, writeGrowthDraft, clearMatchingGrowthDraft, clearGrowthDrafts } from "@/lib/question-growth-draft";
import { renderWithIntl } from "./test-utils/render-with-intl";

const viewer = vi.hoisted(() => ({ id: "student-1" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: viewer.id, role: "STUDENT" } } }) }));
const payload = (revision = 1) => ({ canEdit: true, questions: [{ id: "q1", content: "질문", session: null }], records: [{ questionId: "q1", originalContent: "질문", revisedContent: "질문", changeNote: "저장된 메모", reflection: "", revision, updatedAt: "2026-09-09" }] });
beforeEach(() => { viewer.id = "student-1"; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload())))); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("닫았다 다시 열면 두 메모의 미저장 내용을 복원하고 다른 학생에게 보여 주지 않는다", async () => {
  const first = renderWithIntl(<QuestionGrowthEditor questionId="q1" />);
  fireEvent.change(await screen.findByRole("textbox", { name: /질문을 만들거나 고친 점/ }), { target: { value: "아직 저장하지 않은 메모" } });
  fireEvent.change(screen.getByRole("textbox", { name: /탐구하며 알게 된 점/ }), { target: { value: "탐구한 내용" } });
  first.unmount();
  const second = renderWithIntl(<QuestionGrowthEditor questionId="q1" quick />);
  expect(await screen.findByRole("textbox", { name: /질문을 만들거나 고친 점/ })).toHaveValue("아직 저장하지 않은 메모");
  expect(screen.getByRole("textbox", { name: /탐구하며 알게 된 점/ })).toHaveValue("탐구한 내용");
  second.unmount();
  viewer.id = "student-2";
  renderWithIntl(<QuestionGrowthEditor questionId="q1" />);
  expect(await screen.findByRole("textbox", { name: /질문을 만들거나 고친 점/ })).toHaveValue("저장된 메모");
});

it("이전 버전의 초안은 복원하되 최신 서버 내용을 자동으로 덮어쓰지 않는다", async () => {
  writeGrowthDraft(localStorage, viewer.id, "q1", { revision: 0, changes: { reflection: "이전 초안" } });
  renderWithIntl(<QuestionGrowthEditor questionId="q1" />);
  expect(await screen.findByRole("textbox", { name: /탐구하며 알게 된 점/ })).toHaveValue("이전 초안");
  expect(screen.getByRole("button", { name: "성장 기록 저장" })).toBeDisabled();
  expect(screen.getByRole("alert")).toBeVisible();
});

it("저장 응답이 끊겼어도 서버와 같은 초안이면 다시 제출하지 않는다", async () => {
  writeGrowthDraft(localStorage, viewer.id, "q1", { revision: 0, changes: { changeNote: "저장된 메모" } });
  renderWithIntl(<QuestionGrowthEditor questionId="q1" />);
  await screen.findByRole("textbox", { name: /질문을 만들거나 고친 점/ });
  expect(readGrowthDraft(localStorage, viewer.id, "q1")).toBeNull();
  expect(screen.getByRole("button", { name: "성장 기록 저장" })).toBeDisabled();
});

it("늦게 끝난 저장이 새로운 초안을 지우지 않고 로그아웃 정리는 성장 초안만 지운다", () => {
  const draft = { revision: 1, changes: { reflection: "먼저 쓴 내용" } };
  writeGrowthDraft(localStorage, viewer.id, "q1", draft);
  writeGrowthDraft(localStorage, viewer.id, "q1", { ...draft, changes: { reflection: "새 내용" } });
  clearMatchingGrowthDraft(localStorage, viewer.id, "q1", draft);
  expect(readGrowthDraft(localStorage, viewer.id, "q1")?.changes.reflection).toBe("새 내용");
  expect(readGrowthDraft(localStorage, viewer.id, "q1", Date.now() + 9 * 60 * 60 * 1000)).toBeNull();
  writeGrowthDraft(localStorage, viewer.id, "q1", draft);
  localStorage.setItem("unrelated", "보존");
  clearGrowthDrafts(localStorage);
  expect(localStorage.getItem("unrelated")).toBe("보존");
  expect(readGrowthDraft(localStorage, viewer.id, "q1")).toBeNull();
});

it("임시 보관 실패 때 입력을 유지하고 확인 없이 작성 창을 닫지 않는다", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("저장소 실패"); });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const close = vi.fn();
  renderWithIntl(<QuestionGrowthDialog questionId="q1" onClose={close} />);
  const input = await screen.findByRole("textbox", { name: /질문을 만들거나 고친 점/ });
  fireEvent.change(input, { target: { value: "보호할 내용" } });
  expect(screen.getByRole("alert")).toHaveTextContent("임시 보관을 사용할 수 없어요");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(confirm).toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(input).toHaveValue("보호할 내용");
});
