// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SavedDesignsTab } from "@/app/(teacher)/teacher-curriculum/SavedDesignsTab";
import type { SavedInquiryDesign } from "@/app/(teacher)/teacher-curriculum/types";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const design: SavedInquiryDesign = {
  id: "design-1",
  title: "생물과 환경",
  subject: "과학",
  gradeRange: "5-6",
  grade: "5",
  sessionDate: "2026-07-18",
  area: "생물과 환경",
  coreIdea: "생물은 환경과 관계를 맺는다.",
  selectedKeywords: ["생물", "환경"],
  coreSentences: ["생물은 서로 연결된다."],
  essentialQuestions: ["생태계는 어떻게 유지될까?"],
  learningGuides: {
    coreIdea: {
      explanation: "생물과 환경은 서로 영향을 주고받아요.",
      lifeConnection: "학교 화단을 떠올려요.",
      keywords: [
        { term: "생물", meaning: "살아 있는 것" },
        { term: "환경", meaning: "생물을 둘러싼 조건" },
        { term: "관계", meaning: "서로 영향을 주고받는 연결" },
      ],
    },
    coreSentences: [{ index: 0, explanation: "생물은 혼자 살지 않아요." }],
    essentialQuestions: [{ index: 0, thinkingFocus: "관계를 살펴봐요.", perspectives: ["생물", "환경"] }],
  },
  inquiryQuestions: [{
    type: "factual",
    content: "생산자는 무엇일까?",
    studentGuide: {
      meaning: "생산자의 뜻을 알아보는 질문이에요.",
      keywords: [
        { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
        { term: "양분", meaning: "생물이 살아가는 데 필요한 물질" },
      ],
      thinkingStart: "식물을 먼저 떠올려요.",
    },
  }],
};

describe("저장된 설계 학생용 설명 편집", () => {
  it("원문을 수정하면 기존 설명을 숨기고 다시 만들도록 안내한다", () => {
    const { container } = render(
      <ConfirmProvider>
        <SavedDesignsTab
          savedList={[design]}
          onChanged={vi.fn()}
          students={[]}
          targetClasses={[]}
        />
      </ConfirmProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    expect(screen.getByLabelText("핵심 아이디어 쉽게 풀어보기")).toBeInTheDocument();

    const inquirySection = container.querySelector('[data-student-guide-section="inquiry-question"]');
    expect(inquirySection).toHaveClass("border-emerald-200/80", "bg-emerald-50/70");
    expect(inquirySection?.querySelector("[data-student-guide-number]")).toHaveTextContent("4");
    const inquiryItem = screen.getByDisplayValue("생산자는 무엇일까?")
      .closest("[data-saved-inquiry-question]");
    expect(inquiryItem).toBeInTheDocument();
    expect(inquiryItem?.querySelector("[data-student-inquiry-guide-editor]")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("생물은 환경과 관계를 맺는다."), {
      target: { value: "생물은 변화한 환경에 적응한다." },
    });

    expect(screen.getByRole("status")).toHaveTextContent("원본 내용이 바뀌어");
    expect(screen.queryByLabelText("핵심 아이디어 쉽게 풀어보기")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학생용 설명 다시 만들기" })).toBeInTheDocument();
  });
});
