import { describe, expect, it } from "vitest";
import { isTransientAiError } from "@/lib/ai-errors";

describe("구글 인공지능 일시 오류 판정", () => {
  it.each([429, 503])("status %s를 재시도 대상으로 판정한다", (status) => {
    const error = Object.assign(new Error("request failed"), { status });
    expect(isTransientAiError(error)).toBe(true);
  });

  it("다른 숫자 상태는 재시도 대상으로 판정하지 않는다", () => {
    const error = Object.assign(new Error("request failed"), { status: 400 });
    expect(isTransientAiError(error)).toBe(false);
  });
});
