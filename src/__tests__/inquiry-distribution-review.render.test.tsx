// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { InquiryDistributionReview } from "@/app/(teacher)/teacher-curriculum/InquiryDistributionReview";

const learningGuides = {
  coreIdea: {
    explanation: "생물은 주변 환경과 서로 영향을 주고받아요.",
    lifeConnection: "화분의 식물이 빛을 향해 자라는 모습을 떠올려 보세요.",
    keywords: [
      { term: "생물", meaning: "살아 있는 것" },
      { term: "환경", meaning: "생물을 둘러싼 모든 것" },
      { term: "관계", meaning: "서로 영향을 주고받는 연결" },
    ],
  },
  achievements: [{
    index: 0,
    explanation: "생태계를 이루는 생물과 환경을 찾아 알맞게 나누어 보는 기준이에요.",
  }],
  coreSentences: [{ index: 0, explanation: "생물은 혼자 살지 않고 서로 이어져 있어요." }],
  essentialQuestions: [{
    index: 0,
    thinkingFocus: "생물이 서로 돕거나 영향을 주는 모습을 살펴봐요.",
    perspectives: ["먹이 관계", "사는 곳"],
  }],
};

const inquiryQuestions = [{
  type: "factual" as const,
  content: "생산자는 무엇일까?",
  studentGuide: {
    meaning: "스스로 양분을 만드는 생물을 찾는 질문이에요.",
    keywords: [
      { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
      { term: "양분", meaning: "생물이 살아가는 데 필요한 물질" },
    ],
    thinkingStart: "식물이 양분을 얻는 방법부터 살펴보세요.",
  },
}];

const baseProps = {
  unitTitle: "생물과 환경",
  coreIdea: "생물은 환경과 관계를 맺는다.",
  achievements: [{
    code: "[6과05-01]",
    content: "생태계 구성 요소를 조사하고 생물 요소와 비생물 요소를 구분할 수 있다.",
  }],
  coreSentences: ["생물은 서로 연결된다."],
  essentialQuestions: ["생태계는 어떻게 유지될까?"],
  inquiryQuestions,
  learningGuides,
  hasCurrentStudentGuides: true,
  hasFreshStudentGuides: true,
  hasIncompleteStudentGuides: false,
  hasStaleStudentGuides: false,
  isGeneratingGuides: false,
  canRestoreStudentGuides: false,
  onGenerateGuides: vi.fn(),
  onRestoreGuides: vi.fn(),
  onLearningGuidesChange: vi.fn(),
  onInquiryGuideChange: vi.fn(),
  onBackToEdit: vi.fn(),
};

describe("학생 배포 자료 확인", () => {
  it("핵심 아이디어 다음에 선택한 성취기준을 읽기 전용으로 보여준다", () => {
    const { container } = render(<InquiryDistributionReview {...baseProps} />);

    const coreIdea = container.querySelector('[data-student-guide-section="core-idea"]');
    const achievement = container.querySelector('[data-student-guide-section="achievement"]');
    const coreSentence = container.querySelector('[data-student-guide-section="core-sentence"]');

    expect(achievement).toHaveTextContent("[6과05-01]");
    expect(achievement).toHaveTextContent("생태계 구성 요소를 조사하고");
    expect(achievement).toHaveTextContent("생태계를 이루는 생물과 환경을 찾아");
    expect(coreIdea?.compareDocumentPosition(achievement as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(achievement?.compareDocumentPosition(coreSentence as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(achievement?.querySelector("[data-student-guide-number]")).toHaveTextContent("2");
    expect(coreSentence?.querySelector("[data-student-guide-number]")).toHaveTextContent("3");
    expect(
      container.querySelector('[data-student-guide-section="inquiry-question"] [data-student-guide-number]'),
    ).toHaveTextContent("5");
    expect(screen.queryByDisplayValue("[6과05-01]")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(
      "생태계를 이루는 생물과 환경을 찾아 알맞게 나누어 보는 기준이에요.",
    )).toBeInTheDocument();
  });

  it("읽기 전용 원문 바로 아래의 학생용 설명만 수정한다", () => {
    const onLearningGuidesChange = vi.fn();
    const onInquiryGuideChange = vi.fn();
    const { container } = render(
      <InquiryDistributionReview
        {...baseProps}
        onLearningGuidesChange={onLearningGuidesChange}
        onInquiryGuideChange={onInquiryGuideChange}
      />,
    );

    expect(container.querySelector('[data-student-guide-source="core-idea"]'))
      .toHaveTextContent("생물은 환경과 관계를 맺는다.");
    expect(container.querySelector('[data-student-guide-source="core-sentence"]'))
      .toHaveTextContent("생물은 서로 연결된다.");
    expect(container.querySelector('[data-student-guide-source="essential-question"]'))
      .toHaveTextContent("생태계는 어떻게 유지될까?");
    expect(container.querySelector('[data-student-guide-source="inquiry-question"]'))
      .toHaveTextContent("생산자는 무엇일까?");
    expect(screen.queryByDisplayValue("생물은 환경과 관계를 맺는다.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("핵심 아이디어 쉽게 풀어보기"), {
      target: { value: "생물과 환경은 서로 이어져 있어요." },
    });
    expect(onLearningGuidesChange).toHaveBeenCalledWith(expect.objectContaining({
      coreIdea: expect.objectContaining({ explanation: "생물과 환경은 서로 이어져 있어요." }),
    }));

    fireEvent.change(screen.getByLabelText("질문이 묻는 것"), {
      target: { value: "생산자의 뜻을 알아보는 질문이에요." },
    });
    expect(onInquiryGuideChange).toHaveBeenCalledWith(0, expect.objectContaining({
      meaning: "생산자의 뜻을 알아보는 질문이에요.",
    }));
  });

  it("원문이 바뀐 설명은 숨기고 다시 만들도록 안내한다", () => {
    render(
      <InquiryDistributionReview
        {...baseProps}
        hasCurrentStudentGuides={false}
        hasFreshStudentGuides={false}
        hasIncompleteStudentGuides={false}
        hasStaleStudentGuides
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("원본 내용이 바뀌어");
    expect(screen.getByRole("button", { name: "학생용 설명 다시 만들기" })).toBeInTheDocument();
    expect(screen.queryByLabelText("핵심 아이디어 쉽게 풀어보기")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("질문이 묻는 것")).not.toBeInTheDocument();
  });

  it("설명을 잠깐 비워도 편집기를 유지하고 불완전 상태를 안내한다", () => {
    render(
      <InquiryDistributionReview
        {...baseProps}
        hasFreshStudentGuides={false}
        hasIncompleteStudentGuides
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("비어 있거나 핵심 낱말 수가 부족");
    expect(screen.getByLabelText("핵심 아이디어 쉽게 풀어보기")).toBeInTheDocument();
    expect(screen.getByLabelText("질문이 묻는 것")).toBeInTheDocument();
  });

  it("다시 만든 직전 설명을 한 번 되돌릴 수 있다", () => {
    const onRestoreGuides = vi.fn();
    render(
      <InquiryDistributionReview
        {...baseProps}
        canRestoreStudentGuides
        onRestoreGuides={onRestoreGuides}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이전 설명 되돌리기" }));

    expect(onRestoreGuides).toHaveBeenCalledTimes(1);
  });
});
