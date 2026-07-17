// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudentInquiryGuides } from "@/app/(teacher)/teacher-curriculum/useStudentInquiryGuides";
import type { InquiryQuestion } from "@/app/(teacher)/teacher-curriculum/types";

const questions: InquiryQuestion[] = [
  { type: "factual", content: "생산자는 무엇일까?" },
];

const generatedBundle = {
  learningGuides: {
    coreIdea: {
      explanation: "핵심 생각을 쉽게 풀어요.",
      lifeConnection: "학교 화단을 떠올려요.",
      keywords: [
        { term: "생태계", meaning: "생물과 환경이 관계를 맺는 체계" },
        { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
        { term: "환경", meaning: "생물을 둘러싼 조건" },
      ],
    },
    coreSentences: [{ index: 0, explanation: "문장의 뜻을 쉽게 풀어요." }],
    essentialQuestions: [{
      index: 0,
      thinkingFocus: "관계와 변화를 살펴봐요.",
      perspectives: ["관계", "변화"],
    }],
  },
  guides: [{
    index: 0,
    meaning: "생산자의 뜻을 묻는 질문이에요.",
    keywords: [
      { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
      { term: "양분", meaning: "생물이 살아가는 데 필요한 물질" },
    ],
    thinkingStart: "식물을 먼저 떠올려요.",
  }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("학생용 설명 생성 훅 최신 상태", () => {
  it("생성 원문과 현재 원문이 같은 동안에만 최신으로 판별한다", async () => {
    const setQuestions = vi.fn();
    const generate = vi.fn(async () => generatedBundle);
    const { result, rerender } = renderHook(
      ({ questions: currentQuestions }: { questions: InquiryQuestion[] }) => useStudentInquiryGuides({
        questions: currentQuestions,
        coreIdea: "생물은 환경과 관계를 맺는다.",
        coreSentences: ["생물은 서로 연결된다."],
        essentialQuestions: ["생태계는 어떻게 유지될까?"],
        setQuestions,
        generate,
        onSuccess: vi.fn(),
        onError: vi.fn(),
      }),
      { initialProps: { questions } },
    );

    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });

    expect(result.current.hasFreshStudentGuides).toBe(true);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    rerender({ questions: [{ type: "factual", content: "바뀐 질문" }] });

    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(true);

    act(() => result.current.clearStudentGuides());

    expect(result.current.learningGuides).toBeUndefined();
    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    const clearQuestions = setQuestions.mock.calls.at(-1)?.[0];
    expect(clearQuestions).toBeTypeOf("function");
    expect(clearQuestions([{ ...questions[0], studentGuide: generatedBundle.guides[0] }]))
      .toEqual(questions);
  });
});
