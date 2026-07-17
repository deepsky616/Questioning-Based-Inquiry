import { describe, expect, it } from "vitest";
import {
  JsonExtractionError,
  extractJsonArray,
  extractJsonObject,
} from "@/lib/json-extract";

describe("구조화 응답 해석", () => {
  it("코드 블록과 설명 안의 구조화 값을 해석한다", () => {
    expect(extractJsonObject("result: ```json\n{\"ok\":true}\n```"))
      .toEqual({ ok: true });
    expect(extractJsonArray("items: [1, 2, 3]"))
      .toEqual([1, 2, 3]);
  });

  it("빈 응답과 깨진 구조화 응답을 전용 오류로 구분한다", () => {
    expect(() => extractJsonObject(""))
      .toThrow(JsonExtractionError);
    expect(() => extractJsonObject('{"ok":'))
      .toThrow(JsonExtractionError);
  });
});
