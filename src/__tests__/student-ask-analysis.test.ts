import { describe, expect, it } from "vitest";

import { isAnalysisCurrent } from "@/lib/student-ask-analysis";

describe("질문 분석 묶음", () => {
  const snapshot = {
    content: "왜 비가 올까요?",
    sessionId: "session-1",
    result: { cognitive: "conceptual" },
  } as const;

  it("현재 질문과 수업이 분석 당시 값과 같을 때만 저장할 수 있다", () => {
    expect(isAnalysisCurrent(" 왜 비가 올까요? ", "session-1", snapshot)).toBe(true);
    expect(isAnalysisCurrent("비는 어떻게 만들어질까요?", "session-1", snapshot)).toBe(false);
    expect(isAnalysisCurrent("왜 비가 올까요?", "session-2", snapshot)).toBe(false);
    expect(isAnalysisCurrent("", "session-1", snapshot)).toBe(false);
  });
});
