import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionPracticePrintGuide } from "@/lib/question-practice-print-guide";

const pageSource = readFileSync("src/app/(teacher)/teacher-practice/print-guide/page.tsx", "utf8");
const cssSource = readFileSync("src/app/globals.css", "utf8");

function getCssBlock(source: string, header: string) {
  const headerIndex = source.indexOf(`${header} {`);
  if (headerIndex === -1) {
    throw new Error(`CSS block not found: ${header}`);
  }

  const openingBraceIndex = source.indexOf("{", headerIndex);
  let depth = 0;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBraceIndex + 1, index);
  }

  throw new Error(`CSS block is not closed: ${header}`);
}

function getExactCssRule(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const match = sourceWithoutComments.match(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`),
  );

  if (!match) {
    throw new Error(`Exact CSS rule not found: ${selector}`);
  }

  return match[1];
}

const printCss = getCssBlock(cssSource, "@media print");

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
    const titleIndex = pageSource.indexOf("{guide.title}");
    const subtitleIndex = pageSource.indexOf("{guide.subtitle}");
    const studentFieldsIndex = pageSource.indexOf("qp-student-fields");
    const metaRowIndex = pageSource.indexOf("qp-student-row-meta");
    const nameRowIndex = pageSource.indexOf("qp-student-row-name");

    expect(pageSource).toContain("question-practice-print-mode");
    expect(pageSource).not.toContain("originalThemeRef");
    expect(pageSource).not.toContain("classList.remove(\"dark\")");
    expect(pageSource).toContain("requestAnimationFrame");
    expect(pageSource).toContain("onClick={printWorksheet}");
    expect(pageSource).toContain("question-practice-print-page");
    expect(pageSource).toContain("qp-toolbar");
    expect(pageSource).toContain("qp-teacher-note");
    expect(pageSource).toContain("guide.teacherNote");
    expect(pageSource).toContain('style={{ colorScheme: "light" }}');
    expect(pageSource).toContain("qp-guide mt-6 space-y-4");
    expect(pageSource).toContain("qp-sheet qp-sheet-guide");
    expect(pageSource).toContain("qp-sheet qp-sheet-activity qp-activity");
    expect(pageSource).toContain("qp-card-grid");
    expect(pageSource).toContain("qp-pattern-grid");
    expect(pageSource).toContain("qp-prompt-list");
    expect(pageSource).toContain("qp-writing-lines");
    expect(titleIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(subtitleIndex);
    expect(subtitleIndex).toBeLessThan(studentFieldsIndex);
    expect(metaRowIndex).toBeLessThan(nameRowIndex);
    expect(pageSource).not.toContain("qp-student-fields ml-auto");
    expect(pageSource).toContain("qp-student-row-meta grid grid-cols-3");
    expect(pageSource).toContain("qp-student-row-name flex");
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
    expect(cssSource).not.toContain("question-practice-print-light");
    expect(cssSource).toContain("@page question-practice");
    expect(cssSource).toContain("margin: 6mm");
    expect(cssSource).toContain("page: question-practice");
    expect(cssSource).toContain("break-after: page");
    expect(cssSource).toContain("page-break-after: always");
    expect(cssSource).toContain("body.question-practice-print-mode *");
    expect(cssSource).toContain("visibility: hidden !important");
    expect(cssSource).toContain("visibility: visible !important");
    expect(cssSource).toContain("mix-blend-mode: normal !important");
    expect(cssSource).toContain("text-shadow: none !important");
    expect(cssSource).toContain("html.dark .question-practice-print-page .qp-toolbar button");
    expect(cssSource).toContain("html.dark .question-practice-print-page .qp-teacher-note");
    expect(cssSource).toContain(".question-practice-print-page .question-practice-print h1");
    expect(cssSource).toContain("html.dark .question-practice-print-page .question-practice-print h1");
    expect(cssSource).toContain(".question-practice-print-page .question-practice-print.qp-paper");
    expect(cssSource).toContain(".question-practice-print-page .question-practice-print .qp-card");
    expect(cssSource).toContain(".question-practice-print .qp-write-line");
    expect(cssSource).toContain(".question-practice-print .qp-card");
    expect(cssSource).toContain(".question-practice-print .qp-student-row-meta");
    expect(cssSource).toContain("height: 11px !important");
    expect(cssSource).toContain("font-size: 11px !important");
    expect(cssSource).toContain(".question-practice-print .qp-pattern ul");
    expect(cssSource).toContain(".question-practice-print-page .qp-toolbar");
  });

  it("두 쪽 높이를 채우고 카드와 답안 영역을 균등하게 배치한다", () => {
    const printModeBodyRule = getExactCssRule(printCss, "body.question-practice-print-mode");
    const sheetRule = getExactCssRule(printCss, ".question-practice-print .qp-sheet");
    const sheetGuideRule = getExactCssRule(printCss, ".question-practice-print .qp-sheet-guide");
    const eyebrowRule = getExactCssRule(printCss, ".question-practice-print .qp-eyebrow");
    const cardGridRule = getExactCssRule(printCss, ".question-practice-print .qp-card-grid");
    const promptListRule = getExactCssRule(printCss, ".question-practice-print .qp-prompt-list");
    const writingLinesRule = getExactCssRule(printCss, ".question-practice-print .qp-writing-lines");
    const nameRowRule = getExactCssRule(printCss, ".question-practice-print .qp-student-row-name");
    const nameFieldRule = getExactCssRule(
      printCss,
      ".question-practice-print .qp-student-row-name .qp-field",
    );
    const nameWriteLineRule = getExactCssRule(
      printCss,
      ".question-practice-print .qp-student-row-name .qp-write-line",
    );
    const questionWriteLineRule = getExactCssRule(
      printCss,
      ".question-practice-print .qp-question-block .qp-write-line",
    );

    expect(printModeBodyRule).toContain("page: question-practice !important");
    expect(sheetRule).toContain("height: 284mm !important");
    expect(sheetRule).toContain("box-sizing: border-box !important");
    expect(sheetGuideRule).toContain("break-after: page");
    expect(eyebrowRule).toContain("display: none !important");
    expect(cardGridRule).toContain("grid-template-rows: repeat(3, minmax(0, 1fr)) !important");
    expect(promptListRule).toContain("grid-template-rows: repeat(3, minmax(0, 1fr)) !important");
    expect(writingLinesRule).toContain("grid-template-rows: repeat(2, minmax(0, 1fr)) !important");
    expect(nameRowRule).toContain("justify-content: flex-start !important");
    expect(nameFieldRule).toContain("width: 100% !important");
    expect(nameFieldRule).toContain("max-width: none !important");
    expect(nameFieldRule).not.toContain("max-width: 190px !important");
    expect(nameWriteLineRule).toContain("flex: 1 1 auto !important");
    expect(nameWriteLineRule).toContain("min-width: 0 !important");
    expect(questionWriteLineRule).toContain("height: auto !important");
    expect(questionWriteLineRule).not.toContain("height: 24px !important");
    expect(cssSource).toContain(".question-practice-print-page .qp-sheet + .qp-sheet {");
    expect(cssSource).toContain("margin-top: 24px");
    expect(cssSource).not.toContain("max-width: 275px !important");
  });
});
