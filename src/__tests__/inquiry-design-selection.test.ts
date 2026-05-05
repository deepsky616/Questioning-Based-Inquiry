import { describe, expect, it } from "vitest";
import {
  countInquiryQuestionsByType,
  filterSelectedInquiryQuestions,
  filterSelectedTexts,
  INQUIRY_GENERATION_TARGETS,
  selectAllIndices,
  toggleSelectedIndex,
} from "@/lib/inquiry-design-selection";

describe("inquiry-design-selection", () => {
  it("생성된 후보는 기본적으로 모두 선택한다", () => {
    expect(selectAllIndices(["문장1", "문장2", "문장3"])).toEqual([0, 1, 2]);
  });

  it("선택 인덱스를 토글하고 순서를 유지한다", () => {
    expect(toggleSelectedIndex([0, 2], 2)).toEqual([0]);
    expect(toggleSelectedIndex([2], 0)).toEqual([0, 2]);
  });

  it("선택된 핵심 문장과 핵심 질문만 공백 제거 후 다음 단계에 전달한다", () => {
    expect(filterSelectedTexts(["  첫 문장  ", "   ", "셋째 문장"], [0, 1])).toEqual([
      "첫 문장",
    ]);
  });

  it("선택된 탐구 질문만 공백 제거 후 저장한다", () => {
    const selected = filterSelectedInquiryQuestions(
      [
        { type: "factual" as const, content: "  사실 질문  " },
        { type: "conceptual" as const, content: "   " },
        { type: "controversial" as const, content: "논쟁 질문" },
      ],
      [0, 1],
    );

    expect(selected).toEqual([{ type: "factual", content: "사실 질문" }]);
  });

  it("탐구 질문 생성 목표 수량은 사실적 3~4개, 개념적 3~4개, 논쟁적 2개이다", () => {
    expect(INQUIRY_GENERATION_TARGETS).toEqual({
      factual: { min: 3, max: 4 },
      conceptual: { min: 3, max: 4 },
      controversial: { min: 2, max: 2 },
    });
  });

  it("탐구 질문 유형별 수량을 계산한다", () => {
    expect(
      countInquiryQuestionsByType([
        { type: "factual", content: "사실1" },
        { type: "factual", content: " " },
        { type: "conceptual", content: "개념1" },
        { type: "controversial", content: "논쟁1" },
      ]),
    ).toEqual({ factual: 1, conceptual: 1, controversial: 1 });
  });
});

