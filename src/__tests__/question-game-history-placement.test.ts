import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const teacherReport = readFileSync("src/components/teacher/TeacherReportsView.tsx", "utf8");
const studentReport = readFileSync("src/components/reports/StudentReportView.tsx", "utf8");
const teacherQuestionPlay = readFileSync("src/app/(teacher)/teacher-question-play/page.tsx", "utf8");
const studentQuestionPlay = readFileSync("src/app/(student)/student-question-play/page.tsx", "utf8");

describe("질문놀이 학습 기록 배치", () => {
  it("상세 리포트에서는 질문놀이 학습 기록을 보여 주지 않는다", () => {
    expect(teacherReport).not.toContain("QuestionGameLearningHistory");
    expect(studentReport).not.toContain("QuestionGameLearningHistory");
  });

  it("학생과 교사 질문놀이 페이지에서 학습 기록을 보여 준다", () => {
    expect(studentQuestionPlay).toContain("StudentQuestionGameLearningHistory");
    expect(teacherQuestionPlay).toContain("TeacherQuestionGameLearningOverview");
  });
});
