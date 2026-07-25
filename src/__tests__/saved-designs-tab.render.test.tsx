// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    for (const [source, sectionName] of [
      ["생물은 환경과 관계를 맺는다.", "core-idea"],
      ["생물은 서로 연결된다.", "core-sentence"],
      ["생태계는 어떻게 유지될까?", "essential-question"],
    ] as const) {
      const section = container.querySelector(`[data-student-guide-section="${sectionName}"]`);
      expect(section).toContainElement(screen.getByDisplayValue(source));
      expect(section?.querySelector("[data-student-understanding-editor]")).toBeInTheDocument();
    }

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

  it("수정된 핵심 내용을 기준으로 학생용 설명을 다시 만들고 같은 패널에서 수정한다", async () => {
    const generated = {
      learningGuides: {
        coreIdea: {
          explanation: "생물은 달라진 환경에 맞춰 살아가는 방법을 바꿔요.",
          lifeConnection: "계절에 따라 달라지는 학교 화단을 떠올려요.",
          keywords: [
            { term: "생물", meaning: "살아 있는 것" },
            { term: "환경", meaning: "생물을 둘러싼 조건" },
            { term: "적응", meaning: "환경에 맞게 살아가는 모습" },
          ],
        },
        coreSentences: [{ index: 0, explanation: "생물은 환경이 바뀌면 살아가는 모습도 달라져요." }],
        essentialQuestions: [{
          index: 0,
          thinkingFocus: "생물이 환경 변화에 어떻게 반응하는지 살펴봐요.",
          perspectives: ["생물의 변화", "환경의 변화"],
        }],
      },
      guides: [{
        index: 0,
        meaning: "생산자가 환경 변화에 어떻게 반응하는지 알아보는 질문이에요.",
        keywords: [
          { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
          { term: "반응", meaning: "변화에 따라 달라지는 행동이나 모습" },
        ],
        thinkingStart: "식물이 계절에 따라 어떻게 달라지는지 먼저 살펴봐요.",
      }],
    };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(generated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

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
    fireEvent.change(screen.getByDisplayValue("생물은 환경과 관계를 맺는다."), {
      target: { value: "생물은 변화한 환경에 적응한다." },
    });
    fireEvent.change(screen.getByDisplayValue("생물은 서로 연결된다."), {
      target: { value: "생물은 환경 변화에 맞춰 달라진다." },
    });
    fireEvent.change(screen.getByDisplayValue("생태계는 어떻게 유지될까?"), {
      target: { value: "생물은 환경 변화에 어떻게 적응할까?" },
    });

    fireEvent.click(screen.getByRole("button", { name: "학생용 설명 다시 만들기" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("생물은 달라진 환경에 맞춰 살아가는 방법을 바꿔요."))
        .toBeInTheDocument();
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      coreIdea: "생물은 변화한 환경에 적응한다.",
      coreSentences: ["생물은 환경 변화에 맞춰 달라진다."],
      essentialQuestions: ["생물은 환경 변화에 어떻게 적응할까?"],
    });
    const coreSection = container.querySelector('[data-student-guide-section="core-idea"]');
    expect(coreSection).toContainElement(
      screen.getByDisplayValue("생물은 달라진 환경에 맞춰 살아가는 방법을 바꿔요."),
    );

    fireEvent.change(screen.getByDisplayValue("생물은 달라진 환경에 맞춰 살아가는 방법을 바꿔요."), {
      target: { value: "교사가 다시 다듬은 설명" },
    });
    expect(screen.getByDisplayValue("교사가 다시 다듬은 설명")).toBeInTheDocument();
  });
});
