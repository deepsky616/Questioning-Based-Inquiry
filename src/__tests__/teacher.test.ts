import { describe, it, expect } from "vitest";
import { validateTeacherClasses, buildTeacherClassLabel, parseTeacherClassKey, sortTeacherClasses, resolveClassInputMode } from "@/lib/teacher";

describe("validateTeacherClasses", () => {
  // 국제화를 위해 완성 문장이 아닌 common 네임스페이스의 메시지 키를 반환한다
  it("유효한 학년·반 목록이면 null을 반환한다", () => {
    const classes = [
      { grade: "3", className: "2" },
      { grade: "3", className: "3" },
    ];
    expect(validateTeacherClasses(classes)).toBeNull();
  });

  it("목록이 비어있으면 classesRequired 키를 반환한다", () => {
    expect(validateTeacherClasses([])).toBe("classesRequired");
  });

  it("학년이 빈 문자열이면 gradeRequired 키를 반환한다", () => {
    expect(validateTeacherClasses([{ grade: "", className: "2" }])).toBe("gradeRequired");
  });

  it("반이 빈 문자열이면 classRequired 키를 반환한다", () => {
    expect(validateTeacherClasses([{ grade: "3", className: "" }])).toBe("classRequired");
  });

  it("중복된 학년·반이 있으면 duplicateClass 키를 반환한다", () => {
    const classes = [
      { grade: "3", className: "2" },
      { grade: "3", className: "2" },
    ];
    expect(validateTeacherClasses(classes)).toBe("duplicateClass");
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
  // 로케일별 표기를 위해 번역 함수를 주입받는다 (common.gradeClassLabel)
  const t = (key: string, values?: Record<string, string | number>) =>
    key === "gradeClassLabel" ? `${values?.grade}학년 ${values?.className}반` : key;

  it("번역 키와 학년·반 값으로 레이블을 만든다", () => {
    expect(buildTeacherClassLabel(t, "3", "2")).toBe("3학년 2반");
  });

  it("단자리 숫자도 정상 처리된다", () => {
    expect(buildTeacherClassLabel(t, "1", "1")).toBe("1학년 1반");
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

describe("sortTeacherClasses", () => {
  it("학년 오름차순으로 정렬한다", () => {
    const input = [
      { grade: "5", className: "1" },
      { grade: "3", className: "2" },
      { grade: "4", className: "1" },
    ];
    const result = sortTeacherClasses(input);
    expect(result.map((c) => c.grade)).toEqual(["3", "4", "5"]);
  });

  it("같은 학년이면 반 오름차순으로 정렬한다", () => {
    const input = [
      { grade: "3", className: "3" },
      { grade: "3", className: "1" },
      { grade: "3", className: "2" },
    ];
    const result = sortTeacherClasses(input);
    expect(result.map((c) => c.className)).toEqual(["1", "2", "3"]);
  });

  it("빈 배열을 그대로 반환한다", () => {
    expect(sortTeacherClasses([])).toEqual([]);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const input = [
      { grade: "4", className: "1" },
      { grade: "3", className: "2" },
    ];
    const copy = [...input];
    sortTeacherClasses(input);
    expect(input).toEqual(copy);
  });
});

describe("resolveClassInputMode", () => {
  it("담당 학급이 없으면 'manual'을 반환한다", () => {
    expect(resolveClassInputMode([])).toBe("manual");
  });

  it("담당 학급이 1개이면 'auto'를 반환한다", () => {
    expect(resolveClassInputMode([{ grade: "3", className: "2" }])).toBe("auto");
  });

  it("담당 학급이 2개 이상이면 'select'를 반환한다", () => {
    const classes = [
      { grade: "3", className: "2" },
      { grade: "4", className: "1" },
    ];
    expect(resolveClassInputMode(classes)).toBe("select");
  });
});
