// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { GameLearningSummary } from "@/app/(student)/student-question-play/games/GameLearningSummary";

afterEach(cleanup);

describe("질문놀이 공통 학습 결과 화면", () => {
  it("놀이 방식과 완료 활동, 질문, 포인트를 한 번에 보여 준다", () => {
    render(
      <GameLearningSummary
        mode="friend"
        completedActivities={3}
        questions={["왜 계절이 바뀔까?", "어떻게 알아볼까?"]}
        points={14}
      />,
    );

    expect(screen.getByRole("heading", { name: "나의 질문학습 결과" })).toBeVisible();
    expect(screen.getByText("친구와 함께")).toBeVisible();
    expect(screen.getByText("완료 활동").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("만든 질문").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("받은 포인트").nextSibling).toHaveTextContent("14");
    expect(screen.getByText("서로 다른 질문을 2개 만들었어요.")).toBeVisible();
    expect(screen.getByText("같은 주제를 다른 관점에서 한 번 더 질문해 보세요.")).toBeVisible();
  });

  it("질문을 직접 만들지 않는 놀이에는 활동에 맞는 다음 연습을 보여 준다", () => {
    render(
      <GameLearningSummary
        mode="solo"
        completedActivities={5}
        questions={[]}
      />,
    );

    expect(screen.getByText("놀이 규칙에 맞춰 활동을 끝까지 완료했어요.")).toBeVisible();
    expect(screen.getByText("질문과 대답이 이어지는 까닭을 한 문장으로 설명해 보세요.")).toBeVisible();
  });
});
