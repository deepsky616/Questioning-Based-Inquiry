// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { StudentInquiryGuideEditor } from "@/components/shared/StudentInquiryGuideEditor";

describe("학생용 탐구질문 안내 편집", () => {
  it("교사가 쉬운 풀이와 낱말, 생각 시작 문장을 직접 수정한다", () => {
    const onChange = vi.fn();
    render(<StudentInquiryGuideEditor guide={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByText("학생용 이해 자료"));
    fireEvent.change(screen.getByLabelText("질문이 묻는 것"), {
      target: { value: "식물이 양분을 만드는 장소를 찾는 질문이에요." },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      meaning: "식물이 양분을 만드는 장소를 찾는 질문이에요.",
    }));

    fireEvent.change(screen.getByLabelText("핵심 낱말"), {
      target: { value: "양분: 식물이 자라는 데 필요한 물질" },
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keywords: [{ term: "양분", meaning: "식물이 자라는 데 필요한 물질" }],
    }));
  });

  it("낱말과 뜻 사이 구분 기호를 입력하는 동안 편집 문자열을 유지한다", () => {
    render(<StudentInquiryGuideEditor guide={undefined} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("학생용 이해 자료"));
    const input = screen.getByLabelText("핵심 낱말");

    fireEvent.change(input, { target: { value: "양분" } });
    fireEvent.change(input, { target: { value: "양분:" } });

    expect(input).toHaveValue("양분:");
  });
});
