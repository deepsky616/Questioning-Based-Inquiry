import { describe, it, expect } from "vitest";
import { validateTeacherClasses, buildTeacherClassLabel, parseTeacherClassKey } from "@/lib/teacher";

describe("validateTeacherClasses", () => {
  it("유효한 학년·반 목록이면 null을 반환한다", () => {
    const classes = [
      { grade: "3", className: "2" },
      { grade: "3", className: "3" },
    ];
    expect(validateTeacherClasses(classes)).toBeNull();
  });

  it("목록이 비어있으면 에러를 반환한다", () => {
    expect(validateTeacherClasses([])).not.toBeNull();
  });

  it("학년이 빈 문자열이면 에러를 반환한다", () => {
    expect(validateTeacherClasses([{ grade: "", className: "2" }])).not.toBeNull();
  });

  it("반이 빈 문자열이면 에러를 반환한다", () => {
    expect(validateTeacherClasses([{ grade: "3", className: "" }])).not.toBeNull();
  });

  it("중복된 학년·반이 있으면 에러를 반환한다", () => {
    const classes = [
      { grade: "3", className: "2" },
      { grade: "3", className: "2" },
    ];
    expect(validateTeacherClasses(classes)).not.toBeNull();
  });

  it("서로 다른 학년의 같은 반 번호는 허용된다", () => {
    const classes = [
      { grade: "3", className: "2" },
      { grade: "4", className: "2" },
    ];
    expect(validateTeacherClasses(classes)).toBeNull();
  });
});

describe("buildTeacherClassLabel", () => {
  it("학년과 반을 조합한 레이블을 반환한다", () => {
    expect(buildTeacherClassLabel("3", "2")).toBe("3학년 2반");
  });

  it("단자리 숫자도 정상 처리된다", () => {
    expect(buildTeacherClassLabel("1", "1")).toBe("1학년 1반");
  });
});

describe("parseTeacherClassKey", () => {
  it("'grade-className' 키를 파싱한다", () => {
    expect(parseTeacherClassKey("3-2")).toEqual({ grade: "3", className: "2" });
  });

  it("잘못된 형식이면 null을 반환한다", () => {
    expect(parseTeacherClassKey("invalid")).toBeNull();
  });
});
