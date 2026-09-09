// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { ReportPrintDoc, type PrintReportItem } from "@/components/reports/ReportPrintDoc";
afterEach(cleanup);

it("분석이 없는 수업도 직접 쓴 성장 기록을 모두 출력하며 빈 기록과 빈 항목은 생략한다", () => {
  const records = Array.from({ length: 105 }, (_, i) => ({ questionId: `q${i}`, originalContent: `처음 질문 ${i}`, revisedContent: `고친 질문 ${i}`, changeNote: `돌아보기 ${i}`, reflection: i === 0 ? "조건을 같게 맞추어야 해요." : "", revision: 1, updatedAt: "2026-09-08T00:00:00Z" }));
  const item = {
    name: "김질문", grade: "5", className: "1",
    totals: { questions: 105, likesGiven: 0, comments: 0, likesReceived: 0, commentsReceived: 0 },
    classification: { total: 105, closure: { closed: 0, open: 105 }, cognitive: { factual: 0, conceptual: 105, controversial: 0 } },
    sessions: [{ id: "s1", date: "2026-09-01", subject: "과학", topic: "용해와 용액", analysis: null, growthRecords: [...records, { ...records[0], questionId: "auto", revisedContent: "자동 보관만 한 질문", changeNote: " \n ", reflection: "" }] }],
  } satisfies PrintReportItem;
  renderWithIntl(<ReportPrintDoc items={[item]} />);
  expect(screen.getByRole("heading", { name: /용해와 용액/ })).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(105);
  for (const text of ["처음 질문 0", "고친 질문 0", "돌아보기 0", "조건을 같게 맞추어야 해요.", "돌아보기 104"]) expect(screen.getByText(text, { exact: true })).toBeVisible();
  expect(screen.queryByText("자동 보관만 한 질문")).not.toBeInTheDocument();
  expect(screen.getAllByText("탐구하며 알게 된 점", { exact: true })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: /성장 기록/ })).not.toBeInTheDocument();
});
