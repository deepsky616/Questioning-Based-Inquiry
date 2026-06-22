import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/translate";

describe("contentHash", () => {
  it("같은 입력은 같은 해시를 낸다(결정적)", () => {
    expect(contentHash("왜 하늘은 파랄까?")).toBe(contentHash("왜 하늘은 파랄까?"));
  });

  it("입력이 달라지면 해시도 달라진다(원문 수정 감지)", () => {
    expect(contentHash("원문")).not.toBe(contentHash("원문 수정"));
  });

  it("32자 hex 문자열을 반환한다", () => {
    const h = contentHash("테스트 콘텐츠");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
});
