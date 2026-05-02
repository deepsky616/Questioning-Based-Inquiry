import { describe, expect, it } from "vitest";
import { buildInquiryGraphSummary } from "@/lib/inquiry-graph";

describe("buildInquiryGraphSummary", () => {
  it("탐구 질문과 학생 질문 분포를 요약한다", () => {
    const summary = buildInquiryGraphSummary(
      [
        { type: "factual", content: "식물은 어디에서 에너지를 얻을까?" },
        { type: "conceptual", content: "광합성과 호흡은 어떻게 연결될까?" },
      ],
      [
        { content: "광합성은 어디에서 일어나나요?", cognitive: "factual", closure: "closed", isPublic: true },
        { content: "빛이 없으면 식물은 어떻게 될까요?", cognitive: "conceptual", closure: "open", isPublic: false },
        { content: "도시에서 식물을 더 많이 길러야 할까요?", cognitive: "controversial", closure: "open", isPublic: true },
      ],
    );

    expect(summary.sharedQuestionCount).toBe(2);
    expect(summary.studentQuestionCount).toBe(3);
    expect(summary.publicQuestionCount).toBe(2);
    expect(summary.byCognitive).toEqual({ factual: 1, conceptual: 1, controversial: 1 });
    expect(summary.byClosure).toEqual({ closed: 1, open: 2 });
  });

  it("기존 해석적/평가적/적용적 질문도 새 분류로 묶는다", () => {
    const summary = buildInquiryGraphSummary([], [
      { content: "비교해 주세요", cognitive: "interpretive", closure: "open" },
      { content: "판단해 주세요", cognitive: "evaluative", closure: "open" },
      { content: "적용해 주세요", cognitive: "applicative", closure: "closed" },
    ]);

    expect(summary.byCognitive.conceptual).toBe(1);
    expect(summary.byCognitive.controversial).toBe(2);
  });
});
