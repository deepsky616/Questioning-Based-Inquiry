import { describe, it, expect } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  isAllowedGeminiModel,
  maskApiKey,
  resolveApiKey,
  resolveGeminiModel,
} from "@/lib/api-config";

describe("maskApiKey", () => {
  it("API 키의 앞 4자와 뒤 4자만 보여주고 나머지는 *로 마스킹한다", () => {
    expect(maskApiKey("AIzaSyAbCdEfGhIjKlMnOpQrStUv")).toBe("AIza********************StUv");
  });

  it("12자 미만이면 전체를 마스킹한다", () => {
    expect(maskApiKey("shortkey")).toBe("********");
  });

  it("빈 문자열이면 빈 문자열을 반환한다", () => {
    expect(maskApiKey("")).toBe("");
  });
});

describe("resolveApiKey", () => {
  it("요청 키가 있으면 요청 키를 우선 사용한다", () => {
    expect(resolveApiKey("request-key-12345", "server-key-12345")).toBe("request-key-12345");
  });

  it("요청 키가 없으면 서버 키를 사용한다", () => {
    expect(resolveApiKey(undefined, "server-key-12345")).toBe("server-key-12345");
  });

  it("요청 키가 빈 문자열이면 서버 키를 사용한다", () => {
    expect(resolveApiKey("", "server-key-12345")).toBe("server-key-12345");
  });

  it("둘 다 없으면 null을 반환한다", () => {
    expect(resolveApiKey(undefined, undefined)).toBeNull();
  });

  it("서버 키만 없으면 요청 키를 사용한다", () => {
    expect(resolveApiKey("request-key-12345", undefined)).toBe("request-key-12345");
  });
});

describe("Gemini model config", () => {
  it("허용 모델은 Gemini 2.5 계열 3개뿐이다", () => {
    expect(GEMINI_MODELS.map((model) => model.value)).toEqual([
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
  });

  it("허용된 모델만 true를 반환한다", () => {
    expect(isAllowedGeminiModel("gemini-2.5-pro")).toBe(true);
    expect(isAllowedGeminiModel("gemini-2.5-flash")).toBe(true);
    expect(isAllowedGeminiModel("gemini-2.5-flash-lite")).toBe(true);
    expect(isAllowedGeminiModel("gemini-2.0-flash")).toBe(false);
  });

  it("저장값이 없거나 허용되지 않으면 기본 모델을 사용한다", () => {
    expect(resolveGeminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("gemini-2.0-flash")).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel("gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });
});
