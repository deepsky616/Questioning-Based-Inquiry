import { describe, it, expect } from "vitest";
import { buildAnswerPrompt, buildSessionAnalysisPrompt } from "@/lib/ai-prompts";

describe("buildAnswerPrompt", () => {
  it("질문 내용이 프롬프트에 포함된다", () => {
    const prompt = buildAnswerPrompt("광합성이란 무엇인가요?");
    expect(prompt).toContain("광합성이란 무엇인가요?");
  });

  it("맥락이 있으면 프롬프트에 포함된다", () => {
    const prompt = buildAnswerPrompt("왜 하늘은 파란가요?", "과학 수업 중");
    expect(prompt).toContain("왜 하늘은 파란가요?");
    expect(prompt).toContain("과학 수업 중");
  });

  it("맥락이 없어도 프롬프트가 생성된다", () => {
    const prompt = buildAnswerPrompt("지구는 왜 자전하나요?");
    expect(prompt.length).toBeGreaterThan(10);
  });
});

describe("buildSessionAnalysisPrompt", () => {
  const sampleQuestions = [
    { content: "광합성이란?", closure: "closed", cognitive: "factual" },
    { content: "왜 식물은 녹색인가요?", closure: "open", cognitive: "interpretive" },
    { content: "환경 문제를 해결하려면 어떻게 해야 할까요?", closure: "open", cognitive: "evaluative" },
  ];

  it("세션 교과와 주제가 프롬프트에 포함된다", () => {
    const prompt = buildSessionAnalysisPrompt(sampleQuestions, "과학", "광합성");
    expect(prompt).toContain("과학");
    expect(prompt).toContain("광합성");
  });

  it("질문 내용이 모두 프롬프트에 포함된다", () => {
    const prompt = buildSessionAnalysisPrompt(sampleQuestions, "과학", "광합성");
    expect(prompt).toContain("광합성이란?");
    expect(prompt).toContain("왜 식물은 녹색인가요?");
  });

  it("총 질문 수가 프롬프트에 포함된다", () => {
    const prompt = buildSessionAnalysisPrompt(sampleQuestions, "과학", "광합성");
    expect(prompt).toContain("3");
  });

  it("질문이 없어도 프롬프트가 생성된다", () => {
    const prompt = buildSessionAnalysisPrompt([], "수학", "도형");
    expect(prompt.length).toBeGreaterThan(10);
  });
});
