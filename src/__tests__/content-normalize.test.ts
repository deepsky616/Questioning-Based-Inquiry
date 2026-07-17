import { describe, expect, it } from "vitest";
import { normalizeContent } from "@/lib/content-normalize";

describe("질문과 답변 내용 정규화", () => {
  it("모든 언어의 글자와 숫자만 남기고 기호와 그림 문자를 제거한다", () => {
    expect(normalizeContent("  질문-#🙂 123!  ")).toBe("질문123");
    expect(normalizeContent("Hello_World 42")).toBe("helloworld42");
  });

  it("기호와 그림 문자만 있으면 빈 값으로 판단한다", () => {
    expect(normalizeContent("--- ### 🙂 !!!")).toBe("");
  });

  it("구두점만 다른 내용은 같은 중복 키가 된다", () => {
    expect(normalizeContent("왜-그럴까?"))
      .toBe(normalizeContent("왜 그럴까!!!"));
  });

  it("조합 방식만 다른 같은 글자는 같은 중복 키가 된다", () => {
    expect(normalizeContent("caf\u00e9")).toBe(normalizeContent("cafe\u0301"));
  });

  it("호환 숫자와 글자는 일반 글자와 십진 숫자로 맞춘다", () => {
    expect(normalizeContent("\u2163 \u00b2 \u00bd")).toBe("iv212");
  });
});
