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
          selectedKeywords: ["생물", "환경"],
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
        selectedKeywords: ["생물", "환경"],
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
      selectedKeywords: ["생물", "환경"],
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

  it("생성 중 질문이 바뀌면 이전 원문과 설명을 적용하지 않는다", async () => {
    let resolveGeneration!: (value: unknown) => void;
    const generate = vi.fn(() => new Promise<unknown>((resolve) => {
      resolveGeneration = resolve;
    }));
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSourceChanged = vi.fn();
    const { result } = renderHook(() => {
      const [currentQuestions, setCurrentQuestions] = useState<InquiryQuestion[]>(questions);
      const guides = useStudentInquiryGuides({
        questions: currentQuestions,
        coreIdea: "생물은 환경과 관계를 맺는다.",
        selectedKeywords: ["생물", "환경"],
        coreSentences: ["생물은 서로 연결된다."],
        essentialQuestions: ["생태계는 어떻게 유지될까?"],
        setQuestions: setCurrentQuestions,
        generate,
        onSuccess,
        onError,
        onSourceChanged,
      });
      return { ...guides, currentQuestions, setCurrentQuestions };
    });

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleGenerateStudentGuides();
    });
    act(() => result.current.setCurrentQuestions([{
      type: "conceptual",
      content: "생산자는 생태계에서 어떤 관계를 만들까?",
    }]));
    await act(async () => {
      resolveGeneration(generatedBundle);
      await pending;
    });

    expect(result.current.currentQuestions).toEqual([{
      type: "conceptual",
      content: "생산자는 생태계에서 어떤 관계를 만들까?",
    }]);
    expect(result.current.learningGuides).toBeUndefined();
    expect(result.current.hasFreshStudentGuides).toBe(false);
    expect(onSourceChanged).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("선택한 핵심 낱말이 바뀌면 기존 설명을 오래된 상태로 둔다", async () => {
    const generate = vi.fn(async () => generatedBundle);
    const { result, rerender } = renderHook(
      ({ selectedKeywords }: { selectedKeywords: string[] }) => {
        const [currentQuestions, setCurrentQuestions] = useState<InquiryQuestion[]>(questions);
        return useStudentInquiryGuides({
          questions: currentQuestions,
          coreIdea: "생물은 환경과 관계를 맺는다.",
          selectedKeywords,
          coreSentences: ["생물은 서로 연결된다."],
          essentialQuestions: ["생태계는 어떻게 유지될까?"],
          setQuestions: setCurrentQuestions,
          generate,
          onSuccess: vi.fn(),
          onError: vi.fn(),
        });
      },
      { initialProps: { selectedKeywords: ["생물", "환경"] } },
    );

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });
    expect(result.current.hasFreshStudentGuides).toBe(true);

    rerender({ selectedKeywords: ["생물", "관계"] });

    await waitFor(() => expect(result.current.hasStaleStudentGuides).toBe(true));
    expect(result.current.hasFreshStudentGuides).toBe(false);
  });

  it("다시 만든 뒤 교사가 수정했던 직전 설명을 한 번 복원한다", async () => {
    const regeneratedBundle = {
      ...generatedBundle,
      learningGuides: {
        ...generatedBundle.learningGuides,
        coreIdea: {
          ...generatedBundle.learningGuides.coreIdea,
          explanation: "새로 만든 핵심 생각 설명",
        },
      },
      guides: [{
        ...generatedBundle.guides[0],
        meaning: "새로 만든 탐구 질문 설명",
      }],
    };
    const generate = vi.fn()
      .mockResolvedValueOnce(generatedBundle)
      .mockResolvedValueOnce(regeneratedBundle);
    const { result } = renderHook(() => {
      const [currentQuestions, setCurrentQuestions] = useState<InquiryQuestion[]>(questions);
      const guides = useStudentInquiryGuides({
        questions: currentQuestions,
        coreIdea: "생물은 환경과 관계를 맺는다.",
        selectedKeywords: ["생물", "환경"],
        coreSentences: ["생물은 서로 연결된다."],
        essentialQuestions: ["생태계는 어떻게 유지될까?"],
        setQuestions: setCurrentQuestions,
        generate,
        onSuccess: vi.fn(),
        onError: vi.fn(),
      });
      return { ...guides, currentQuestions, setCurrentQuestions };
    });

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });
    act(() => {
      result.current.setLearningGuides({
        ...generatedBundle.learningGuides,
        coreIdea: {
          ...generatedBundle.learningGuides.coreIdea,
          explanation: "교사가 다듬은 핵심 생각 설명",
        },
      });
      result.current.setCurrentQuestions((previous) => previous.map((question) => ({
        ...question,
        studentGuide: {
          ...generatedInquiryGuide,
          meaning: "교사가 다듬은 탐구 질문 설명",
        },
      })));
    });

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });

    expect(result.current.learningGuides?.coreIdea?.explanation).toBe("새로 만든 핵심 생각 설명");
    expect(result.current.currentQuestions[0].studentGuide?.meaning).toBe("새로 만든 탐구 질문 설명");
    expect(result.current.canRestoreStudentGuides).toBe(true);

    act(() => result.current.restorePreviousStudentGuides());

    expect(result.current.learningGuides?.coreIdea?.explanation).toBe("교사가 다듬은 핵심 생각 설명");
    expect(result.current.currentQuestions[0].studentGuide?.meaning).toBe("교사가 다듬은 탐구 질문 설명");
    expect(result.current.canRestoreStudentGuides).toBe(false);
  });

  it("직전 설명의 원문이 바뀌면 복원할 수 없게 한다", async () => {
    const generate = vi.fn(async () => generatedBundle);
    const { result, rerender } = renderHook(
      ({ selectedKeywords }: { selectedKeywords: string[] }) => {
        const [currentQuestions, setCurrentQuestions] = useState<InquiryQuestion[]>(questions);
        const guides = useStudentInquiryGuides({
          questions: currentQuestions,
          coreIdea: "생물은 환경과 관계를 맺는다.",
          selectedKeywords,
          coreSentences: ["생물은 서로 연결된다."],
          essentialQuestions: ["생태계는 어떻게 유지될까?"],
          setQuestions: setCurrentQuestions,
          generate,
          onSuccess: vi.fn(),
          onError: vi.fn(),
        });
        return guides;
      },
      { initialProps: { selectedKeywords: ["생물", "환경"] } },
    );

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });
    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });
    expect(result.current.canRestoreStudentGuides).toBe(true);

    rerender({ selectedKeywords: ["생물", "관계"] });

    await waitFor(() => expect(result.current.canRestoreStudentGuides).toBe(false));
  });

  it("다시 만드는 동안 교사가 수정한 설명도 직전 설명으로 복원한다", async () => {
    let resolveRegeneration!: (value: unknown) => void;
    const generate = vi.fn()
      .mockResolvedValueOnce(generatedBundle)
      .mockImplementationOnce(() => new Promise<unknown>((resolve) => {
        resolveRegeneration = resolve;
      }));
    const { result } = renderHook(() => {
      const [currentQuestions, setCurrentQuestions] = useState<InquiryQuestion[]>(questions);
      const guides = useStudentInquiryGuides({
        questions: currentQuestions,
        coreIdea: "생물은 환경과 관계를 맺는다.",
        selectedKeywords: ["생물", "환경"],
        coreSentences: ["생물은 서로 연결된다."],
        essentialQuestions: ["생태계는 어떻게 유지될까?"],
        setQuestions: setCurrentQuestions,
        generate,
        onSuccess: vi.fn(),
        onError: vi.fn(),
      });
      return { ...guides, currentQuestions, setCurrentQuestions };
    });

    await act(async () => {
      await result.current.handleGenerateStudentGuides();
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleGenerateStudentGuides();
    });
    act(() => {
      result.current.setLearningGuides({
        ...generatedBundle.learningGuides,
        coreIdea: {
          ...generatedBundle.learningGuides.coreIdea,
          explanation: "생성 중 교사가 수정한 설명",
        },
      });
      result.current.setCurrentQuestions((previous) => previous.map((question) => ({
        ...question,
        studentGuide: {
          ...generatedInquiryGuide,
          meaning: "생성 중 교사가 수정한 질문 설명",
        },
      })));
    });
    await act(async () => {
      resolveRegeneration(generatedBundle);
      await pending;
    });

    act(() => result.current.restorePreviousStudentGuides());

    expect(result.current.learningGuides?.coreIdea?.explanation).toBe("생성 중 교사가 수정한 설명");
    expect(result.current.currentQuestions[0].studentGuide?.meaning).toBe("생성 중 교사가 수정한 질문 설명");
  });
});
