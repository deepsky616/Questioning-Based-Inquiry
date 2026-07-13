import { describe, expect, it } from "vitest";

import { isAnalysisCurrent } from "@/lib/student-ask-analysis";

describe("질문 분석 묶음", () => {
  const snapshot = {
    content: "왜 비가 올까요?",
    result: { cognitive: "conceptual" },
  } as const;

  it("현재 질문과 분석 당시 질문이 같을 때만 저장할 수 있다", () => {
    expect(isAnalysisCurrent(" 왜 비가 올까요? ", snapshot)).toBe(true);
    expect(isAnalysisCurrent("비는 어떻게 만들어질까요?", snapshot)).toBe(false);
    expect(isAnalysisCurrent("", snapshot)).toBe(false);
  });
});
