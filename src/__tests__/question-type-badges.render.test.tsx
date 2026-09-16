// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { QuestionTypeBadges } from "@/components/shared/QuestionTypeBadges";
import { renderWithIntl } from "./test-utils/render-with-intl";

afterEach(cleanup);
it("분류 불가 자료에 정상 유형 대신 안내 하나를 표시한다", () => {
  renderWithIntl(<QuestionTypeBadges closure="unclassified" cognitive="unclassified" />);
  expect(screen.getAllByText("분류 불가")).toHaveLength(1);
  expect(screen.queryByText("닫힌 질문")).toBeNull();
  expect(screen.queryByText("사실적 질문")).toBeNull();
});
it("정상 질문은 두 분류를 유지한다", () => {
  renderWithIntl(<QuestionTypeBadges closure="closed" cognitive="factual" />);
  expect(screen.getByText("닫힌 질문")).toBeTruthy();
  expect(screen.getByText("사실적 질문")).toBeTruthy();
});
