// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import * as QuestionLearning from "@/components/shared/QuestionDetectiveSlides";
import { QuestionLearningExperience } from "@/components/shared/QuestionLearningExperience";
import en from "../../messages/en.json";

const messages = {
  questionLearning: {
    title: "질문학습",
    subtitle: "질문을 살펴보고 탐구의 힘을 길러요.",
    previous: "이전",
    next: "다음",
    slideNavigation: "질문학습 장 이동",
    slideProgress: "{current} / {total}",
    checkNext: "다음 문제",
    checkRestart: "다시 시작",
    startPractice: "질문연습 시작",
    tryPractice: "직접 연습하기",
    viewTeachingGuide: "수업 활용 보기",
    teacherViewsLabel: "교사용 질문학습 보기",
    learningView: "학습 내용",
    teachingView: "수업 활용",
    teachingGuideDescription: "핵심 학습 내용을 수업에 적용할 때 참고하세요.",
    backToLearning: "학습 내용으로 돌아가기",
    objective: "학습 목표",
    misconception: "자주 생기는 혼동",
    prompt: "수업에서 먼저 물을 질문",
    followUp: "학생 답변 뒤 이어서 물을 질문",
  },
  classification: {
    closed: { label: "닫힌 질문" },
    open: { label: "열린 질문" },
    factual: { label: "사실적 질문" },
    conceptual: { label: "개념적 질문" },
    controversial: { label: "논쟁적 질문" },
  },
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={messages} timeZone="Asia/Seoul">
      {ui}
    </NextIntlClientProvider>,
  );
}

function renderWithEnglishIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en as never} timeZone="Asia/Seoul">
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("질문학습 슬라이드", () => {
  it("합의한 순서로 열네 장을 제공한다", () => {
    expect(QuestionLearning.QUESTION_LEARNING_SLIDES).toEqual([
      "cover",
      "whyQuestions",
      "twoAxes",
      "openClosed",
      "inquiryDepth",
      "factualDefinition",
      "factualFormulas",
      "conceptualDefinition",
      "conceptualFormulas",
      "controversialDefinition",
      "controversialFormulas",
      "comparison",
      "check",
      "synthesis",
    ]);
  });

  it("학생 완료 화면에서 학생 질문연습으로 이동한다", () => {
    renderWithIntl(<QuestionLearningExperience audience="student" />);

    fireEvent.click(screen.getByRole("tab", { name: "14 / 14" }));

    expect(screen.getByRole("link", { name: "질문연습 시작" })).toHaveAttribute(
      "href",
      "/student-practice",
    );
  });

  it("교사 완료 화면에서 연습과 수업 활용으로 이동하고 보기 탭을 키로 바꾼다", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    renderWithIntl(<QuestionLearningExperience audience="teacher" />);

    fireEvent.click(screen.getByRole("tab", { name: "14 / 14" }));
    expect(screen.getByRole("link", { name: "직접 연습하기" })).toHaveAttribute(
      "href",
      "/teacher-practice",
    );

    fireEvent.click(screen.getByRole("button", { name: "수업 활용 보기" }));
    expect(screen.getByRole("heading", { name: "수업 활용" })).toHaveFocus();
    expect(screen.getAllByText("자주 생기는 혼동")).toHaveLength(6);

    const teachingTab = screen.getByRole("tab", { name: "수업 활용" });
    const teachingPanel = screen.getByRole("tabpanel");
    expect(teachingTab).toHaveAttribute("aria-selected", "true");
    expect(teachingTab).toHaveAttribute("aria-controls", teachingPanel.id);
    expect(teachingPanel).toHaveAttribute("aria-labelledby", teachingTab.id);

    fireEvent.keyDown(teachingTab, { key: "Home" });
    const learningTab = screen.getByRole("tab", { name: "학습 내용" });
    expect(learningTab).toHaveFocus();
    expect(learningTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(learningTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "수업 활용" })).toHaveFocus();
  });

  it("수업 활용에서 돌아오면 마지막 장을 유지하고 진입 단추로 초점을 돌린다", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    renderWithIntl(<QuestionLearningExperience audience="teacher" />);

    fireEvent.click(screen.getByRole("tab", { name: "14 / 14" }));
    fireEvent.click(screen.getByRole("button", { name: "수업 활용 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "학습 내용으로 돌아가기" }));

    expect(screen.getByRole("tab", { name: "14 / 14" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "수업 활용 보기" })).toHaveFocus();
  });

  it("영어 화면에서 여섯 수업 활용 항목의 제목과 본문을 영어로 표시한다", () => {
    renderWithEnglishIntl(<QuestionLearningExperience audience="teacher" />);

    fireEvent.click(screen.getByRole("tab", { name: "Teaching guide" }));

    expect(
      screen.getByRole("heading", { name: "Two dimensions of question classification" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Classify the range of acceptable answers and the thinking required to answer as separate dimensions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open and closed questions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Factual questions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conceptual questions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Debatable questions" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Comparing the three types and checking understanding" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("질문의 두 분류 축")).not.toBeInTheDocument();
    expect(
      screen.queryByText("답의 범위와 답에 필요한 사고를 서로 다른 기준으로 분류한다."),
    ).not.toBeInTheDocument();
  });

  it("활성 패널과 진행 탭을 연결하고 단추와 키로 경계 안에서 이동한다", () => {
    renderWithIntl(<QuestionLearning.QuestionDetectiveSlides />);

    const stage = screen.getByTestId("question-learning-stage");
    const panel = screen.getByRole("tabpanel");
    expect(stage).toHaveAttribute("tabindex", "0");
    expect(panel).toHaveTextContent("질문 탐정단");

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(14);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(tabs.slice(1).every((tab) => tab.tabIndex === -1)).toBe(true);
    expect(tabs.every((tab) => tab.getAttribute("aria-controls") === panel.id)).toBe(true);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0].id);

    fireEvent.click(screen.getByRole("button", { name: messages.questionLearning.next }));
    expect(screen.getByText("2 / 14")).toBeInTheDocument();

    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(screen.getByText("3 / 14")).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: "ArrowLeft" });
    expect(screen.getByText("2 / 14")).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: "End" });
    expect(screen.getByText("14 / 14")).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(screen.getByText("14 / 14")).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: "Home" });
    expect(screen.getByText("1 / 14")).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 14")).toBeInTheDocument();
  });

  it("진행 탭 키 이동은 활성 장과 실제 초점을 함께 옮긴다", () => {
    renderWithIntl(<QuestionLearning.QuestionDetectiveSlides />);

    const thirdTab = screen.getByRole("tab", { name: "3 / 14" });
    thirdTab.focus();
    fireEvent.keyDown(thirdTab, { key: "ArrowRight" });

    const fourthTab = screen.getByRole("tab", { name: "4 / 14" });
    expect(screen.getByText("4 / 14")).toBeInTheDocument();
    expect(document.activeElement).toBe(fourthTab);

    fireEvent.keyDown(fourthTab, { key: "End" });
    const lastTab = screen.getByRole("tab", { name: "14 / 14" });
    expect(document.activeElement).toBe(lastTab);

    fireEvent.keyDown(lastTab, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "1 / 14" }));
  });

  it("하위 확인 조작의 이동 키는 현재 장을 바꾸지 않는다", () => {
    renderWithIntl(<QuestionLearning.QuestionDetectiveSlides />);

    fireEvent.click(screen.getByRole("tab", { name: "13 / 14" }));
    const factualChoice = screen.getByRole("button", { name: "사실적 질문" });
    fireEvent.keyDown(factualChoice, { key: "ArrowRight" });
    expect(screen.getByText("13 / 14")).toBeInTheDocument();

    fireEvent.click(factualChoice);
    const nextCheck = screen.getByRole("button", { name: messages.questionLearning.checkNext });
    fireEvent.keyDown(nextCheck, { key: "End" });
    expect(screen.getByText("13 / 14")).toBeInTheDocument();
  });

  it("작은 화면 비교 자료에도 세 유형의 탐구 목적을 모두 표시한다", () => {
    renderWithIntl(<QuestionLearning.QuestionDetectiveSlides />);
    fireEvent.click(screen.getByRole("tab", { name: "12 / 14" }));

    expect(screen.getAllByText("답에 필요한 사고와 근거")).toHaveLength(4);
    for (const purpose of ["지식 쌓기 (재료 준비)", "이해 넓히기 (연결하기)", "판단하기 (선택하기)"]) {
      expect(screen.getAllByText(purpose)).toHaveLength(2);
    }
  });

  it("선택 즉시 지역 상태로 채점하고 풀이를 보여 주며 통신하지 않는다", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderWithIntl(<QuestionLearning.QuestionDetectiveSlides />);

    fireEvent.click(screen.getByRole("tab", { name: "13 / 14" }));
    expect(
      screen.getByRole("group", { name: "우리 반에서 오늘 출석한 학생은 몇 명인가요?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사실적 질문" }));

    expect(
      screen.getByText("관찰하거나 세어 확인할 수 있는 정해진 정보를 묻기 때문에 사실적 질문이에요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.questionLearning.checkNext })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: messages.questionLearning.checkNext }));
    const secondPrompt = screen.getByText("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?");
    expect(secondPrompt).toBeInTheDocument();
    expect(document.activeElement).toBe(secondPrompt);
    fireEvent.click(screen.getByRole("button", { name: "개념적 질문" }));
    fireEvent.click(screen.getByRole("button", { name: messages.questionLearning.checkNext }));
    expect(screen.getByText("환경 보호를 위해 일회용품 사용을 법으로 제한해야 할까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "논쟁적 질문" }));
    fireEvent.click(screen.getByRole("button", { name: messages.questionLearning.checkRestart }));
    expect(screen.getByText("우리 반에서 오늘 출석한 학생은 몇 명인가요?")).toBeInTheDocument();
    expect(screen.queryByText("정답이에요!")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
