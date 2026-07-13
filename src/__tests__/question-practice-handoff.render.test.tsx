// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { QuestionPracticeView } from "@/components/shared/QuestionPracticeView";
import type { PracticeSelection } from "@/lib/practice-selection";
import ko from "../../messages/ko.json";

const { push, customBankState } = vi.hoisted(() => ({
  push: vi.fn(),
  customBankState: { current: undefined as undefined | { quiz: unknown[]; transform: unknown[]; create: unknown[] } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: customBankState.current }),
}));

function practiceElement(
  audience: "student" | "teacher",
  studentId?: string,
  initialSelection?: PracticeSelection,
) {
  return (
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      <QuestionPracticeView
        audience={audience}
        studentId={studentId}
        initialSelection={initialSelection}
      />
    </NextIntlClientProvider>
  );
}

function renderPractice(
  audience: "student" | "teacher",
  studentId?: string,
  initialSelection?: PracticeSelection,
) {
  return render(practiceElement(audience, studentId, initialSelection));
}

async function completeTransform() {
  fireEvent.click(screen.getByRole("tab", { name: "2. 질문 바꾸기" }));
  fireEvent.change(screen.getByPlaceholderText("바꾼 질문을 써 보세요"), {
    target: { value: "환경 보호를 위해 일회용품을 줄이면 어떤 변화가 생길까요?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "AI에게 확인받기" }));
  await screen.findByText(/목표 달성/);
}

function successfulCheckResponse() {
  return {
    ok: true,
    json: async () => ({
      achieved: true,
      awarded: 0,
      classification: { closure: "open", cognitive: "conceptual" },
    }),
  };
}

function deferredCheckResponse() {
  let resolve!: (response: ReturnType<typeof successfulCheckResponse>) => void;
  const promise = new Promise<ReturnType<typeof successfulCheckResponse>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function deferredQuizResponse(awarded: number) {
  const response = {
    ok: true,
    json: async () => ({ correct: true, awarded }),
  };
  let resolve!: (value: typeof response) => void;
  const promise = new Promise<typeof response>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve(response) };
}

beforeEach(() => {
  push.mockReset();
  customBankState.current = undefined;
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
  it("추천 선택으로 들어오면 해당 유형 문항만 출제한다", () => {
    renderPractice("student", "student-1", {
      tab: "quiz",
      quizMode: "cognitive",
      focus: "controversial",
    });

    expect(screen.getByText("문화유산 보호를 위해 일반인의 출입을 제한하는 것은 정당할까요?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "논쟁적 질문" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "닫힌 질문" })).not.toBeInTheDocument();
    expect(screen.getByText("논쟁적 질문 집중")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "닫힌/열린 구분" }));
    expect(screen.queryByText("논쟁적 질문 집중")).not.toBeInTheDocument();
  });

  it("커스텀 문항이 도착해도 추천과 다른 유형은 집중 묶음에 섞지 않는다", () => {
    customBankState.current = {
      quiz: [
        {
          id: "custom-controversial",
          content: "학교 텃밭과 운동장 중 무엇을 더 넓혀야 할까요?",
          closure: "open",
          cognitive: "controversial",
          explanation: "두 가치의 우선순위를 근거와 함께 판단하는 질문이에요.",
        },
        {
          id: "custom-factual",
          content: "우리 학교 운동장은 몇 개인가요?",
          closure: "closed",
          cognitive: "factual",
          explanation: "확인하면 하나의 답을 얻는 사실적 질문이에요.",
        },
      ],
      transform: [],
      create: [],
    };
    renderPractice("student", "student-1", {
      tab: "quiz",
      quizMode: "cognitive",
      focus: "controversial",
    });
    vi.mocked(Math.random).mockReturnValue(0.999);

    fireEvent.click(screen.getByRole("button", { name: "논쟁적 질문" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 문제" }));

    expect(screen.getByText("학교 텃밭과 운동장 중 무엇을 더 넓혀야 할까요?")).toBeInTheDocument();
    expect(screen.queryByText("우리 학교 운동장은 몇 개인가요?")).not.toBeInTheDocument();
  });

  it("추천 선택이 바뀌면 답을 초기화하고 늦은 이전 지급 응답을 버린다", async () => {
    const first = deferredQuizResponse(99);
    const second = deferredQuizResponse(1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise),
    );
    const view = renderPractice("student", "student-1", {
      tab: "quiz",
      quizMode: "cognitive",
      focus: "conceptual",
    });
    fireEvent.click(screen.getByRole("button", { name: "개념적 질문" }));
    expect(screen.getByText(/정답이에요/)).toBeInTheDocument();

    view.rerender(
      practiceElement("student", "student-1", {
        tab: "quiz",
        quizMode: "closure",
        focus: "open",
      }),
    );
    expect(await screen.findByText("동물들이 환경에 따라 다른 특징을 가지는 이유는 무엇인가요?")).toBeInTheDocument();
    expect(screen.queryByText(/정답이에요/)).not.toBeInTheDocument();

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    fireEvent.click(screen.getByRole("button", { name: "열린 질문" }));
    expect(screen.queryByText("+99P 획득!")).not.toBeInTheDocument();

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(await screen.findByText("+1P 획득!")).toBeInTheDocument();
  });

  it("주소 선택으로 바꾸기에서 만들기로 이동하면 이전 입력을 지운다", async () => {
    const view = renderPractice("student", "student-1", {
      tab: "transform",
      quizMode: "cognitive",
      focus: null,
    });
    fireEvent.change(screen.getByPlaceholderText("바꾼 질문을 써 보세요"), {
      target: { value: "바꾸기 탭에서 작성한 질문입니다" },
    });

    view.rerender(
      practiceElement("student", "student-1", {
        tab: "create",
        quizMode: "cognitive",
        focus: null,
      }),
    );

    expect(await screen.findByPlaceholderText("개념적 질문을 만들어 써 보세요")).toHaveValue("");
  });

  it("직접 탭을 왕복하면 분류 답을 지우고 늦은 이전 지급 응답을 버린다", async () => {
    const first = deferredQuizResponse(99);
    const second = deferredQuizResponse(1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise),
    );
    renderPractice("student", "student-1");
    fireEvent.click(screen.getByRole("button", { name: "닫힌 질문" }));
    expect(screen.getByText(/정답이에요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "2. 질문 바꾸기" }));
    fireEvent.click(screen.getByRole("tab", { name: "1. 분류 연습" }));
    expect(screen.queryByText(/정답이에요/)).not.toBeInTheDocument();

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    fireEvent.click(screen.getByRole("button", { name: "닫힌 질문" }));
    expect(screen.queryByText("+99P 획득!")).not.toBeInTheDocument();

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(await screen.findByText("+1P 획득!")).toBeInTheDocument();
  });

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

  it("요청 중 입력을 고치면 늦게 도착한 이전 성공 결과를 버린다", async () => {
    const delayed = deferredCheckResponse();
    vi.stubGlobal("fetch", vi.fn(() => delayed.promise));
    renderPractice("student", "student-1");
    fireEvent.click(screen.getByRole("tab", { name: "2. 질문 바꾸기" }));
    const input = screen.getByPlaceholderText("바꾼 질문을 써 보세요");
    fireEvent.change(input, { target: { value: "처음 확인을 요청한 질문입니다" } });
    fireEvent.click(screen.getByRole("button", { name: "AI에게 확인받기" }));

    fireEvent.change(input, { target: { value: "요청 뒤에 고친 질문입니다" } });
    await act(async () => {
      delayed.resolve(successfulCheckResponse());
      await delayed.promise;
    });

    expect(screen.queryByRole("button", { name: "이 질문으로 질문하기" })).not.toBeInTheDocument();
    expect(input).toHaveValue("요청 뒤에 고친 질문입니다");
  });

  it("늦은 이전 요청의 마무리가 새 판정 요청의 진행 상태를 바꾸지 않는다", async () => {
    const first = deferredCheckResponse();
    const second = deferredCheckResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise),
    );
    renderPractice("student", "student-1");
    fireEvent.click(screen.getByRole("tab", { name: "2. 질문 바꾸기" }));
    const input = screen.getByPlaceholderText("바꾼 질문을 써 보세요");
    fireEvent.change(input, { target: { value: "첫 번째 질문입니다" } });
    fireEvent.click(screen.getByRole("button", { name: "AI에게 확인받기" }));

    fireEvent.change(input, { target: { value: "두 번째 질문입니다" } });
    fireEvent.click(screen.getByRole("button", { name: "AI에게 확인받기" }));
    await act(async () => {
      first.resolve(successfulCheckResponse());
      await first.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "확인하는 중..." })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "이 질문으로 질문하기" })).not.toBeInTheDocument();
    });

    await act(async () => {
      second.resolve(successfulCheckResponse());
      await second.promise;
    });
    expect(await screen.findByRole("button", { name: "이 질문으로 질문하기" })).toBeInTheDocument();
  });
});
