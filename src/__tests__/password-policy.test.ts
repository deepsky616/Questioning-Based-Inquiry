import { describe, it, expect } from "vitest";
import { validatePasswordPolicy } from "@/lib/password-policy";

describe("validatePasswordPolicy", () => {
  it("규칙을 만족하는 비밀번호는 통과(null)", () => {
    expect(validatePasswordPolicy("edunet0079!")).toBeNull();
    expect(validatePasswordPolicy("@1544EDUNET")).toBeNull();
    expect(validatePasswordPolicy("Ab1!abcd")).toBeNull(); // 8자 경계
  });

  it("길이 위반(8자 미만/16자 초과)", () => {
    expect(validatePasswordPolicy("Ab1!ab")).toMatch(/8~16자/);
    expect(validatePasswordPolicy("Ab1!" + "a".repeat(14))).toMatch(/8~16자/);
  });

  it("3가지 조합(숫자·영문·특수) 미충족", () => {
    expect(validatePasswordPolicy("abcdefgh")).toMatch(/3가지/);      // 영문만
    expect(validatePasswordPolicy("abcd1234")).toMatch(/3가지/);      // 특수문자 없음
    expect(validatePasswordPolicy("abcd!@#$")).toMatch(/3가지/);      // 숫자 없음
  });

  it("허용되지 않은 특수문자 사용", () => {
    expect(validatePasswordPolicy("edunet0079~")).toMatch(/사용할 수 없는/);
    expect(validatePasswordPolicy("edunet0079!한글")).toMatch(/사용할 수 없는/);
  });
});
