// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { StudentLearningGuideEditor } from "@/components/shared/StudentLearningGuideEditor";

describe("학생용 단원 이해 자료 편집", () => {
  it("교사가 핵심 아이디어, 핵심 문장, 핵심 질문 설명을 직접 수정한다", () => {
    const onChange = vi.fn();
    render(
      <StudentLearningGuideEditor
        coreSentences={["식물은 빛 에너지를 양분으로 바꾼다."]}
        essentialQuestions={["생물은 어떻게 에너지를 얻을까?"]}
        guides={undefined}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("핵심 아이디어 쉽게 풀어보기"), {
      target: { value: "식물이 빛을 이용하는 큰 원리를 알아봐요." },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      coreIdea: expect.objectContaining({ explanation: "식물이 빛을 이용하는 큰 원리를 알아봐요." }),
    }));

    fireEvent.change(screen.getByLabelText("1번 핵심 문장 쉬운 문장으로 보기"), {
      target: { value: "식물이 빛으로 필요한 물질을 만들어요." },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      coreSentences: [{ index: 0, explanation: "식물이 빛으로 필요한 물질을 만들어요." }],
    }));

    fireEvent.change(screen.getByLabelText("1번 핵심 질문에서 생각할 것"), {
      target: { value: "에너지를 얻는 여러 방법을 살펴봐요." },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      essentialQuestions: [expect.objectContaining({
        index: 0,
        thinkingFocus: "에너지를 얻는 여러 방법을 살펴봐요.",
      })],
    }));
  });
});
