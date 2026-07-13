import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionPracticePrintGuide } from "@/lib/question-practice-print-guide";

const pageSource = readFileSync("src/app/(teacher)/teacher-practice/print-guide/page.tsx", "utf8");
const cssSource = readFileSync("src/app/globals.css", "utf8");

describe("질문연습 학습지 출력", () => {
  it("교사용 안내가 아니라 학생 배부용 학습지 정보와 작성란을 제공한다", () => {
    const guide = getQuestionPracticePrintGuide("ko");
    expect(guide.eyebrow).toContain("학생");
    expect(guide.gradeLabel).toBe("학년");
    expect(guide.classNameLabel).toBe("반");
    expect(guide.numberLabel).toBe("번호");
    expect(guide.nameLabel).toBe("이름");
  });

  it("페이지는 학생 작성란과 활동별 답안 영역을 렌더링한다", () => {
    expect(pageSource).toContain("question-practice-print-light");
    expect(pageSource).toContain("question-practice-print-mode");
    expect(pageSource).toContain("originalThemeRef");
    expect(pageSource).toContain("root.classList.remove(\"dark\")");
    expect(pageSource).toContain("body.classList.remove(\"dark\")");
    expect(pageSource).toContain("requestAnimationFrame");
    expect(pageSource).toContain("onClick={printWorksheet}");
    expect(pageSource).toContain("question-practice-print-page");
    expect(pageSource).toContain("qp-toolbar");
    expect(pageSource).toContain('style={{ colorScheme: "light" }}');
    expect(pageSource).toContain("qp-student-fields ml-auto flex");
    expect(pageSource).toContain("qp-student-row-meta grid grid-cols-3");
    expect(pageSource).toContain("qp-student-row-name flex justify-end");
    expect(pageSource).toContain("guide.gradeLabel");
    expect(pageSource).toContain("guide.classNameLabel");
    expect(pageSource).toContain("guide.numberLabel");
    expect(pageSource).toContain("guide.nameLabel");
    expect(pageSource).not.toContain("guide.dateLabel");
    expect(pageSource).not.toContain("guide.lessonLabel");
    expect(pageSource).not.toContain("guide.goalTitle");
    expect(pageSource).not.toContain("guide.howToTitle");
    expect(pageSource).toContain("qp-answer-box");
    expect(pageSource).toContain("qp-write-line");
    expect(pageSource).toContain("친구와 토의하고 싶은 질문");
  });

  it("어두운 테마 인쇄에서도 학습지 색을 라이트 문서로 강제한다", () => {
    expect(cssSource).toContain(".question-practice-print,");
    expect(cssSource).toContain(".question-practice-print *");
    expect(cssSource).toContain("color-scheme: light !important");
    expect(cssSource).toContain("html.question-practice-print-light");
    expect(cssSource).toContain("html.question-practice-print-light.dark");
    expect(cssSource).toContain("body.question-practice-print-light main");
    expect(cssSource).toContain("@page question-practice");
    expect(cssSource).toContain("margin: 7mm");
    expect(cssSource).toContain("page: question-practice");
    expect(cssSource).toContain("body.question-practice-print-mode *");
    expect(cssSource).toContain("visibility: hidden !important");
    expect(cssSource).toContain("visibility: visible !important");
    expect(cssSource).toContain("body.question-practice-print-light main > div.mt-8.pt-4.border-t");
    expect(cssSource).toContain("mix-blend-mode: normal !important");
    expect(cssSource).toContain("text-shadow: none !important");
    expect(cssSource).toContain(".question-practice-print-page .question-practice-print h1");
    expect(cssSource).toContain(".question-practice-print-page .question-practice-print.qp-paper");
    expect(cssSource).toContain(".question-practice-print-page .question-practice-print .qp-card");
    expect(cssSource).toContain(".question-practice-print .qp-write-line");
    expect(cssSource).toContain(".question-practice-print .qp-card");
    expect(cssSource).toContain(".question-practice-print .qp-student-row-meta");
    expect(cssSource).toContain(".question-practice-print-page .qp-toolbar");
  });
});
