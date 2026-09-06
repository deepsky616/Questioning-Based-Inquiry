import { describe, expect, it } from "vitest";
import { buildDemoRankingStudents } from "../../scripts/seed-usb-demo.mjs";
import { buildDemoStudentNamePlan } from "../../scripts/rename-usb-demo-students.mjs";

function accounts() {
  return [
    ...Array.from({ length: 28 }, (_, index) => ({
      id: `usb-demo-student-${String(index + 1).padStart(2, "0")}`,
      name: `기존학생${index + 1}`, school: "질문초등학교", grade: "4", className: "1",
      studentNumber: String(index + 1),
    })),
    ...buildDemoRankingStudents().map((student) => ({ ...student, name: `기존-${student.id}` })),
  ].map((student) => ({ ...student, role: "STUDENT", isDemo: true }));
}

describe("기존 시연 학생 가명 변경 범위", () => {
  it("조회 순서와 무관하게 같은 학생에게 같은 번호를 지정한다", () => {
    const plan = buildDemoStudentNamePlan(accounts().reverse());
    expect(plan).toHaveLength(405);
    expect(plan[0]).toMatchObject({ id: "usb-demo-student-01", after: "학생1" });
    expect(plan[27]).toMatchObject({ id: "usb-demo-student-28", after: "학생28" });
    expect(plan[28]).toMatchObject({ id: "usb-demo-rank-01-01", after: "학생29" });
    expect(plan[404]).toMatchObject({ id: "usb-demo-rank-14-29", after: "학생405" });
    expect(new Set(plan.map((change) => change.after)).size).toBe(405);
  });

  it.each([
    { isDemo: false },
    { role: "TEACHER" },
    { school: "실제 학교" },
    { id: "unrelated-student" },
  ])("시연 학생 신원이 다르면 변경 계획을 거부한다: %j", (changed) => {
    const users = accounts();
    Object.assign(users[0], changed);
    expect(() => buildDemoStudentNamePlan(users)).toThrow("시연 학생 신원");
  });

  it("학생이 누락되면 일부만 바꾸지 않는다", () => {
    expect(() => buildDemoStudentNamePlan(accounts().slice(1))).toThrow("시연 학생 목록");
  });

  it("이미 가명이 적용된 학생은 다시 변경하지 않는다", () => {
    const users = accounts();
    const names = new Map(buildDemoStudentNamePlan(users).map((change) => [change.id, change.after]));
    expect(buildDemoStudentNamePlan(users.map((user) => ({ ...user, name: names.get(user.id)! })))).toEqual([]);
  });
});
