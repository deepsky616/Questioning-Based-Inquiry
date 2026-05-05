import { describe, expect, it } from "vitest";
import {
  sanitizeStudentNumberInput,
  STUDENT_LOGIN_AUTOCOMPLETE,
  STUDENT_LOGIN_FORM_PROPS,
  STUDENT_NUMBER_INPUT_PROPS,
  TEACHER_LOGIN_AUTOCOMPLETE,
} from "@/lib/login-autocomplete";

describe("login autocomplete policy", () => {
  it("학생 로그인 폼은 브라우저 자동완성을 끈다", () => {
    expect(STUDENT_LOGIN_FORM_PROPS.autoComplete).toBe("off");
    expect(STUDENT_LOGIN_AUTOCOMPLETE.studentNumber).toBe("off");
    expect(STUDENT_NUMBER_INPUT_PROPS.autoComplete).toBe("off");
  });

  it("교사 로그인만 브라우저 계정 자동완성 username/password를 사용한다", () => {
    expect(TEACHER_LOGIN_AUTOCOMPLETE.email).toBe("username");
    expect(TEACHER_LOGIN_AUTOCOMPLETE.password).toBe("current-password");
  });

  it("학생 번호에는 교사 이메일 자동완성 값을 허용하지 않는다", () => {
    expect(sanitizeStudentNumberInput("teacher@school.kr")).toBe("");
    expect(sanitizeStudentNumberInput("15")).toBe("15");
    expect(sanitizeStudentNumberInput("15번")).toBe("15");
  });
});
