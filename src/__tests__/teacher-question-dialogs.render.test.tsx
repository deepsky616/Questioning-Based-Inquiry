// @vitest-environment jsdom
/**
 * teacher-questions 다이얼로그 렌더 가드 (jsdom).
 * page.tsx에서 추출한 QuestionEditDialog / AiAnswerPreviewDialog가
 * 프롭에 따라 열림·초기값·콜백을 올바르게 처리하는지 고정한다.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../messages/ko.json";

import { QuestionEditDialog } from "@/app/(teacher)/teacher-questions/QuestionEditDialog";
import { AiAnswerPreviewDialog } from "@/app/(teacher)/teacher-questions/AiAnswerPreviewDialog";
import type { Question, BulkPreview } from "@/app/(teacher)/teacher-questions/types";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
      {ui}
    </NextIntlClientProvider>,
  );
}

const question: Question = {
  id: "q1",
  content: "식물은 왜 초록색일까?",
  closure: "open",
  cognitive: "conceptual",
  closureScore: 0.6,
  cognitiveScore: 0.7,
  sessionId: "s1",
  session: { id: "s1", date: "2026-07-07", subject: "과학", topic: "광합성" },
  author: { id: "st1", name: "김학생", className: "1", grade: "5", studentNumber: "3" },
  isPublic: true,
  createdAt: "2026-07-07T09:00:00Z",
  likeCount: 0,
};

describe("QuestionEditDialog", () => {
  it("question이 null이면 닫혀 있고, 있으면 내용·작성자·세션이 보인다", () => {
    const { rerender } = renderWithIntl(
      <QuestionEditDialog question={null} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
        <QuestionEditDialog question={question} onClose={() => {}} onSaved={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("식물은 왜 초록색일까?")).toBeInTheDocument();
    expect(screen.getByText("김학생")).toBeInTheDocument();
    expect(screen.getByText(/광합성/)).toBeInTheDocument();
  });

  it("취소를 누르면 onClose가 호출된다", () => {
    const onClose = vi.fn();
    renderWithIntl(<QuestionEditDialog question={question} onClose={onClose} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: ko.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

const previews: BulkPreview[] = [
  { questionId: "q1", questionContent: "질문 하나", authorName: "김학생", authorInfo: "5학년 1반 3번", answer: "답변 하나" },
  { questionId: "q2", questionContent: "질문 둘", authorName: "이학생", authorInfo: "", answer: "답변 둘" },
];

describe("AiAnswerPreviewDialog", () => {
  const baseProps = {
    editedAnswers: {},
    onEditAnswer: () => {},
    excludedIds: new Set<string>(),
    onToggleExclude: () => {},
    regeneratingId: null,
    onRegenerate: () => {},
    isSending: false,
    errorText: null,
    onConfirm: () => {},
    onDismiss: () => {},
    onCancel: () => {},
  };

  it("previews가 null이면 닫혀 있고, 있으면 학생·답변이 모두 보인다", () => {
    const { rerender } = renderWithIntl(<AiAnswerPreviewDialog previews={null} {...baseProps} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
        <AiAnswerPreviewDialog previews={previews} {...baseProps} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("김학생")).toBeInTheDocument();
    expect(screen.getByText("이학생")).toBeInTheDocument();
    expect(screen.getByDisplayValue("답변 하나")).toBeInTheDocument();
    expect(screen.getByDisplayValue("답변 둘")).toBeInTheDocument();
  });

  it("제외 체크를 바꾸면 onToggleExclude가 해당 질문 id로 호출된다", () => {
    const onToggleExclude = vi.fn();
    renderWithIntl(
      <AiAnswerPreviewDialog previews={previews} {...baseProps} onToggleExclude={onToggleExclude} />,
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onToggleExclude).toHaveBeenCalledWith("q1");
  });

  it("전부 제외되면 전송 버튼이 비활성화되고, 오류 메시지가 표시된다", () => {
    renderWithIntl(
      <AiAnswerPreviewDialog
        previews={previews}
        {...baseProps}
        excludedIds={new Set(["q1", "q2"])}
        errorText="전송에 실패했습니다"
      />,
    );
    expect(screen.getByText("전송에 실패했습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /0개 답변 전송/ })).toBeDisabled();
  });

  it("답변 재생성 중에는 대화창을 닫거나 취소하거나 전송하지 못한다", () => {
    const onDismiss = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderWithIntl(
      <AiAnswerPreviewDialog
        previews={previews}
        {...baseProps}
        regeneratingId="q1"
        onDismiss={onDismiss}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: ko.common.cancel });
    const sendButton = screen.getByRole("button", { name: /2개 답변 전송/ });
    expect(cancelButton).toBeDisabled();
    expect(sendButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
