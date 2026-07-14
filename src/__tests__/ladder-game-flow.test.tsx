// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LadderGame from "@/app/(student)/student-question-play/games/LadderGame";
import LadderQuestionComposer from "@/app/(student)/student-question-play/games/LadderQuestionComposer";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false, error: null }),
}));

const game = BUILT_IN_GAMES.find(({ id }) => id === "ladder")!;

const OPEN_CONCEPTUAL = {
  closure: "open",
  cognitive: "conceptual",
  closureScore: 0.25,
  cognitiveScore: 0.92,
  reasoning: "원인과 결과를 이어서 생각하는 질문이에요.",
  feedback: "서로 다른 경우를 비교하면 생각을 더 넓힐 수 있어요.",
  inappropriate: false,
  inappropriateReason: "",
};

const ACTION_COLORS = {
  light: {
    backgroundClass: "bg-violet-700",
    foregroundClass: "text-white",
    background: "#6d28d9",
    foreground: "#ffffff",
  },
  dark: {
    backgroundClass: "dark:bg-violet-300",
    foregroundClass: "dark:text-violet-950",
    background: "#c4b5fd",
    foreground: "#2e1065",
  },
} as const;

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error("색상 값이 필요합니다");
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(background: string, foreground: string): number {
  const lighter = Math.max(
    relativeLuminance(background),
    relativeLuminance(foreground),
  );
  const darker = Math.min(
    relativeLuminance(background),
    relativeLuminance(foreground),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function expectActionButtonContrast(
  button: HTMLElement,
  theme: keyof typeof ACTION_COLORS,
) {
  const colors = ACTION_COLORS[theme];
  expect(button).toHaveClass(colors.backgroundClass, colors.foregroundClass);
  expect(button).not.toHaveAttribute("style");
  expect(contrastRatio(colors.background, colors.foreground)).toBeGreaterThanOrEqual(4.5);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderGame(
  mode: "solo" | "ai" = "solo",
  theme: "light" | "dark" = "light",
) {
  return renderWithIntl(
    <div className={theme === "dark" ? "dark" : undefined}>
      <LadderGame
        config={{
          mode,
          players: mode === "ai" ? ["민준", "AI"] : ["민준"],
        }}
        game={game}
        onBack={vi.fn()}
      />
    </div>,
  );
}

function drawLadder() {
  fireEvent.click(screen.getByRole("button", { name: /사다리 그리기/ }));
}

function chooseStart(start: number) {
  fireEvent.click(
    screen.getByRole("button", { name: `시작 ${start} 선택` }),
  );
}

async function confirmWithoutHelp(question: string) {
  const input = screen.getByRole("textbox", { name: /주제 질문$/ });
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "도움말 없이 확정" }),
  );
}

