// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { renderWithIntl } from "./test-utils/render-with-intl";
import { ReportAnalysisMetadata } from "@/components/reports/ReportAnalysisMetadata";
afterEach(cleanup);
it("교사는 최근 분석일을 바로 보고 분석 정보를 펼쳐 실제 저장된 모델을 확인한다", () => {
  renderWithIntl(<ReportAnalysisMetadata analysis={{ analyzedAt: "2026-09-08T00:00:00Z", analysisModel: "stored-model" }} showAnalysisModel />);
  expect(screen.getByText("인공지능 분석", { exact: true })).toBeVisible();
  expect(screen.getByText(/최근 분석일/)).toBeVisible();
  expect(screen.getByText(/stored-model/)).not.toBeVisible();
  fireEvent.click(screen.getByText("분석 정보", { exact: true }));
  expect(screen.getByText(/stored-model/)).toBeVisible();
});
it.each([undefined, "", "   "])("모델이 없으면 추정한 모델이나 빈 분석 정보를 표시하지 않는다: %s", analysisModel => {
  renderWithIntl(<ReportAnalysisMetadata analysis={{ analyzedAt: "잘못된 날짜", analysisModel }} showAnalysisModel />);
  expect(screen.queryByText("분석 정보", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/최근 분석일/)).not.toBeInTheDocument();
});
it("학생 화면에는 모델명과 분석 정보 펼치기를 전달하지 않는다", () => {
  renderWithIntl(<ReportAnalysisMetadata analysis={{ analyzedAt: "2026-09-08T00:00:00Z", analysisModel: "stored-model" }} showAnalysisModel={false} />);
  expect(screen.queryByText(/stored-model/)).not.toBeInTheDocument();
  expect(screen.queryByText("분석 정보", { exact: true })).not.toBeInTheDocument();
});
