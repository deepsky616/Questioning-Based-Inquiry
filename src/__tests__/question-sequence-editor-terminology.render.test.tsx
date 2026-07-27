// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";

afterEach(cleanup);

describe("탐구 설계 기준 선택 용어", () => {
  it("질문 중심 탐구설계에서 탐구 설계 기준 선택으로 안내한다", () => {
    renderWithIntl(
      <QuestionSequenceEditor
        sessionId="session-1"
        subject="과학"
        topic="생태계"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("탐구 설계 기준 선택")).toBeInTheDocument();
    expect(screen.queryByText("단원 설계 기준 선택")).not.toBeInTheDocument();
  });

  it("배포한 탐구설계 수정 화면에서도 같은 용어로 안내한다", () => {
    renderWithIntl(
      <QuestionSequenceEditor
        sessionId="session-1"
        subject="과학"
        topic="생태계"
        editMode
        initialQuestions={[
          {
            id: "question-1",
            type: "conceptual",
            content: "생태계의 구성 요소는 서로 어떤 영향을 주고받을까?",
            source: "student",
            contentGroup: "생태계",
            priority: 1,
            lessonPhase: "탐구",
            rationale: "",
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("탐구 설계 기준 선택")).toBeInTheDocument();
    expect(screen.queryByText("단원 설계 기준 선택")).not.toBeInTheDocument();
  });
});
