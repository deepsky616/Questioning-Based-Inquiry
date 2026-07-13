// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { QuestionPracticeView } from "@/components/shared/QuestionPracticeView";
import ko from "../../messages/ko.json";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));

function renderPractice(audience: "student" | "teacher", studentId?: string) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      <QuestionPracticeView audience={audience} studentId={studentId} />
    </NextIntlClientProvider>,
  );
}

async function completeTransform() {
  fireEvent.click(screen.getByRole("tab", { name: "2. 질문 바꾸기" }));
  fireEvent.change(screen.getByPlaceholderText("바꾼 질문을 써 보세요"), {
    target: { value: "환경 보호를 위해 일회용품을 줄이면 어떤 변화가 생길까요?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "AI에게 확인받기" }));
  await screen.findByText(/목표 달성/);
}

beforeEach(() => {
  push.mockReset();
  sessionStorage.clear();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        achieved: true,
        awarded: 0,
        classification: { closure: "open", cognitive: "conceptual" },
      }),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("연습 질문 전달", () => {
  it("학생의 바꾸기 성공 결과를 현재 학생 초안으로 저장하고 질문하기로 이동한다", async () => {
    renderPractice("student", "student-1");
    expect(screen.queryByRole("button", { name: "이 질문으로 질문하기" })).not.toBeInTheDocument();

    await completeTransform();
    fireEvent.click(screen.getByRole("button", { name: "이 질문으로 질문하기" }));

    const saved = JSON.parse(sessionStorage.getItem("question-lab:practice-draft:student-1") ?? "null");
    expect(saved).toMatchObject({
      version: 1,
      studentId: "student-1",
      content: "환경 보호를 위해 일회용품을 줄이면 어떤 변화가 생길까요?",
      mode: "transform",
      target: "open",
    });
    expect(push).toHaveBeenCalledWith("/student-ask?draft=practice");
  });

  it("교사의 성공 결과와 학생의 분류 연습에는 전달 행동이 없다", async () => {
    const teacher = renderPractice("teacher");
    await completeTransform();
    expect(screen.queryByRole("button", { name: "이 질문으로 질문하기" })).not.toBeInTheDocument();

    teacher.unmount();
    renderPractice("student", "student-1");
    fireEvent.click(screen.getByRole("button", { name: "닫힌 질문" }));
    expect(screen.queryByRole("button", { name: "이 질문으로 질문하기" })).not.toBeInTheDocument();
  });

  it("초안 저장이 실패하면 입력을 유지하고 같은 화면에 오류를 표시한다", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    renderPractice("student", "student-1");
    await completeTransform();

    fireEvent.click(screen.getByRole("button", { name: "이 질문으로 질문하기" }));

    expect(screen.getByPlaceholderText("바꾼 질문을 써 보세요")).toHaveValue(
      "환경 보호를 위해 일회용품을 줄이면 어떤 변화가 생길까요?",
    );
    expect(await screen.findByText("질문을 임시 저장하지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("성공 뒤 질문을 고치면 이전 성공 행동을 숨긴다", async () => {
    renderPractice("student", "student-1");
    await completeTransform();

    fireEvent.change(screen.getByPlaceholderText("바꾼 질문을 써 보세요"), {
      target: { value: "확인받지 않은 새 질문입니다" },
    });

    expect(screen.queryByRole("button", { name: "이 질문으로 질문하기" })).not.toBeInTheDocument();
  });
});
