import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  QUESTION_TYPE_FORMULA_GUIDE,
  QUESTION_TRIO_TABLE,
  INQUIRY_STEPS,
} from "@/lib/question-detective-content";

// "질문 탐정단" 학습 콘텐츠 — 유형별 정의·만들기 공식·비교표·탐구 3단계가
// 연습 페이지의 유형 알아보기와 질문하기 도우미에 녹아 있어야 한다.

describe("질문 탐정단 학습 콘텐츠", () => {
  it("사실적→개념적→논쟁적 순서로 유형마다 정의와 공식 3개를 갖는다", () => {
    expect(QUESTION_TYPE_FORMULA_GUIDE.map((g) => g.typeKey)).toEqual([
      "factual",
      "conceptual",
      "controversial",
    ]);
    for (const guide of QUESTION_TYPE_FORMULA_GUIDE) {
      expect(guide.definition.length).toBeGreaterThan(20);
      expect(guide.formulas).toHaveLength(3);
      for (const formula of guide.formulas) {
        expect(formula.words.length).toBeGreaterThan(0);
        expect(formula.pattern.length).toBeGreaterThan(0);
        expect(formula.examples.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("비교표는 세 유형, 탐구 단계는 3단계다", () => {
    expect(QUESTION_TRIO_TABLE).toHaveLength(3);
    expect(INQUIRY_STEPS.map((s) => s.step)).toEqual([1, 2, 3]);
  });

  it("연습 페이지의 유형 알아보기가 탐정단 가이드를 사용한다", () => {
    const practiceView = readFileSync("src/components/shared/QuestionPracticeView.tsx", "utf8");
    expect(practiceView).toContain("QuestionTypeGuide");

    const guide = readFileSync("src/components/shared/QuestionTypeGuide.tsx", "utf8");
    expect(guide).toContain("QUESTION_TYPE_FORMULA_GUIDE");
    expect(guide).toContain("QUESTION_TRIO_TABLE");
    expect(guide).toContain("INQUIRY_STEPS");
  });

  it("질문하기 도우미에 논쟁적 질문 공식 힌트가 있다", () => {
    const helper = readFileSync("src/app/(student)/student-ask/StudentAskReferencePanel.tsx", "utf8");
    expect(helper).toContain('t("helperTipFormula")');
  });
});
