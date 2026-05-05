import { describe, it, expect } from "vitest";
import { buildAnswerPrompt, buildSessionAnalysisPrompt } from "@/lib/ai-prompts";

describe("buildAnswerPrompt", () => {
  it("질문 내용이 프롬프트에 포함된다", () => {
    const prompt = buildAnswerPrompt("광합성이란 무엇인가요?");
    expect(prompt).toContain("광합성이란 무엇인가요?");
  });

  it("맥락이 있으면 프롬프트에 포함된다", () => {
    const prompt = buildAnswerPrompt("왜 하늘은 파란가요?", undefined, undefined, "과학 수업 중");
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
    {
      content: "광합성이란?",
      closure: "closed",
      cognitive: "factual",
      comments: [
        { content: "엽록체에서 일어나는 것 같아요.", authorRole: "STUDENT", authorName: "학생1" },
      ],
    },
    {
      content: "왜 식물은 녹색인가요?",
      closure: "open",
      cognitive: "conceptual",
      comments: [
        { content: "빛의 색과 관련이 있나요?", authorRole: "STUDENT", authorName: "학생2" },
        { content: "엽록소와 연결해서 생각해 보세요.", authorRole: "TEACHER", authorName: "교사" },
      ],
    },
    { content: "환경 문제를 해결하려면 어떻게 해야 할까요?", closure: "open", cognitive: "controversial", comments: [] },
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

  it("댓글 내용과 댓글 수가 프롬프트에 포함된다", () => {
    const prompt = buildSessionAnalysisPrompt(sampleQuestions, "과학", "광합성");
    expect(prompt).toContain("총 댓글 수: 3개");
    expect(prompt).toContain("[댓글 1 · 학생 · 학생1] 엽록체에서 일어나는 것 같아요.");
    expect(prompt).toContain("[댓글 2 · 교사/AI · 교사] 엽록소와 연결해서 생각해 보세요.");
  });

  it("댓글 분석 결과 필드를 JSON 형식에 요구한다", () => {
    const prompt = buildSessionAnalysisPrompt(sampleQuestions, "과학", "광합성");
    expect(prompt).toContain('"commentInsights"');
    expect(prompt).toContain("학생 댓글에서 드러난 이해");
  });

  it("질문이 없어도 프롬프트가 생성된다", () => {
    const prompt = buildSessionAnalysisPrompt([], "수학", "도형");
    expect(prompt.length).toBeGreaterThan(10);
  });
});
