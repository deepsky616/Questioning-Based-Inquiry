import { describe, it, expect } from "vitest";
import { buildStudentEmail, parseStudentEmail } from "@/lib/student-auth";

describe("buildStudentEmail", () => {
  it("학교+학년+반+번호로 내부 이메일을 생성한다", () => {
    const email = buildStudentEmail("한빛초등학교", "2", "3", "15");
    expect(email).toBe("s_한빛초등학교_2_3_15@student.internal");
  });

  it("공백이 있는 학교명도 처리한다", () => {
    const email = buildStudentEmail("한 빛 초등 학교", "1", "2", "3");
    expect(email).toBe("s_한빛초등학교_1_2_3@student.internal");
  });

  it("특수문자를 제거한다", () => {
    const email = buildStudentEmail("한빛(초)", "1", "2", "3");
    expect(email).toBe("s_한빛초_1_2_3@student.internal");
  });
});

describe("parseStudentEmail", () => {
  it("내부 이메일에서 학교·학년·반·번호를 복원한다", () => {
    const result = parseStudentEmail("s_한빛초등학교_2_3_15@student.internal");
    expect(result).toEqual({ school: "한빛초등학교", grade: "2", className: "3", studentNumber: "15" });
  });

  it("학생 내부 이메일이 아니면 null을 반환한다", () => {
    expect(parseStudentEmail("teacher@school.kr")).toBeNull();
  });
});
