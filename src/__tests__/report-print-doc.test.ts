import { describe, expect, it } from "vitest";
import { printTextOf } from "@/lib/report-print-safe";

describe("printTextOf", () => {
  it("학급 분석 필드가 배열이나 객체여도 출력 가능한 문자열로 바꾼다", () => {
    const text = printTextOf({
      summary: "좋은 질문이 많아요",
      nextQuestions: ["왜 그렇게 생각했나요?", "다르게 보면 어떨까요?"],
    });

    expect(text).toContain("좋은 질문이 많아요");
    expect(text).toContain("왜 그렇게 생각했나요?");
    expect(text).toContain("다르게 보면 어떨까요?");
  });
});
