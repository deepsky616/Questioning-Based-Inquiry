import { describe, it, expect } from "vitest";
import {
  buildStudentCreateData,
  partitionStudents,
  formatBulkResult,
  type StudentInput,
  type BulkPartition,
} from "@/lib/student-registration";

const hashedPw = "$2b$12$hashedpassword";

describe("buildStudentCreateData", () => {
  it("학생 생성 데이터를 올바르게 빌드한다", () => {
    const data = buildStudentCreateData(
      { studentNumber: "3", name: "박민준" },
      { school: "서울초", grade: "3", className: "2" },
      hashedPw
    );
    expect(data.name).toBe("박민준");
    expect(data.role).toBe("STUDENT");
    expect(data.school).toBe("서울초");
    expect(data.grade).toBe("3");
    expect(data.className).toBe("2");
    expect(data.studentNumber).toBe("3");
    expect(data.password).toBe(hashedPw);
  });

  it("email 필드를 포함하지 않는다", () => {
    const data = buildStudentCreateData(
      { studentNumber: "3", name: "박민준" },
      { school: "서울초", grade: "3", className: "2" },
      hashedPw
    );
    expect(data).not.toHaveProperty("email");
  });

  it("학생과 학급 식별값의 앞뒤 공백을 제거한다", () => {
    const data = buildStudentCreateData(
      { studentNumber: " 3 ", name: " 박민준 " },
      { school: " 서울초 ", grade: " 3 ", className: " 2 " },
      hashedPw
    );

    expect(data).toMatchObject({
      name: "박민준",
      school: "서울초",
      grade: "3",
      className: "2",
      studentNumber: "3",
    });
  });
});

describe("partitionStudents", () => {
  const classInfo = { school: "서울초", grade: "3", className: "2" };

  it("이미 존재하는 학생은 skipped로 분류된다 (학번 기준)", () => {
    const students: StudentInput[] = [
      { studentNumber: "1", name: "홍길동" },
      { studentNumber: "2", name: "김철수" },
    ];
    const existingNumbers = new Set<string>(["1"]);

    const result: BulkPartition = partitionStudents(students, classInfo, existingNumbers);
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].name).toBe("김철수");
    expect(result.skippedCount).toBe(1);
  });

  it("중복 없으면 모두 toCreate에 포함된다", () => {
    const students: StudentInput[] = [
      { studentNumber: "1", name: "홍길동" },
      { studentNumber: "2", name: "김철수" },
    ];
    const result: BulkPartition = partitionStudents(students, classInfo, new Set());
    expect(result.toCreate).toHaveLength(2);
    expect(result.skippedCount).toBe(0);
  });

  it("모두 존재하면 toCreate가 비어있다", () => {
    const students: StudentInput[] = [{ studentNumber: "1", name: "홍길동" }];
    const existingNumbers = new Set<string>(["1"]);
    const result: BulkPartition = partitionStudents(students, classInfo, existingNumbers);
    expect(result.toCreate).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  it("한 요청 안의 같은 번호는 공백을 정리한 뒤 한 번만 생성한다", () => {
    const students: StudentInput[] = [
      { studentNumber: " 7 ", name: "첫 학생" },
      { studentNumber: "7", name: "중복 학생" },
    ];

    const result = partitionStudents(students, classInfo, new Set());

    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0]).toMatchObject({ studentNumber: "7", name: "첫 학생" });
    expect(result.skippedCount).toBe(1);
  });

  it("기존 번호에도 공백 정규화를 적용해 중복 생성을 막는다", () => {
    const result = partitionStudents(
      [{ studentNumber: "7", name: "학생" }],
      classInfo,
      new Set([" 7 "])
    );

    expect(result.toCreate).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });
});

describe("formatBulkResult", () => {
  it("생성·건너뜀·오류 수를 요약한다", () => {
    const result = formatBulkResult({ created: 5, skipped: 2, errors: ["3번 실패"] });
    expect(result).toContain("5");
    expect(result).toContain("2");
    expect(result).toContain("1");
  });

  it("오류 없으면 오류 언급이 없다", () => {
    const result = formatBulkResult({ created: 3, skipped: 0, errors: [] });
    expect(result).toContain("3");
    expect(result).not.toContain("실패");
  });
});
