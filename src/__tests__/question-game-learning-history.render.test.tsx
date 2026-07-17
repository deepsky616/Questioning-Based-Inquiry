// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { QuestionGameLearningHistory } from "@/components/question-games/QuestionGameLearningHistory";

afterEach(cleanup);

describe("질문놀이 학습 이력 화면", () => {
  it("학생에게 방식별 요약과 최근 놀이 결과를 보여 준다", () => {
    render(
      <QuestionGameLearningHistory
        audience="student"
        history={{
          totals: { plays: 3, points: 28, goodQuestions: 6 },
          modes: {
            solo: { plays: 1, points: 4, goodQuestions: 1 },
            ai: { plays: 1, points: 7, goodQuestions: 2 },
            friend: { plays: 1, points: 17, goodQuestions: 3 },
          },
          recent: [{
            id: "friend:room:1",
            gameId: "relay",
            mode: "friend",
            completedAt: "2026-07-17T01:00:00.000Z",
            points: 17,
            goodQuestions: 3,
          }],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "나의 질문놀이 학습 이력" })).toBeVisible();
    expect(screen.getByText("완료한 놀이").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("혼자 하기 1회")).toBeVisible();
    expect(screen.getByText("인공지능과 함께 1회")).toBeVisible();
    expect(screen.getByText("친구와 함께 1회")).toBeVisible();
    expect(screen.getByText("질문 릴레이")).toBeVisible();
    expect(screen.getByText("좋은 질문 3개 · 17점")).toBeVisible();
  });
});
