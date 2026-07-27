// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { CurriculumInquiryStep } from "@/app/(teacher)/teacher-curriculum/CurriculumInquiryStep";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";

const baseProps: ComponentProps<typeof CurriculumInquiryStep> = {
  visible: true,
  inquiryQuestions: [
    { type: "factual", content: "생산자는 무엇일까?" },
    { type: "conceptual", content: "먹이 관계는 어떻게 이어질까?" },
    { type: "controversial", content: "개발을 제한해야 할까?" },
  ],
  coreIdea: "생물은 환경과 관계를 맺는다.",
  achievements: [{
    code: "[6과05-01]",
    content: "생태계 구성 요소를 조사하고 생물 요소와 비생물 요소를 구분할 수 있다.",
  }],
  coreSentences: ["생물은 서로 연결된다."],
  essentialQuestions: ["생태계는 어떻게 유지될까?"],
  learningGuides: undefined,
  hasCurrentStudentGuides: false,
  hasFreshStudentGuides: false,
  hasIncompleteStudentGuides: false,
  hasStaleStudentGuides: false,
  selectedInquiryCount: 3,
  dragInquiryIndex: null,
  inquiryAddType: "factual",
  saveDate: "2026-07-18",
  saveGrade: "5",
  saveTitle: "",
  curriculumData: {
    id: "area-1",
    subject: "과학",
    gradeRange: "5-6",
    area: "생물과 환경",
    coreIdea: "생물은 환경과 관계를 맺는다.",
    knowledgeItems: [],
    processItems: [],
    valueItems: [],
    middleKnowledgeItems: [],
    middleProcessItems: [],
    middleValueItems: [],
    achievements: [],
    units: [],
  },
  students: [],
  targetClasses: [],
  targetClassValue: "all",
  selectedStudentIds: [],
  sessionIsActive: true,
  defaultQuestionPublic: true,
  sessionLikesVisible: true,
  sessionCommentsVisible: true,
  isSaving: false,
  isGeneratingInquiryQuestions: false,
  isGeneratingGuides: false,
  canRestoreStudentGuides: false,
  canSaveDesign: false,
  lastDesignAction: null,
  onSetDragInquiryIndex: vi.fn(),
  onDropInquiry: vi.fn(),
  onMoveInquiry: vi.fn(),
  onUpdateInquiry: vi.fn(),
  onRemoveInquiry: vi.fn(),
  onInquiryAddTypeChange: vi.fn(),
  onAddInquiry: vi.fn(),
  onSaveDateChange: vi.fn(),
  onSaveGradeChange: vi.fn(),
  onSaveTitleChange: vi.fn(),
  onTargetClassChange: vi.fn(),
  onSelectedStudentIdsChange: vi.fn(),
  onVisibilitySettingsChange: vi.fn(),
  onSaveAndCreateSession: vi.fn(),
  onSaveOnly: vi.fn(),
  onGenerateGuides: vi.fn(),
  onRestoreGuides: vi.fn(),
  onLearningGuidesChange: vi.fn(),
};

function InquiryStepHarness({
  initialTitle = "",
  isGeneratingInquiryQuestions = false,
}: {
  initialTitle?: string;
  isGeneratingInquiryQuestions?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  return (
    <ConfirmProvider>
      <CurriculumInquiryStep
        {...baseProps}
        saveTitle={title}
        isGeneratingInquiryQuestions={isGeneratingInquiryQuestions}
        onSaveTitleChange={setTitle}
      />
    </ConfirmProvider>
  );
}

describe("다섯째 단계 질문 편집과 배포 자료 확인", () => {
  it("처음에는 질문 편집만 보이고 완료 뒤 배포 자료를 보여준다", async () => {
    render(<InquiryStepHarness />);

    expect(screen.getAllByText("사실적 질문", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "학생용 설명 만들기" })).not.toBeInTheDocument();
    expect(screen.queryByText("저장 정보")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));

    expect(screen.getByRole("heading", { name: "학생 배포 자료 확인" })).toBeInTheDocument();
    expect(screen.getByText("생물은 환경과 관계를 맺는다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학생용 설명 만들기" })).toBeInTheDocument();
    expect(screen.getByText("저장 정보")).toBeInTheDocument();
  });

  it("확인 화면의 원문은 읽기 전용이고 단원명 입력은 위쪽 표시와 동기화된다", async () => {
    render(<InquiryStepHarness />);
    fireEvent.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));

    expect(screen.queryByDisplayValue("생물은 환경과 관계를 맺는다.")).not.toBeInTheDocument();
    expect(screen.getByText("질문 수업을 만들 때 단원명을 입력해 주세요")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("예: 식물의 한살이"), {
      target: { value: "생태계와 환경" },
    });
    expect(screen.getByText("생태계와 환경")).toBeInTheDocument();
  });

  it("확인 화면의 단원 자료를 구분하고 성취기준을 핵심 아이디어 다음에 둔다", async () => {
    const { container } = render(<InquiryStepHarness />);
    fireEvent.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));

    expect(container.querySelector('[data-student-guide-section="unit-title"]'))
      .toHaveClass("border-slate-200", "bg-slate-50/80", "dark:border-slate-700", "dark:bg-slate-900/50");
    expect(container.querySelector('[data-student-guide-section="core-idea"]'))
      .toHaveClass("border-amber-200/80", "bg-amber-50/70", "dark:border-amber-800/60", "dark:bg-amber-950/20");
    expect(container.querySelector('[data-student-guide-section="achievement"]'))
      .toHaveTextContent("[6과05-01]");
    expect(container.querySelector('[data-student-guide-section="core-sentence"]'))
      .toHaveClass("border-sky-200/80", "bg-sky-50/70", "dark:border-sky-800/60", "dark:bg-sky-950/20");
    expect(container.querySelector('[data-student-guide-section="essential-question"]'))
      .toHaveClass("border-violet-200/80", "bg-violet-50/70", "dark:border-violet-800/60", "dark:bg-violet-950/20");
    expect(container.querySelector('[data-student-guide-section="inquiry-question"]'))
      .toHaveClass("border-emerald-200/80", "bg-emerald-50/70", "dark:border-emerald-800/60", "dark:bg-emerald-950/20");

    for (const [name, number] of [
      ["core-idea", "1"],
      ["achievement", "2"],
      ["core-sentence", "3"],
      ["essential-question", "4"],
      ["inquiry-question", "5"],
    ] as const) {
      const section = container.querySelector(`[data-student-guide-section="${name}"]`);
      expect(section?.querySelector("[data-student-guide-number]")).toHaveTextContent(number);
    }
  });

  it("탐구 질문을 다시 생성하기 시작하면 질문 편집 화면으로 돌아간다", () => {
    const { rerender } = render(<InquiryStepHarness />);
    fireEvent.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));
    expect(screen.getByRole("heading", { name: "학생 배포 자료 확인" })).toBeInTheDocument();

    rerender(<InquiryStepHarness isGeneratingInquiryQuestions />);

    expect(screen.getByRole("heading", { name: "5단계 · 탐구 질문" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "학생용 설명 만들기" })).not.toBeInTheDocument();
  });
});
