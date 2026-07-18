// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { InquiryQuestionEditor } from "@/app/(teacher)/teacher-curriculum/InquiryQuestionEditor";

const callbacks = {
  onSetDragIndex: vi.fn(),
  onDrop: vi.fn(),
  onMove: vi.fn(),
  onUpdate: vi.fn(),
  onRemove: vi.fn(),
  onAddTypeChange: vi.fn(),
  onAdd: vi.fn(),
  onComplete: vi.fn(),
};

describe("탐구 질문 편집 화면", () => {
  it("세 가지 질문 종류만 제공하고 편집 동작을 연결한다", () => {
    render(
      <InquiryQuestionEditor
        questions={[
          { type: "factual", content: "생산자는 무엇일까?" },
          { type: "conceptual", content: "먹이 관계는 어떻게 이어질까?" },
        ]}
        selectedCount={2}
        dragIndex={null}
        addType="factual"
        {...callbacks}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects[0]).toHaveTextContent("사실적 질문");
    expect(selects[0]).toHaveTextContent("개념적 질문");
    expect(selects[0]).toHaveTextContent("논쟁적 질문");
    expect(selects[0].querySelectorAll("option")).toHaveLength(3);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "생산자는 어떤 일을 할까?" } });
    expect(callbacks.onUpdate).toHaveBeenCalledWith(0, { content: "생산자는 어떤 일을 할까?" });

    fireEvent.click(screen.getAllByRole("button", { name: "아래로 이동" })[0]);
    expect(callbacks.onMove).toHaveBeenCalledWith(0, 1);

    fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]);
    expect(callbacks.onRemove).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole("button", { name: /질문 추가/ }));
    expect(callbacks.onAdd).toHaveBeenCalledWith("factual");
  });

  it("내용이 있는 질문이 없으면 완료할 수 없다", () => {
    render(
      <InquiryQuestionEditor
        questions={[{ type: "conceptual", content: "   " }]}
        selectedCount={1}
        dragIndex={null}
        addType="conceptual"
        {...callbacks}
      />,
    );

    expect(screen.getByRole("button", { name: "탐구 질문 만들기 완료" })).toBeDisabled();
    expect(screen.getByText("완료할 탐구 질문을 한 개 이상 작성해 주세요.")).toBeInTheDocument();
  });

  it("내용이 있는 질문이 있으면 확인 화면으로 이동한다", () => {
    render(
      <InquiryQuestionEditor
        questions={[{ type: "controversial", content: "개발을 제한해야 할까?" }]}
        selectedCount={1}
        dragIndex={null}
        addType="controversial"
        {...callbacks}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });
});
