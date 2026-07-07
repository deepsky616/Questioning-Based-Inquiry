import { describe, it, expect } from "vitest";
import { getRequestLocale, parseAcceptLanguage, languageDirective } from "@/lib/locale";
import { getClientIp } from "@/lib/api-rate-limit";

const req = (headers: Record<string, string>) => new Request("http://x", { headers });

describe("getRequestLocale — 번역 대상 언어 결정(쿠키 우선)", () => {
  it("NEXT_LOCALE 쿠키가 Accept-Language보다 우선한다", () => {
    expect(getRequestLocale(req({ cookie: "NEXT_LOCALE=en", "accept-language": "ko-KR" }))).toBe("en");
  });

  it("여러 쿠키 사이에서도 NEXT_LOCALE을 찾는다", () => {
    expect(getRequestLocale(req({ cookie: "a=1; NEXT_LOCALE=ja; b=2" }))).toBe("ja");
  });

  it("지원하지 않는 쿠키 값은 무시하고 Accept-Language로 폴백한다", () => {
    expect(getRequestLocale(req({ cookie: "NEXT_LOCALE=xx", "accept-language": "en-US,en;q=0.9" }))).toBe("en");
  });

  it("아무 힌트도 없으면 ko", () => {
    expect(getRequestLocale(req({}))).toBe("ko");
  });

  it("parseAcceptLanguage는 지역 태그를 언어 코드로 줄인다", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9,ko;q=0.8")).toBe("en");
    expect(parseAcceptLanguage("xx-YY")).toBe("ko");
  });

  it("languageDirective는 ko면 비어 있고 그 외엔 출력 언어를 지시한다", () => {
    expect(languageDirective("ko")).toBe("");
    expect(languageDirective("en")).toContain("English");
  });
});

describe("getClientIp — 비로그인 rate-limit 키", () => {
  it("x-forwarded-for의 첫 IP를 쓴다", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("x-forwarded-for가 없으면 x-real-ip로 폴백한다", () => {
    expect(getClientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("둘 다 없으면 unknown", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
