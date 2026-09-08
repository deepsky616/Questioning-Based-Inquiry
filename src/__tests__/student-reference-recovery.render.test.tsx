// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { StudentAskReferencePanel } from "@/app/(student)/student-ask/StudentAskReferencePanel";
afterEach(cleanup);
it("자료 조회 실패와 빈 자료를 구분하고 질문 도우미를 유지한다", () => {
  const retry = vi.fn();
  renderWithIntl(<StudentAskReferencePanel selectedSession={null} hasDesignReference designContext={null} showReference onToggleReference={vi.fn()} referenceError onRetryReference={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("참고 자료를 불러오지 못했어요");
  expect(screen.queryByText("이 수업에 연결된 참고 자료가 아직 없어요.")).not.toBeInTheDocument();
  expect(screen.getByText("좋은 질문 도우미")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledOnce();
});
