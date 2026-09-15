// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { QuestionLearningExperience } from "@/components/shared/QuestionLearningExperience";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

function mount(audience: "student" | "teacher" = "student", locale = "ko") {
  return render(<NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en} timeZone="Asia/Seoul"><QuestionLearningExperience audience={audience} /></NextIntlClientProvider>);
}
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); });

describe("질문 연구소 사용 약속", () => {
  it("사용 약속을 보고 돌아와도 원래 질문학습 장을 유지한다", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "7 / 14" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI 사용 약속" }));
    expect(screen.getByRole("heading", { name: "질문 연구소에서 함께 지킬 약속" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "질문 배우기" }));
    expect(screen.getByRole("tab", { name: "7 / 14" })).toHaveAttribute("aria-selected", "true");
  });

  it("바로가기 주소로 약속을 열고 상황의 판단 이유를 확인한 뒤 실천을 고른다", async () => {
    window.history.replaceState(null, "", "/student-question-learning#ai-ethics");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    mount();
    expect(await screen.findByRole("heading", { name: "질문 연구소에서 함께 지킬 약속" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "상황 판단 연습" }));
    expect(screen.getByRole("button", { name: "다음 상황" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "친구의 정보를 자세히 입력한다." }));
    expect(screen.getByRole("status")).toHaveTextContent("친구를 알아볼 수 있는 정보");
    fireEvent.click(screen.getByRole("radio", { name: "개인정보를 빼고 일반적인 질문으로 바꾼다." }));
    fireEvent.click(screen.getByRole("button", { name: "다음 상황" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "내 질문의 뜻과 비교하고 도움이 되는 부분을 고른다." }));
    fireEvent.click(screen.getByRole("button", { name: "다음 상황" }));
    fireEvent.click(screen.getByRole("radio", { name: "친구의 질문에 내 생각과 이유를 덧붙인다." }));
    fireEvent.click(screen.getByRole("button", { name: "실천 약속 고르기" }));
    expect(screen.getByRole("button", { name: "내 약속 확인" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "도움받은 부분을 솔직히 밝혀요." }));
    fireEvent.click(screen.getByRole("button", { name: "내 약속 확인" }));
    expect(screen.getByRole("heading", { name: "오늘 실천할 나의 약속" })).toBeVisible();
    expect(screen.getByRole("link", { name: "질문하러 가기" })).toHaveAttribute("href", "/student-ask");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("교사는 윤리교육을 큰 화면으로 보여 주고 닫으면 원래 학습으로 돌아온다", async () => {
    mount("teacher");
    fireEvent.click(screen.getByRole("tab", { name: "AI 사용 약속" }));
    fireEvent.click(screen.getByRole("button", { name: "약속 수업 화면으로 보기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "내 질문은 내가 먼저 만들어요." })).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 약속" }));
    expect(within(dialog).getByRole("heading", { name: "인공지능의 말은 이유를 살펴봐요." })).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "약속 수업 화면으로 보기" })).toBeVisible();
  });

  it("영어 화면에서도 같은 사용 약속 활동을 제공한다", () => {
    mount("student", "en");
    fireEvent.click(screen.getByRole("tab", { name: "AI use promises" }));
    expect(screen.getByRole("heading", { name: "Our promises for Question Lab" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try the situations" }));
    expect(screen.getByRole("radio", { name: "Remove personal details and ask a general question." })).toBeVisible();
  });
});
