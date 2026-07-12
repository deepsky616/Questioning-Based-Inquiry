import { describe, expect, it } from "vitest";
import {
  QUESTION_ANSWER_RANGE_GUIDE,
  QUESTION_CLASSIFICATION_AXES,
  QUESTION_LEARNING_CHECKS,
  QUESTION_TYPE_FORMULA_GUIDE,
  QUESTION_TRIO_TABLE,
  QUESTION_WORD_HINT,
  INQUIRY_STEPS,
} from "@/lib/question-detective-content";

// "질문 탐정단" 학습 콘텐츠의 유형별 정의·만들기 공식·비교표·탐구 3단계 계약.

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

  it("사실적 질문은 답을 확인하는 방법을, 논쟁적 질문은 근거 토론을 안내한다", () => {
    const factualGuide = QUESTION_TYPE_FORMULA_GUIDE[0];
    const factualIntroduction = `${factualGuide.tagline} ${factualGuide.definition}`;
    expect(factualIntroduction).toMatch(/기억|관찰/);
    expect(factualIntroduction).toMatch(/조사|계산|절차/);
    expect(factualIntroduction).not.toMatch(/정답이.*정해|답이 한 가지/);
    expect(factualGuide.definition).toMatch(/답의 범위/);
    expect(factualGuide.definition).toMatch(/별도|별개의/);

    const controversialDefinition = QUESTION_TYPE_FORMULA_GUIDE[2].definition;
    expect(controversialDefinition).not.toContain("생각의 전쟁터");
    expect(controversialDefinition).toMatch(/가치/);
    expect(controversialDefinition).toMatch(/선택/);
    expect(controversialDefinition).toMatch(/책임/);
    expect(controversialDefinition).toMatch(/근거/);
    expect(controversialDefinition).toMatch(/판단/);

    const factualMethodFormula = QUESTION_TYPE_FORMULA_GUIDE[0].formulas[2];
    expect(`${factualMethodFormula.words} ${factualMethodFormula.pattern}`).toMatch(
      /자료|관찰|조사|정해진 절차/,
    );
    expect(QUESTION_TYPE_FORMULA_GUIDE[0].formulas[1].examples).toContain(
      "경주에서 석굴암이 있는 산의 이름은 무엇인가요?",
    );
  });

  it("같은 주제의 닫힌 질문과 열린 질문을 서로 다른 예시로 구분한다", () => {
    expect(QUESTION_ANSWER_RANGE_GUIDE.closed.definition.length).toBeGreaterThan(10);
    expect(QUESTION_ANSWER_RANGE_GUIDE.open.definition.length).toBeGreaterThan(10);
    expect(QUESTION_ANSWER_RANGE_GUIDE.closed.example).toContain("광합성");
    expect(QUESTION_ANSWER_RANGE_GUIDE.open.example).toContain("광합성");
    expect(QUESTION_ANSWER_RANGE_GUIDE.closed.example).not.toEqual(
      QUESTION_ANSWER_RANGE_GUIDE.open.example,
    );
  });

  it("답의 범위와 생각의 깊이라는 두 기준으로 질문을 분류한다", () => {
    expect(QUESTION_CLASSIFICATION_AXES).toHaveLength(2);
    expect(QUESTION_CLASSIFICATION_AXES.map((axis) => axis.key)).toEqual([
      "answerRange",
      "thinkingPurpose",
    ]);
    expect(QUESTION_WORD_HINT).toContain("단서");
    expect(QUESTION_WORD_HINT).toContain("사고");
  });

  it("세 질문 유형을 스스로 확인할 즉석 문항과 풀이를 제공한다", () => {
    expect(QUESTION_LEARNING_CHECKS).toHaveLength(3);
    expect(QUESTION_LEARNING_CHECKS.map((item) => item.answer)).toEqual([
      "factual",
      "conceptual",
      "controversial",
    ]);
    for (const item of QUESTION_LEARNING_CHECKS) {
      expect(item.prompt.length).toBeGreaterThan(10);
      expect(item.explanation.length).toBeGreaterThan(10);
    }
  });

  it("비교표는 세 유형, 탐구 단계는 3단계다", () => {
    expect(QUESTION_TRIO_TABLE).toHaveLength(3);
    expect(QUESTION_TRIO_TABLE.every((row) => "thinkingGuide" in row)).toBe(true);
    expect(QUESTION_TRIO_TABLE.every((row) => !("tools" in row))).toBe(true);
    expect(QUESTION_TRIO_TABLE.map((row) => row.example)).toEqual([
      expect.stringContaining("어떻게"),
      expect.stringContaining("어떻게"),
      expect.stringContaining("어떻게"),
    ]);
    expect(QUESTION_TRIO_TABLE[0].thinkingGuide).toMatch(/자료|절차|확인/);
    expect(QUESTION_TRIO_TABLE[1].thinkingGuide).toMatch(/관계|영향|연결|설명/);
    expect(QUESTION_TRIO_TABLE[2].thinkingGuide).toMatch(/가치|책임|판단/);
    expect(INQUIRY_STEPS.map((s) => s.step)).toEqual([1, 2, 3]);
  });
});
