import { describe, expect, it } from "vitest";
import {
  sessionWhereForStudent,
  studentCanAccessSession,
} from "@/lib/session-access-policy";
import { sessionTargetsStudent } from "@/lib/session-targeting";

const incompleteClassSession = {
  targetType: "CLASS",
  targetGrade: null,
  targetClassName: null,
  targetStudentId: null,
  targetStudentIds: [],
};

describe("질문수업 대상 순수 정책", () => {
  it("학년과 반이 비어 있는 학급 대상은 불완전 학생 자료와 일치하지 않는다", () => {
    expect(sessionTargetsStudent(incompleteClassSession, {
      id: "student-1",
      grade: null,
      className: null,
    })).toBe(false);
  });

  it("학급 정보가 비어 있어도 명시된 학생 번호는 계속 대상으로 인정한다", () => {
    expect(sessionTargetsStudent(
      { ...incompleteClassSession, targetStudentIds: ["student-1"] },
      { id: "student-1", grade: null, className: null },
    )).toBe(true);
  });

  it("목록 질의의 학생 번호 배열 조건은 알려진 대상 종류에만 적용한다", () => {
    const where = sessionWhereForStudent({
      id: "student-1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
    });

    expect(where?.OR).toContainEqual({
      targetType: { in: ["CLASS", "STUDENT", "CUSTOM"] },
      targetStudentIds: { array_contains: "student-1" },
    });
    expect(where?.teacher).toEqual(expect.objectContaining({ role: "TEACHER" }));
  });

  it("수업 소유자가 현재 교사가 아니면 학생 접근을 허용하지 않는다", () => {
    expect(studentCanAccessSession(
      {
        teacherId: "teacher-1",
        targetType: "ALL",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: null,
        targetStudentIds: [],
        teacher: { role: "STUDENT", school: "한빛초", teacherClasses: [] },
      },
      {
        id: "student-1",
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
      },
    )).toBe(false);
  });

  it("학년과 반이 비어 있는 학생은 학교 전체 수업도 직접 열 수 없다", () => {
    expect(studentCanAccessSession(
      {
        teacherId: "teacher-1",
        targetType: "ALL",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: null,
        targetStudentIds: [],
        teacher: { role: "TEACHER", school: "한빛초", teacherClasses: [] },
      },
      {
        id: "student-1",
        role: "STUDENT",
        school: "한빛초",
        grade: null,
        className: null,
      },
    )).toBe(false);
  });
});
