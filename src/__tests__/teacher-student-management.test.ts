import { describe, expect, it } from "vitest";
import {
  matchesStudentManagementSearch,
  summarizeStudentActivity,
} from "@/lib/teacher-student-management";

describe("교사 학생관리 화면 계산", () => {
  it("현재 표시된 학생만으로 활동 요약을 계산한다", () => {
    const summary = summarizeStudentActivity([
      {
        questionCount: 4,
        commentCount: 3,
        totalPoints: 10,
      },
      {
        questionCount: 1,
        commentCount: 2,
        totalPoints: 5,
      },
    ]);

    expect(summary).toEqual({
      studentCount: 2,
      totalQuestions: 5,
      totalAnswers: 5,
      totalPoints: 15,
      averagePoints: 8,
    });
  });

  it("표시된 학생이 없으면 모든 요약값을 0으로 계산한다", () => {
    expect(summarizeStudentActivity([])).toEqual({
      studentCount: 0,
      totalQuestions: 0,
      totalAnswers: 0,
      totalPoints: 0,
      averagePoints: 0,
    });
  });

  it.each([
    ["김하늘", true],
    ["27", true],
    ["5학년 2반", true],
    ["5-2", true],
    ["5 2", true],
    ["grade 5 class 2", true],
    ["6학년 1반", false],
    ["없는 학생", false],
  ])("이름·번호·학년반 검색어 %s의 일치 여부를 판단한다", (query, expected) => {
    expect(matchesStudentManagementSearch({
      name: "김하늘",
      studentNumber: "27",
      grade: "5",
      className: "2",
    }, query)).toBe(expected);
  });

  it("빈 검색어는 모든 학생과 일치한다", () => {
    expect(matchesStudentManagementSearch({
      name: "김하늘",
      studentNumber: "27",
      grade: "5",
      className: "2",
    }, "   ")).toBe(true);
  });
});
