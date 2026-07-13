import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionPracticePrintGuide } from "@/lib/question-practice-print-guide";

const pageSource = readFileSync("src/app/(teacher)/teacher-practice/print-guide/page.tsx", "utf8");
const cssSource = readFileSync("src/app/globals.css", "utf8");

describe("질문연습 학습지 출력", () => {
  it("교사용 안내가 아니라 학생 배부용 학습지 정보와 작성란을 제공한다", () => {
    const guide = getQuestionPracticePrintGuide("ko");
    expect(guide.eyebrow).toContain("학생");
    expect(guide.goalTitle).toBe("오늘의 학습 목표");
    expect(guide.goals.length).toBeGreaterThanOrEqual(3);
    expect(guide.howToItems.length).toBeGreaterThanOrEqual(3);
    expect(guide.dateLabel).toBe("날짜");
    expect(guide.lessonLabel).toBe("수업/단원");
  });

  it("페이지는 학생 작성란과 활동별 답안 영역을 렌더링한다", () => {
    expect(pageSource).toContain("qp-student-fields");
    expect(pageSource).toContain("guide.goalTitle");
    expect(pageSource).toContain("guide.howToTitle");
    expect(pageSource).toContain("qp-answer-box");
    expect(pageSource).toContain("qp-write-line");
    expect(pageSource).toContain("친구와 토의하고 싶은 질문");
  });

  it("어두운 테마 인쇄에서도 학습지 색을 라이트 문서로 강제한다", () => {
    expect(cssSource).toContain(".question-practice-print,");
    expect(cssSource).toContain(".question-practice-print *");
    expect(cssSource).toContain("color-scheme: light !important");
    expect(cssSource).toContain("mix-blend-mode: normal !important");
    expect(cssSource).toContain("text-shadow: none !important");
    expect(cssSource).toContain(".question-practice-print .qp-write-line");
  });
});
