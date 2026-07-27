import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const teacherSource = readFileSync("src/app/(teacher)/teacher-questions/DeployedDesignList.tsx", "utf8");
const studentSource = readFileSync("src/components/student/UnitDesignView.tsx", "utf8");

describe("내용별 묶음 접기 토글", () => {
  it("교사 배포 목록의 내용별 묶음 패널은 자체 접기 상태와 접근성 속성을 가진다", () => {
    expect(teacherSource).toContain("openGroups");
    expect(teacherSource).toContain("toggleGroup");
    expect(teacherSource).toContain("aria-expanded={openGroups.has(s.id)}");
    expect(teacherSource).toContain("<CollapseChevron open={openGroups.has(s.id)}");
    expect(teacherSource).toContain("className=\"mb-2 flex w-full items-center justify-between");
  });

  it("학생 수업 탐구 질문은 참고자료나 중복 묶음 패널 없이 질문 흐름만 표시한다", () => {
    expect(studentSource).not.toContain("SessionReferencePanel");
    expect(studentSource).not.toContain("groupPanelOpen");
    expect(studentSource).toContain("data-class-inquiry-flow");
    expect(studentSource).toContain("data-student-question-cluster");
    expect(studentSource).toContain("orderedQuestions");
  });
});
