// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LadderBoard, {
  type LadderBoardAssignment,
} from "@/app/(student)/student-question-play/games/LadderBoard";
import LadderQuestionComposer from "@/app/(student)/student-question-play/games/LadderQuestionComposer";

const FIXED_GRID = [
  [true, false],
  [false, true],
  [false, false],
  [false, false],
  [false, false],
  [false, false],
  [false, false],
  [false, false],
  [false, false],
  [false, false],
] as const;

const LONG_NAME = "아주 긴 이름을 가진 질문 탐구 학생";
const LONG_TOPIC = "별빛이 지구에 도착하는 과정과 밤하늘의 모습이 계절마다 달라지는 까닭을 여러 관점에서 살펴보는 주제".padEnd(80, "가");

const ASSIGNMENTS: LadderBoardAssignment[] = [
  {
    playerName: LONG_NAME,
    startColumn: 0,
    destinationColumn: 2,
    topic: LONG_TOPIC,
  },
  {
    playerName: "민준",
    startColumn: 1,
    destinationColumn: 0,
    topic: "물의 순환",
  },
  {
    playerName: "서연",
    startColumn: 2,
    destinationColumn: 1,
    topic: "달의 모양",
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const OPEN_CONCEPTUAL = {
  closure: "open",
  cognitive: "conceptual",
  closureScore: 0.3,
  cognitiveScore: 0.91,
  reasoning: "여러 원인을 연결해 생각해야 해요.",
  feedback: "좋은 질문이에요. 비교할 대상을 더하면 생각이 깊어져요.",
  inappropriate: false,
  inappropriateReason: "",
};

const CLOSED_FACTUAL = {
  ...OPEN_CONCEPTUAL,
  closure: "closed",
  cognitive: "factual",
  closureScore: 0.9,
  reasoning: "하나의 사실을 확인하는 질문이에요.",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("공통 질문 사다리 그림", () => {
  it("기본선 위에 실제 사다리 선분만 강조하고 시작 열 전체를 칠하지 않는다", () => {
    render(
      <LadderBoard
        locale="ko"
        grid={FIXED_GRID}
        assignments={ASSIGNMENTS}
        selectedStartColumn={0}
      />,
    );

    expect(screen.getAllByTestId("ladder-base-vertical")).toHaveLength(3);
    expect(screen.getAllByTestId("ladder-base-rung")).toHaveLength(2);

    const pathSegments = screen.getAllByTestId("ladder-path-segment");
    expect(pathSegments.length).toBeGreaterThan(0);
    for (const segment of pathSegments) {
      const x1 = segment.getAttribute("x1");
      const x2 = segment.getAttribute("x2");
      const y1 = segment.getAttribute("y1");
      const y2 = segment.getAttribute("y2");
      expect(x1 === x2 || y1 === y2).toBe(true);
    }

    const baseRungs = screen.getAllByTestId("ladder-base-rung").map((line) => ({
      x1: line.getAttribute("x1"),
      x2: line.getAttribute("x2"),
      y: line.getAttribute("y1"),
    }));
    const highlightedRungs = pathSegments
      .filter((line) => line.dataset.axis === "horizontal")
      .map((line) => ({
        x1: line.getAttribute("x1"),
        x2: line.getAttribute("x2"),
        y: line.getAttribute("y1"),
      }));
    expect(highlightedRungs).toEqual([
      baseRungs[0],
      baseRungs[1],
    ]);

    const startColumnVerticals = pathSegments.filter(
      (line) => line.dataset.axis === "vertical" && line.dataset.fromColumn === "0",
    );
    expect(startColumnVerticals).toHaveLength(1);
    expect(startColumnVerticals[0]).toHaveAttribute("data-to-level", "0.5");
  });

  it("시작과 도착을 모양과 접근 가능한 이름으로 알리고 배정 주제를 표시한다", () => {
    render(
      <LadderBoard
        locale="ko"
        grid={FIXED_GRID}
        assignments={ASSIGNMENTS}
        selectedStartColumn={0}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /시작 1.*도착 C.*별빛이 지구에 도착/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ladder-start-marker")).toHaveTextContent("S");
    expect(screen.getByTestId("ladder-end-marker")).toHaveTextContent("E");
    expect(screen.getByText(LONG_TOPIC)).toBeInTheDocument();
  });

  it("긴 이름과 주제는 그림 안 좌표를 바꾸지 않고 아래 전체 배정 목록에서 줄바꿈한다", () => {
    const { container, rerender } = render(
      <LadderBoard
        locale="ko"
        grid={FIXED_GRID}
        assignments={ASSIGNMENTS}
        selectedStartColumn={0}
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    if (!svg) throw new Error("사다리 그림이 필요합니다");
    const firstCoordinates = Array.from(svg.querySelectorAll("line")).map((line) => [
      line.getAttribute("x1"),
      line.getAttribute("y1"),
      line.getAttribute("x2"),
      line.getAttribute("y2"),
    ]);
    const visibleSvgText = Array.from(svg.querySelectorAll("text"))
      .map((node) => node.textContent)
      .join(" ");
    expect(visibleSvgText).not.toContain(LONG_NAME);
    expect(visibleSvgText).not.toContain(LONG_TOPIC);

    const list = screen.getByRole("list", { name: "전체 배정" });
    expect(within(list).getByText(LONG_NAME)).toHaveClass("break-words");
    expect(within(list).getByText(LONG_TOPIC)).toHaveClass("break-words");

    rerender(
      <LadderBoard
        locale="ko"
        grid={FIXED_GRID}
        assignments={ASSIGNMENTS.map((assignment) => ({
          ...assignment,
          playerName: "짧은 이름",
          topic: "짧은 주제",
        }))}
        selectedStartColumn={0}
      />,
    );
    const nextCoordinates = Array.from(
      container.querySelectorAll("svg line"),
    ).map((line) => [
      line.getAttribute("x1"),
      line.getAttribute("y1"),
      line.getAttribute("x2"),
      line.getAttribute("y2"),
    ]);
    expect(nextCoordinates).toEqual(firstCoordinates);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])("%i열에서 고정 높이와 열당 안정 너비를 쓴다", (count) => {
    const grid = Array.from({ length: 10 }, () =>
      Array.from({ length: count - 1 }, () => false),
    );
    const assignments = Array.from({ length: count }, (_, index) => ({
      playerName: `학생 ${index + 1}`,
      startColumn: index,
      destinationColumn: index,
      topic: `주제 ${index + 1}`,
    }));
    render(
      <LadderBoard
        locale="ko"
        grid={grid}
        assignments={assignments}
      />,
    );

    const svg = screen.getByRole("img");
    const viewBox = svg.getAttribute("viewBox")?.split(" ").map(Number);
    expect(viewBox).toEqual([0, 0, 96 + (count - 1) * 96, 400]);
    expect(svg).toHaveAttribute("width", String(96 + (count - 1) * 96));
    expect(svg.parentElement).toHaveClass("overflow-x-auto");
  });

  it("새 그림 안에서 난수와 사다리 재계산을 하지 않고 밝고 어두운 색 짝을 명시한다", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/(student)/student-question-play/games/LadderBoard.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("buildLadderPathSegments");
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("assignLadderTopics");
    expect(source).not.toContain("generateLadderGrid");
    expect(source).not.toMatch(/bg-white|text-gray-/);
    expect(source).toMatch(/text-slate-\d+ dark:text-slate-\d+/);
    expect(source).toMatch(/text-violet-\d+ dark:text-violet-\d+/);
  });
});

describe("공통 질문 확인 작성기", () => {
  it.each([
    ["", "질문을 입력해 주세요"],
    ["별빛을 관찰한다", "질문 모양으로 써 주세요"],
    [`${"가".repeat(200)}?`, "200자 이내로 써 주세요"],
  ])("잘못된 값 %s은 분류 요청 없이 입력 가까이 알린다", async (value, error) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(input).toHaveValue(value);
  });

  it("현재 영어 질문 모양도 확인 전에 검사한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LadderQuestionComposer
        locale="en"
        roundKey="round-1"
        topic="starlight"
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /question.*starlight/i });
    fireEvent.change(input, { target: { value: "Starlight reaches Earth" } });
    fireEvent.click(screen.getByRole("button", { name: "Check question" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Write it as a question");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("다듬은 질문만 분류하고 열린 정도, 질문 유형, 까닭과 도움말을 보여 준다", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "  별빛은 왜 지구까지 올까요?  " } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));

    expect(await screen.findByText("열린 정도 70%"), "분류 검토가 열려야 함").toBeInTheDocument();
    expect(screen.getByText("열린 질문")).toBeInTheDocument();
    expect(screen.getByText("개념적 질문")).toBeInTheDocument();
    expect(screen.getByText(OPEN_CONCEPTUAL.reasoning)).toBeInTheDocument();
    expect(screen.getByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/classify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "별빛은 왜 지구까지 올까요?" }),
      }),
    );
  });

  it("닫힌 사실 질문도 확정하며 분류 자료는 확정 콜백에 넣지 않는다", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(CLOSED_FACTUAL));
    const onConfirm = vi.fn(async () => true);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="달"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", { name: /달.*질문/ });
    fireEvent.change(input, { target: { value: "  달은 지구 주위를 도나요?  " } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    expect(await screen.findByText("닫힌 질문")).toBeInTheDocument();
    expect(screen.getByText("사실적 질문")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이 질문 확정" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("달은 지구 주위를 도나요?"));
    expect(onConfirm.mock.calls[0]).toHaveLength(1);
    expect(input).toHaveValue("");
  });

  it("고쳐 쓰거나 입력을 수정하면 이전 분류 도움말을 버리고 입력은 남긴다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL)));
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "별빛은 왜 지구까지 올까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    expect(await screen.findByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "고쳐 쓰기" }));
    expect(input).toHaveValue("별빛은 왜 지구까지 올까요?");
    expect(screen.queryByText(OPEN_CONCEPTUAL.feedback)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    expect(await screen.findByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "별빛은 어떻게 움직일까요?" } });
    expect(screen.queryByText(OPEN_CONCEPTUAL.feedback)).not.toBeInTheDocument();
  });

  it.each([
    ["호출 제한", () => jsonResponse({ error: "too many" }, 429)],
    ["응답 형 오류", () => jsonResponse({ closure: "unknown" })],
  ])("%s 뒤 입력을 보존하고 다시 확인과 도움말 없는 확정을 제공한다", async (_, makeResponse) => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse()));
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "별빛은 왜 반짝일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));

    expect(await screen.findByText("질문 도움말을 불러오지 못했어요.")).toBeInTheDocument();
    expect(input).toHaveValue("별빛은 왜 반짝일까요?");
    expect(screen.getByRole("button", { name: "다시 확인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도움말 없이 확정" })).toBeInTheDocument();
  });

  it("도움말 없이 확정해도 다듬은 질문 문자열만 전달한다", async () => {
    const onConfirm = vi.fn(async () => true);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "  별빛은 왜 반짝일까요?  " } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "도움말 없이 확정" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("별빛은 왜 반짝일까요?"));
    expect(onConfirm.mock.calls[0]).toHaveLength(1);
    expect(input).toHaveValue("");
  });

  it.each([
    ["거절", vi.fn(async () => false)],
    ["통신 실패", vi.fn(async () => { throw new Error("network"); })],
  ])("확정 %s 뒤 입력과 검토 내용을 보존한다", async (_, onConfirm) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL)));
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "별빛은 왜 반짝일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 질문 확정" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("질문을 확정하지 못했어요");
    expect(input).toHaveValue("별빛은 왜 반짝일까요?");
    expect(screen.getByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();
  });

  it("확정 대기 중 고친 입력은 이전 성공으로 지우지 않고 다시 확정할 수 있다", async () => {
    const pending = deferred<boolean>();
    const onConfirm = vi.fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(true);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL)));
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "별빛은 왜 반짝일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 질문 확정" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: "별빛은 어떻게 움직일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    const nextConfirm = await screen.findByRole("button", { name: "이 질문 확정" });
    expect(nextConfirm).toBeEnabled();

    pending.resolve(true);
    await waitFor(() => expect(input).toHaveValue("별빛은 어떻게 움직일까요?"));
    fireEvent.click(nextConfirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(input).toHaveValue("");
  });

  it("늦은 분류 응답이 바뀐 입력을 덮지 않는다", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "별빛은 왜 반짝일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    expect(await screen.findByText("질문을 살펴보는 중이에요...")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "별빛은 어떻게 움직일까요?" } });
    pending.resolve(jsonResponse(OPEN_CONCEPTUAL));

    await waitFor(() => expect(input).toHaveValue("별빛은 어떻게 움직일까요?"));
    expect(screen.queryByText(OPEN_CONCEPTUAL.feedback)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 확인" })).toBeInTheDocument();
  });

  it("roundKey가 바뀌면 입력과 검토를 비우고 이전 라운드 응답을 무시한다", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const onConfirm = vi.fn();
    const { rerender } = render(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-1"
        topic="별빛"
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", { name: /별빛.*질문/ });
    fireEvent.change(input, { target: { value: "별빛은 왜 반짝일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));

    rerender(
      <LadderQuestionComposer
        locale="ko"
        roundKey="round-2"
        topic="달"
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("textbox", { name: /달.*질문/ })).toHaveValue("");

    pending.resolve(jsonResponse(OPEN_CONCEPTUAL));
    await waitFor(() => {
      expect(screen.queryByText(OPEN_CONCEPTUAL.feedback)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "질문 확인" })).toBeInTheDocument();
  });

  it("밝고 어두운 화면을 위한 의미색 짝을 쓰고 고정 밝은 의미색을 쓰지 않는다", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/(student)/student-question-play/games/LadderQuestionComposer.tsx",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/bg-white|text-gray-/);
    expect(source).toContain("bg-card");
    expect(source).toContain("text-card-foreground");
    expect(source).toMatch(/text-rose-\d+ dark:text-rose-\d+/);
    expect(source).toMatch(/text-indigo-\d+ dark:text-indigo-\d+/);
  });
});
