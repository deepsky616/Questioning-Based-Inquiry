import { describe, it, expect } from "vitest";
import { compareByClassAndNumber, compareStudentNumber } from "@/lib/student-sort";

describe("compareStudentNumber — 번호 숫자 비교", () => {
  it("문자열 사전순이 아니라 숫자순으로 비교한다 (2 < 10)", () => {
    expect(compareStudentNumber("2", "10")).toBeLessThan(0);
    expect(compareStudentNumber("10", "2")).toBeGreaterThan(0);
    expect(compareStudentNumber("3", "3")).toBe(0);
  });

  it("숫자가 아닌 값은 뒤로 보낸다", () => {
    expect(compareStudentNumber("1", null)).toBeLessThan(0);
    expect(compareStudentNumber(undefined, "5")).toBeGreaterThan(0);
  });
});

describe("compareByClassAndNumber — 학급 → 번호순", () => {
  it("학년·반이 같으면 번호순, 다르면 학급 우선", () => {
    const list = [
      { grade: "5", className: "2", studentNumber: "1" },
      { grade: "5", className: "1", studentNumber: "10" },
      { grade: "5", className: "1", studentNumber: "2" },
      { grade: "4", className: "3", studentNumber: "7" },
    ];
    const sorted = [...list].sort(compareByClassAndNumber);
    expect(sorted.map((s) => `${s.grade}-${s.className}-${s.studentNumber}`)).toEqual([
      "4-3-7",
      "5-1-2",
      "5-1-10",
      "5-2-1",
    ]);
  });
});
