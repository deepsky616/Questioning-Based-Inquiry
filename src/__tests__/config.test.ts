import { describe, it, expect } from "vitest";
import { maskApiKey, resolveApiKey } from "@/lib/api-config";

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
