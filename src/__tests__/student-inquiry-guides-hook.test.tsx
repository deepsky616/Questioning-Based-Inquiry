// @vitest-environment jsdom

import { useEffect, useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudentInquiryGuides } from "@/app/(teacher)/teacher-curriculum/useStudentInquiryGuides";
import type { InquiryQuestion } from "@/app/(teacher)/teacher-curriculum/types";

const questions: InquiryQuestion[] = [
  { type: "factual", content: "생산자는 무엇일까?" },
];

const generatedInquiryGuide = {
  meaning: "생산자의 뜻을 묻는 질문이에요.",
  keywords: [
    { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
    { term: "양분", meaning: "생물이 살아가는 데 필요한 물질" },
  ],
  thinkingStart: "식물을 먼저 떠올려요.",
};

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
  guides: [{ index: 0, ...generatedInquiryGuide }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("학생용 설명 생성 훅 최신 상태", () => {
  it("생성 원문과 현재 원문이 같은 동안에만 최신으로 판별한다", async () => {
    const generate = vi.fn(async () => generatedBundle);
    const { result, rerender } = renderHook(
      ({ questions: sourceQuestions }: { questions: InquiryQuestion[] }) => {
        const [currentQuestions, setCurrentQuestions] = useState(sourceQuestions);
        useEffect(() => setCurrentQuestions(sourceQuestions), [sourceQuestions]);
        const guides = useStudentInquiryGuides({
          questions: currentQuestions,
          coreIdea: "생물은 환경과 관계를 맺는다.",
          coreSentences: ["생물은 서로 연결된다."],
          essentialQuestions: ["생태계는 어떻게 유지될까?"],
          setQuestions: setCurrentQuestions,
          generate,
          onSuccess: vi.fn(),
          onError: vi.fn(),
        });
        return { ...guides, currentQuestions };
      },
      { initialProps: { questions } },
    );

    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });

    expect(result.current.hasFreshStudentGuides).toBe(true);
    expect(result.current.hasCurrentStudentGuides).toBe(true);
    expect(result.current.hasIncompleteStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    act(() => result.current.setLearningGuides({
      ...generatedBundle.learningGuides,
      coreIdea: {
        ...generatedBundle.learningGuides.coreIdea,
        explanation: "",
      },
    }));

    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasCurrentStudentGuides).toBe(true);
    expect(result.current.hasIncompleteStudentGuides).toBe(true);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    rerender({ questions: [{ type: "factual", content: "바뀐 질문" }] });

    await waitFor(() => expect(result.current.hasStaleStudentGuides).toBe(true));
    expect(result.current.hasFreshStudentGuides).toBe(false);

    act(() => result.current.clearStudentGuides());

    expect(result.current.learningGuides).toBeUndefined();
    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(false);
    expect(result.current.currentQuestions).toEqual([{ type: "factual", content: "바뀐 질문" }]);
  });

  it("완전한 수동 설명 묶음만 현재 원문에서 최신으로 기록하고 원문 변경 뒤 오래된 상태로 둔다", async () => {
    const { result } = renderHook(() => {
      const [currentQuestions, setCurrentQuestions] = useState<InquiryQuestion[]>(questions);
      const guides = useStudentInquiryGuides({
        questions: currentQuestions,
        coreIdea: "생물은 환경과 관계를 맺는다.",
        coreSentences: ["생물은 서로 연결된다."],
        essentialQuestions: ["생태계는 어떻게 유지될까?"],
        setQuestions: setCurrentQuestions,
        generate: vi.fn(),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      });
      return { ...guides, setCurrentQuestions };
    });

    act(() => result.current.setLearningGuides(generatedBundle.learningGuides));

    expect(result.current.hasFreshStudentGuides).toBe(false);

    act(() => result.current.setCurrentQuestions((previous) => previous.map((question) => ({
      ...question,
      studentGuide: generatedInquiryGuide,
    }))));

    await waitFor(() => expect(result.current.hasFreshStudentGuides).toBe(true));
    expect(result.current.hasStaleStudentGuides).toBe(false);

    act(() => result.current.setCurrentQuestions((previous) => previous.map((question) => {
      const { studentGuide: _studentGuide, ...partialQuestion } = question;
      return partialQuestion;
    })));

    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasCurrentStudentGuides).toBe(true);
    expect(result.current.hasIncompleteStudentGuides).toBe(true);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    act(() => result.current.setCurrentQuestions((previous) => previous.map((question) => ({
      ...question,
      studentGuide: generatedInquiryGuide,
    }))));

    expect(result.current.hasFreshStudentGuides).toBe(true);
    expect(result.current.hasStaleStudentGuides).toBe(false);

    act(() => result.current.setCurrentQuestions((previous) => previous.map((question) => ({
      ...question,
      content: "바뀐 질문",
    }))));

    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(result.current.hasStaleStudentGuides).toBe(true);
  });

  it("불완전 생성 응답은 적용하거나 성공 처리하지 않는다", async () => {
    const setQuestions = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useStudentInquiryGuides({
      questions,
      coreIdea: "생물은 환경과 관계를 맺는다.",
      coreSentences: ["생물은 서로 연결된다."],
      essentialQuestions: ["생태계는 어떻게 유지될까?"],
      setQuestions,
      generate: vi.fn(async () => ({
        learningGuides: generatedBundle.learningGuides,
        guides: [],
      })),
      onSuccess,
      onError,
    }));

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });

    expect(result.current.learningGuides).toBeUndefined();
    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(setQuestions).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
