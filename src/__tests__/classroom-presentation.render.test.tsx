// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { ClassroomPresentation } from "@/components/teacher/ClassroomPresentation";
import { renderWithIntl } from "./test-utils/render-with-intl";
afterEach(cleanup);
const items = [
  { id: "a", content: "왜 물의 온도를 같게 해야 할까요?", classification: "개념적 질문", explanation: "비교할 조건을 확인해요.", authorName: "학생1" },
  { id: "b", content: "자료의 평균은 얼마일까요?", classification: "사실적 질문", authorName: "학생2" },
];
it("이름과 분류를 숨긴 채 시작하고 교사가 공개한 뒤 다음 질문에서는 분류를 다시 숨긴다", () => {
  renderWithIntl(<ClassroomPresentation items={items} title="과학" />);
  fireEvent.click(screen.getByRole("button", { name: "수업 화면으로 보기" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByText("학생1")).not.toBeInTheDocument();
  expect(within(dialog).queryByText("개념적 질문")).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "분류·설명 공개" }));
  expect(within(dialog).getByText("비교할 조건을 확인해요.")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "학생 이름 표시" }));
  expect(within(dialog).getByText("학생1")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "다음 질문" }));
  expect(within(dialog).getByText(items[1].content)).toBeVisible();
  expect(within(dialog).queryByText("사실적 질문")).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "다음 질문" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "수업 화면 닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "수업 화면으로 보기" }));
  expect(screen.queryByText("학생1")).not.toBeInTheDocument();
  expect(screen.getByText(items[0].content)).toBeVisible();
});
it("발표 도중 배경 자료가 변경되어도 발표 중 질문을 유지하고 방향키로 이동한다", () => {
  const view = renderWithIntl(<ClassroomPresentation items={items} title="과학" />);
  fireEvent.click(screen.getByRole("button", { name: "수업 화면으로 보기" }));
  view.rerender(<ClassroomPresentation items={[{ ...items[0], content: "배경에서 바뀐 질문" }]} title="과학" />);
  expect(screen.getByText(items[0].content)).toBeVisible();
  fireEvent.keyDown(screen.getByRole("region", { name: "함께 볼 질문" }), { key: "ArrowRight" });
  expect(screen.getByText(items[1].content)).toBeVisible();
  expect(screen.queryByText("배경에서 바뀐 질문")).not.toBeInTheDocument();
});
