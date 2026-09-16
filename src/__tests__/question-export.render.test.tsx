// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { TeacherQuestionExport } from "@/app/(teacher)/teacher-questions/TeacherQuestionExport";
import { renderWithIntl } from "./test-utils/render-with-intl";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("다운로드 실패를 안내하고 같은 창에서 다시 시도할 수 있다", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockRejectedValueOnce(new TypeError("Load failed"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: "EXPORT_SELECTION_CHANGED" }), { status: 409 })));
  renderWithIntl(<TeacherQuestionExport queryPath="/api/questions?view=page&page=2&pageSize=30" questionIds={["q1"]} totalCount={61} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));
  fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("엑셀 파일을 내려받지 못했습니다");
  expect(screen.getByRole("button", { name: "다운로드" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("선택한 질문이 변경되었거나 조회 범위를 벗어났습니다");
  expect(screen.getByRole("dialog")).toBeVisible();
});