beforeEach(() => {
  aiMocks.ask.mockReset();
  aiMocks.ask.mockResolvedValue(null);
  let randomCall = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const value = randomCall % 10 === 0 ? 0 : 0.99;
    randomCall += 1;
    return value;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("지역 질문 사다리 세 라운드", () => {
  it("혼자 하기에서 시작점을 고른 뒤에만 공통 사다리의 배정 주제로 질문을 쓴다", () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    renderGame();

    drawLadder();

    expect(screen.getByRole("img", { name: "질문 사다리" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전체 배정" })).toBeInTheDocument();
    expect(screen.getAllByTestId("ladder-base-rung")).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: "질문 확인" }),
    ).not.toBeInTheDocument();

    chooseStart(1);

    expect(
      screen.getByRole("img", {
        name: /시작 1.*도착 D.*배정 주제 주제 D/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "주제 D 주제 질문" }),
    ).toBeInTheDocument();
  });

  it("첫째와 둘째 질문 뒤 새 사다리를 거치고 셋째 질문 뒤에만 셋을 완료로 보여 준다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({}, 500),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderGame();

    drawLadder();
    chooseStart(1);
    expect(
      screen.getByRole("textbox", { name: "주제 D 주제 질문" }),
    ).toBeInTheDocument();
    await confirmWithoutHelp("첫째 주제는 왜 달라질까요?");

    expect(await screen.findByText("첫째 라운드 질문")).toBeInTheDocument();
    expect(screen.queryByText("질문 사다리 완성")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 라운드" }));
    expect(screen.getByText("둘째 라운드 / 셋째 라운드")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "질문 확인" })).not.toBeInTheDocument();

    chooseStart(2);
    expect(
      screen.getByRole("textbox", { name: "주제 A 주제 질문" }),
    ).toBeInTheDocument();
    await confirmWithoutHelp("둘째 주제는 어떻게 이어질까요?");
    expect(await screen.findByText("둘째 라운드 질문")).toBeInTheDocument();
    expect(screen.queryByText("질문 사다리 완성")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 라운드" }));

    chooseStart(3);
    expect(
      screen.getByRole("textbox", { name: "주제 B 주제 질문" }),
    ).toBeInTheDocument();
    await confirmWithoutHelp("셋째 주제에서 무엇을 알아볼까요?");

    expect(await screen.findByText("질문 사다리 완성")).toBeInTheDocument();
    expect(screen.getByText("첫째 주제는 왜 달라질까요?")).toBeInTheDocument();
    expect(screen.getByText("둘째 주제는 어떻게 이어질까요?")).toBeInTheDocument();
    expect(screen.getByText("셋째 주제에서 무엇을 알아볼까요?")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("/api/points/award"),
      ),
    ).toBe(false);
  });

  it("분류 성공 도움말을 보고 공통 작성기에서 질문을 확정한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL)));
    renderGame();
    drawLadder();
    chooseStart(1);

    const input = screen.getByRole("textbox", { name: "주제 D 주제 질문" });
    fireEvent.change(input, {
      target: { value: "주제 D는 왜 다른 주제와 이어질까요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));

    expect(await screen.findByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 질문 확정" }));
    expect(await screen.findByText("첫째 라운드 질문")).toBeInTheDocument();
    expect(screen.getByText("주제 D는 왜 다른 주제와 이어질까요?")).toBeInTheDocument();
  });
});

describe("인공지능과 함께하는 질문 사다리", () => {
  it("학생과 인공지능 배정을 같은 사다리에 두고 서로의 실제 도착 주제를 쓴다", async () => {
    aiMocks.ask.mockResolvedValue({ text: "주제 B는 무엇과 이어질까요?\n둘째 줄" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    renderGame("ai");
    drawLadder();

    const beforeSelection = screen.getByRole("list", { name: "전체 배정" });
    expect(within(beforeSelection).queryByText("민준")).not.toBeInTheDocument();
    expect(within(beforeSelection).queryByText("AI")).not.toBeInTheDocument();
    expect(within(beforeSelection).getByText("시작 1")).toBeInTheDocument();
    expect(within(beforeSelection).getByText("시작 2")).toBeInTheDocument();
    expect(screen.getAllByTestId("ladder-base-rung")).toHaveLength(1);

    chooseStart(2);

    const assignments = screen.getByRole("list", { name: "전체 배정" });
    const studentRow = within(assignments).getByText("민준").closest("li");
    const aiRow = within(assignments).getByText("AI").closest("li");
    expect(studentRow).toHaveTextContent("2");
    expect(studentRow).toHaveTextContent("주제 A");
    expect(aiRow).toHaveTextContent("1");
    expect(aiRow).toHaveTextContent("주제 B");
    expect(
      screen.getByRole("textbox", { name: "주제 A 주제 질문" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /시작 2.*도착 A.*배정 주제 주제 A/,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("주제 B는 무엇과 이어질까요?")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /AI 친구의 질문/ }).parentElement,
    ).toHaveClass("lg:grid-cols-2");
    expect(aiMocks.ask).toHaveBeenCalledWith({
      action: "ladder:suggest",
      context: { topic: "주제 B" },
    });
  });

  it.each([
    ["실패", null],
    ["빈 응답", { text: "   \n " }],
  ])("인공지능 응답 %s이 도움말 없는 확정과 다음 라운드를 막지 않는다", async (_, response) => {
    aiMocks.ask.mockResolvedValue(response);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    renderGame("ai");
    drawLadder();
    chooseStart(1);

    await confirmWithoutHelp("학생 질문은 왜 계속 이어질까요?");

    expect(await screen.findByText("첫째 라운드 질문")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 라운드" })).toBeEnabled();
    expect(screen.queryByText("질문 사다리 완성")).not.toBeInTheDocument();
  });

  it("지난 라운드의 늦은 인공지능 응답을 현재 라운드에 붙이지 않는다", async () => {
    const firstRequest = deferred<{ text: string } | null>();
    aiMocks.ask
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ text: "둘째 라운드 인공지능 질문은 무엇일까요?" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    renderGame("ai");
    drawLadder();
    chooseStart(1);
    await confirmWithoutHelp("첫째 학생 질문은 무엇일까요?");
    fireEvent.click(await screen.findByRole("button", { name: "다음 라운드" }));
    chooseStart(2);

    expect(
      await screen.findByText("둘째 라운드 인공지능 질문은 무엇일까요?"),
    ).toBeInTheDocument();
    await act(async () => {
      firstRequest.resolve({ text: "늦게 도착한 첫째 라운드 질문" });
      await firstRequest.promise;
      await Promise.resolve();
    });

    expect(screen.queryByText("늦게 도착한 첫째 라운드 질문")).not.toBeInTheDocument();
    expect(screen.getByText("둘째 라운드 인공지능 질문은 무엇일까요?")).toBeInTheDocument();
  });

  it("셋째 학생 질문을 확정하기 전에는 인공지능 모드를 끝내지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    renderGame("ai");
    drawLadder();

    chooseStart(1);
    await confirmWithoutHelp("첫째 학생 질문은 왜 필요할까요?");
    expect(await screen.findByText("첫째 라운드 질문")).toBeInTheDocument();
    expect(screen.queryByText("질문 사다리 완성")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 라운드" }));

    chooseStart(1);
    await confirmWithoutHelp("둘째 학생 질문은 어떻게 달라질까요?");
    expect(await screen.findByText("둘째 라운드 질문")).toBeInTheDocument();
    expect(screen.queryByText("질문 사다리 완성")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 라운드" }));

    chooseStart(1);
    await confirmWithoutHelp("셋째 학생 질문에서 무엇을 배울까요?");
    expect(await screen.findByText("질문 사다리 완성")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "확정한 질문 셋" }).children,
    ).toHaveLength(3);
  });
});

describe("지역 사다리 화면 경계", () => {
  it.each(["light", "dark"] as const)(
    "%s 화면에서 새 핵심 동작 단추의 계산 대비가 사 점 오 이상이다",
    async (theme) => {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
      renderGame("solo", theme);

      const drawButton = screen.getByRole("button", { name: /사다리 그리기/ });
      expectActionButtonContrast(drawButton, theme);
      fireEvent.click(drawButton);
      chooseStart(1);
      await confirmWithoutHelp("핵심 동작 단추는 충분히 잘 보일까요?");

      const nextButton = await screen.findByRole("button", { name: "다음 라운드" });
      expectActionButtonContrast(nextButton, theme);
    },
  );

  it("공통 작성기가 확정을 거절하면 입력과 분류 도움말을 보존한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL)));
    renderWithIntl(
      <LadderQuestionComposer
        locale="ko"
        onConfirm={vi.fn(async () => false)}
        roundKey="local-rejection"
        topic="별빛"
      />,
    );

    const input = screen.getByRole("textbox", { name: "별빛 주제 질문" });
    fireEvent.change(input, { target: { value: "별빛은 왜 반짝일까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    expect(await screen.findByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 질문 확정" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "질문을 확정하지 못했어요",
    );
    expect(input).toHaveValue("별빛은 왜 반짝일까요?");
    expect(screen.getByText(OPEN_CONCEPTUAL.feedback)).toBeInTheDocument();
  });

  it("점수 지급 연결을 없애고 밝고 어두운 화면의 의미 클래스를 쓴다", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/(student)/student-question-play/games/LadderGame.tsx",
      ),
      "utf8",
    );

    expect(source).not.toContain("useSingleAward");
    expect(source).not.toContain("AwardBadge");
    expect(source).not.toMatch(/\/api\/points\/award/);
    expect(source).toContain("generateLadderGrid");
    expect(source).toContain("assignLadderTopics");
    expect(source).toContain("<LadderBoard");
    expect(source).toContain("<LadderQuestionComposer");
    expect(source).not.toMatch(/function generateLadder\s*\(/);
    expect(source).not.toMatch(/function tracePath\s*\(/);
    expect(source).not.toMatch(/bg-white|text-gray-/);
    expect(source).toContain("bg-card");
    expect(source).toContain("text-foreground");
    expect(source).toContain("text-muted-foreground");
    expect(source).toContain("border-border");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    const { container } = renderWithIntl(
      <div className="dark">
        <LadderGame
          config={{ mode: "solo", players: ["민준"] }}
          game={game}
          onBack={vi.fn()}
        />
      </div>,
    );
    expect(container.querySelector(".bg-card")).not.toBeNull();
    expect(container.querySelector(".text-foreground")).not.toBeNull();
    expect(container.querySelector(".border-border")).not.toBeNull();
    expect(
      screen.getByRole("textbox", { name: "질문 주제 1" }),
    ).toHaveClass("bg-background", "text-foreground");
  });
});
