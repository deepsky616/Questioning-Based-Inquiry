// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { QuestionLearningExperience } from "@/components/shared/QuestionLearningExperience";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const openLabel = "수업 화면으로 보기";
function openPresentation() {
  fireEvent.click(screen.getByRole("button", { name: openLabel }));
  return screen.getByRole("dialog", { name: "질문학습 수업 화면" });
}

it("교사에게만 학습 슬라이드의 수업 화면 버튼을 제공한다", () => {
  const student = renderWithIntl(<QuestionLearningExperience audience="student" />);
  expect(screen.queryByRole("button", { name: openLabel })).not.toBeInTheDocument();
  student.unmount();
  renderWithIntl(<QuestionLearningExperience audience="teacher" />);
  expect(screen.getByRole("button", { name: openLabel })).toBeVisible();
});

it("보던 장에서 열고 열네 장을 모두 이동한 뒤 같은 장으로 돌아온다", async () => {
  renderWithIntl(<QuestionLearningExperience audience="teacher" />);
  fireEvent.click(screen.getByRole("tab", { name: "3 / 14" }));
  const dialog = openPresentation();
  const stage = within(dialog).getByTestId("question-learning-stage");
  expect(stage).toHaveFocus();
  expect(within(dialog).getByText("3 / 14")).toBeVisible();
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "다음" }), { key: "ArrowRight" });
  expect(within(dialog).getByText("4 / 14")).toBeVisible();
  fireEvent.keyDown(stage, { key: "Home", ctrlKey: true });
  expect(within(dialog).getByText("4 / 14")).toBeVisible();
  expect(document.querySelectorAll("#question-learning-panel")).toHaveLength(1);
  fireEvent.keyDown(stage, { key: "Home" });
  expect(within(dialog).getByRole("button", { name: "이전" })).toBeDisabled();
  for (let number = 1; number <= 14; number++) {
    expect(within(dialog).getByRole("tab", { name: `${number} / 14` })).toHaveAttribute("aria-selected", "true");
    if (number < 14) fireEvent.click(within(dialog).getByRole("button", { name: "다음" }));
  }
  expect(within(dialog).getByRole("button", { name: "다음" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "수업 화면 닫기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("14 / 14")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: openLabel })).toHaveFocus());
});

it("영어 화면에서도 수업 화면의 버튼과 안내를 번역하여 표시한다", () => {
  render(<NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Seoul"><QuestionLearningExperience audience="teacher" /></NextIntlClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Present to class" }));
  const dialog = screen.getByRole("dialog", { name: "Question learning presentation" });
  expect(within(dialog).getByText(en.questionLearning.presentationDescription)).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Close presentation" })).toBeVisible();
  expect(within(dialog).queryByText("수업 화면 닫기")).not.toBeInTheDocument();
});

it("확인 문제의 선택을 유지하고 문제 버튼의 방향키는 장을 바꾸지 않는다", async () => {
  renderWithIntl(<QuestionLearningExperience audience="teacher" />);
  fireEvent.click(screen.getByRole("tab", { name: "13 / 14" }));
  fireEvent.click(screen.getByRole("button", { name: "사실적 질문" }));
  const dialog = openPresentation();
  expect(within(dialog).getByRole("button", { name: "사실적 질문" })).toHaveAttribute("aria-pressed", "true");
  const nextCheck = within(dialog).getByRole("button", { name: "다음 문제" });
  fireEvent.keyDown(nextCheck, { key: "ArrowRight" });
  expect(within(dialog).getByText("13 / 14")).toBeVisible();
  fireEvent.click(nextCheck);
  expect(within(dialog).getByText("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?")).toHaveFocus();
  fireEvent.keyDown(within(dialog).getByTestId("question-learning-stage"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?")).toBeVisible();
  openPresentation();
  expect(screen.getByText("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?")).toBeVisible();
});

it("수업 화면의 완료 단추로 수업 활용에 이동할 때 화면을 닫고 초점을 넘긴다", async () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  renderWithIntl(<QuestionLearningExperience audience="teacher" />);
  const dialog = openPresentation();
  fireEvent.keyDown(within(dialog).getByTestId("question-learning-stage"), { key: "End" });
  fireEvent.click(within(dialog).getByRole("button", { name: "수업 활용 보기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("tab", { name: "수업 활용" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "수업 활용" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "학습 내용으로 돌아가기" }));
  expect(screen.getByText("14 / 14")).toBeVisible();
});
