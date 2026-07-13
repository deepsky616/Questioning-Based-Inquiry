// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { createRef, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AskPage from "@/app/(student)/student-ask/page";
import { StudentAskInputCard } from "@/app/(student)/student-ask/StudentAskInputCard";
import { StudentAskResultCard } from "@/app/(student)/student-ask/StudentAskResultCard";
import type { ClassificationResult } from "@/app/(student)/student-ask/types";
import ko from "../../messages/ko.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: {} }),
}));

vi.mock("@/lib/auth-helpers", () => ({
  getSessionUser: () => ({ id: "student-1" }),
}));

vi.mock("@/lib/app-queries", () => ({
  useStudentSessions: () => ({
    data: [{
      id: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "날씨",
      teacher: { name: "선생님" },
      sharedQuestions: [],
      defaultQuestionPublic: false,
    }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
      {ui}
    </NextIntlClientProvider>,
  );
}

const result: ClassificationResult = {
  closure: "open",
  cognitive: "conceptual",
  closureScore: 0.9,
  cognitiveScore: 0.8,
  reasoning: "여러 원인의 관계를 생각하게 합니다.",
  feedback: "원인과 결과를 더 구체적으로 연결해 보세요.",
  improvedExample: "기온과 습도는 비가 내리는 과정에 어떤 영향을 줄까요?",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("학생 질문 분석 결과", () => {
  it("수정된 질문에는 이전 피드백을 남기고 저장을 막으며 개선 예시를 전달한다", () => {
    const onRewrite = vi.fn();
    const onUseImprovedExample = vi.fn();
    const onSave = vi.fn();

    renderWithIntl(
      <StudentAskResultCard
        result={result}
        analyzedContent="왜 비가 올까요?"
        analysisCurrent={false}
        saveComplete={false}
        isSaving={false}
        onRewrite={onRewrite}
        onUseImprovedExample={onUseImprovedExample}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(result.feedback!)).toBeInTheDocument();
    expect(screen.getByText("수정한 질문을 다시 분석해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "예시를 초안으로 사용" }));
    expect(onUseImprovedExample).toHaveBeenCalledWith(result.improvedExample);
  });

  it("이전 분석이 있으면 입력 카드의 기본 행동을 다시 분석으로 표시한다", () => {
    renderWithIntl(
      <StudentAskInputCard
        sessionSelector={<div />}
        referencePanel={<div />}
        selectedSession={null}
        flowSteps={[]}
        currentStep={3}
        existingQuestion={null}
        isCheckingExisting={false}
        content="왜 비가 올까요?"
        textareaRef={createRef<HTMLTextAreaElement>()}
        canAsk
        isLoading={false}
        hasAnalysis
        onContentChange={() => {}}
        onAnalyze={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "다시 분석" })).toBeInTheDocument();
  });

  it("분석 요청 뒤 본문을 고치면 늦게 온 결과를 요청 당시 본문과 묶는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    let resolveClassification!: (response: Response) => void;
    const delayedClassification = new Promise<Response>((resolve) => {
      resolveClassification = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/classify") return delayedClassification;
      if (url === "/api/config") {
        return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }));

    renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    fireEvent.change(input, { target: { value: "처음 분석을 요청한 질문입니다" } });
    const analyzeButton = screen.getByRole("button", { name: "질문 분석하기" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    fireEvent.click(analyzeButton);

    fireEvent.change(input, { target: { value: "요청 뒤에 고친 질문입니다" } });
    await act(async () => {
      resolveClassification({
        ok: true,
        json: async () => result,
      } as Response);
      await delayedClassification;
    });

    expect(input).toHaveValue("요청 뒤에 고친 질문입니다");
    expect(screen.getByText("분석 결과")).toBeInTheDocument();
    expect(screen.getByText("처음 분석을 요청한 질문입니다")).toBeInTheDocument();
    expect(screen.getByText("수정한 질문을 다시 분석해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();
  });

  it("저장 요청 뒤 본문을 고치면 이전 저장 완료를 현재 초안에 표시하지 않는다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    let resolveSave!: (response: Response) => void;
    const delayedSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/classify") {
        return Promise.resolve({ ok: true, json: async () => result } as Response);
      }
      if (url === "/api/questions" && init?.method === "POST") return delayedSave;
      if (url === "/api/config") {
        return Promise.resolve({ ok: true, json: async () => ({ configured: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }));

    renderWithIntl(<AskPage />);
    const input = await screen.findByLabelText("질문");
    fireEvent.change(input, { target: { value: "저장을 요청한 질문입니다" } });
    const analyzeButton = screen.getByRole("button", { name: "질문 분석하기" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    fireEvent.click(analyzeButton);
    await screen.findByText("분석 결과");
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));

    fireEvent.change(input, { target: { value: "저장 중에 고친 새 초안입니다" } });
    await act(async () => {
      resolveSave({ ok: true, json: async () => ({ id: "saved-1" }) } as Response);
      await delayedSave;
    });

    expect(input).toHaveValue("저장 중에 고친 새 초안입니다");
    expect(screen.queryByText("질문이 저장되었습니다")).not.toBeInTheDocument();
  });
});
