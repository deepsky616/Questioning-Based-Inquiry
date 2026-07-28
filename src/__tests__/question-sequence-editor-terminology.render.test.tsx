// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sequencedQuestions = Array.from({ length: 4 }, (_, index) => ({
  id: `question-${index + 1}`,
  type: "conceptual",
  content: `대표 질문 ${index + 1}`,
  source: "student" as const,
  contentGroup: "생태계",
  priority: index + 1,
  lessonPhase: "탐구",
  rationale: "",
  flowId: "cognitive-development",
  flowTitle: "인지적 발달 흐름",
  flowAxis: "낮은 사고 ↔ 높은 사고",
  mergedFrom: [
    `원본 질문 ${index * 3 + 1}`,
    `원본 질문 ${index * 3 + 2}`,
    `원본 질문 ${index * 3 + 3}`,
  ],
}));

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

  it("흐름 기준 정렬이 끝나면 질문 개수와 적용한 흐름을 안내한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sequencedQuestions,
          generatedBy: "ai",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sequencedQuestions: [...sequencedQuestions].reverse().map((question, index) => ({
            ...question,
            priority: index + 1,
            mergedFrom: undefined,
          })),
          generatedBy: "ai",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(
      <QuestionSequenceEditor
        sessionId="session-1"
        subject="과학"
        topic="생태계"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "① 비슷한 질문 묶기" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "② 흐름 기준 정렬" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "② 흐름 기준 정렬" }));

    expect(
      await screen.findByText(
        "대표 질문 4개를 ‘인지적 발달 흐름’ 기준으로 정렬했어요",
      ),
    ).toBeVisible();
  });
});
