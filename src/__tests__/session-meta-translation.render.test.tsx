// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";

vi.mock("next-intl", () => ({
  useLocale: () => "ko",
}));

function SessionLabelProbe() {
  const fullSession = {
    id: "session-1",
    date: "2026-07-28",
    grade: "5",
    subject: "수학",
    topic: "6. 평면도형의 둘레와 넓이",
  };
  const sessionText = useSessionMetaTranslation([fullSession]);

  return (
    <>
      <span data-testid="full-label">{sessionText.label(fullSession)}</span>
      <span data-testid="question-label">
        {sessionText.label({
          id: "session-1",
          date: "2026-07-28",
          subject: "수학",
          topic: "6. 평면도형의 둘레와 넓이",
        })}
      </span>
    </>
  );
}

describe("질문수업 제목 번역 도우미", () => {
  afterEach(cleanup);

  it("질문의 축약된 수업 정보에도 전체 수업 목록의 학년을 보완한다", () => {
    render(<SessionLabelProbe />);

    expect(screen.getByTestId("full-label")).toHaveTextContent(
      "2026-07-28 · 5학년 · 수학 · 6. 평면도형의 둘레와 넓이",
    );
    expect(screen.getByTestId("question-label")).toHaveTextContent(
      "2026-07-28 · 5학년 · 수학 · 6. 평면도형의 둘레와 넓이",
    );
  });
});
