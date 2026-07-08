import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const teacherReportsSource = readFileSync("src/components/teacher/TeacherReportsView.tsx", "utf8");

describe("전체 학생 리포트 출력", () => {
  it("전체 학생 출력은 묶음 리포트 API를 사용한다", () => {
    expect(existsSync("src/app/api/reports/students/route.ts")).toBe(true);
    expect(teacherReportsSource).toContain('fetch("/api/reports/students"');
    expect(teacherReportsSource).not.toContain("ids.map((id) =>");
    expect(teacherReportsSource).not.toContain("/api/reports/student?studentId=");
  });
});
