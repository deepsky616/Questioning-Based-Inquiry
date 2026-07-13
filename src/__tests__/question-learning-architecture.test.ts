import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

const practiceView = readFileSync("src/components/shared/QuestionPracticeView.tsx", "utf8");
const studentPractice = readFileSync("src/app/(student)/student-practice/page.tsx", "utf8");
const teacherPractice = readFileSync("src/app/(teacher)/teacher-practice/page.tsx", "utf8");
const summaryPath = "src/components/shared/QuestionLearningSummary.tsx";
const summary = existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : "";
const experiencePath = "src/components/shared/QuestionLearningExperience.tsx";
const studentLearningPath = "src/app/(student)/student-question-learning/page.tsx";
const teacherLearningPath = "src/app/(teacher)/teacher-question-learning/page.tsx";
const experience = existsSync(experiencePath) ? readFileSync(experiencePath, "utf8") : "";
const studentLearning = existsSync(studentLearningPath) ? readFileSync(studentLearningPath, "utf8") : "";
const teacherLearning = existsSync(teacherLearningPath) ? readFileSync(teacherLearningPath, "utf8") : "";
const slideContent = readFileSync("src/components/shared/QuestionLearningSlideContent.tsx", "utf8");

describe("질문 학습과 질문 연습의 구성 경계", () => {
  it("공용 연습 보기는 전체 학습과 역할별 경로를 알지 않는다", () => {
    expect(practiceView).not.toContain("QuestionDetectiveSlides");
    expect(practiceView).not.toContain("student-question-learning");
    expect(practiceView).not.toContain("teacher-question-learning");
  });

  it("학생과 교사 페이지가 각 역할의 학습 요약을 조합한다", () => {
    expect(existsSync(summaryPath)).toBe(true);
    expect(studentPractice).toContain("QuestionLearningSummary");
    expect(studentPractice).toContain('detailsHref="/student-question-learning"');
    expect(teacherPractice).toContain("QuestionLearningSummary");
    expect(teacherPractice).toContain('detailsHref="/teacher-question-learning"');
  });

  it("요약은 승인된 자료에서 닫힌 질문과 열린 질문의 차이를 읽는다", () => {
    expect(summary).toContain("content.answerRangeGuide.closed.definition");
    expect(summary).toContain("content.answerRangeGuide.open.definition");
  });

  it("연습 요약은 기존 질문 유형 알아보기 이름을 유지한다", () => {
    expect(ko.questionLearning.summaryTitle).toBe("질문 유형 알아보기");
    expect(en.questionLearning.summaryTitle).toBe("Learn the question types");
  });

  it("학생과 교사 전체 학습 페이지가 같은 공통 경험을 사용한다", () => {
    expect(existsSync(experiencePath)).toBe(true);
    expect(experience).toContain("QuestionDetectiveSlides");
    expect(studentLearning).toContain("QuestionLearningExperience");
    expect(teacherLearning).toContain("QuestionLearningExperience");
  });

  it("학생과 교사 학습 페이지가 역할을 명시한다", () => {
    expect(studentLearning).toContain('audience="student"');
    expect(teacherLearning).toContain('audience="teacher"');
    expect(slideContent).not.toContain("student-practice");
    expect(slideContent).not.toContain("teacher-practice");
  });

  it("학습 본문의 접근성 이름을 고정된 한국어 문구로 덮어쓰지 않는다", () => {
    expect(slideContent).not.toContain('aria-label="좋은 질문이 하는 일"');
    expect(slideContent).not.toContain('aria-label="질문 유형 세로 비교 자료"');
    expect(slideContent).not.toContain('aria-label="질문 유형 선택"');
  });
});
