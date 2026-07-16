// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import StoryDiceGame from "@/app/(student)/student-question-play/games/StoryDiceGame";
import DiceGame from "@/app/(student)/student-question-play/games/DiceGame";
import RelayGame from "@/app/(student)/student-question-play/games/RelayGame";
import KabaGame from "@/app/(student)/student-question-play/games/KabaGame";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { BUILT_IN_GAMES, type BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "@/app/(student)/student-question-play/[gameId]/page";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import {
  getStoryDiceWordText,
  pickFallbackBilingualWords,
} from "@/lib/story-dice-data";
import en from "../../messages/en.json";

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false, error: null }),
}));

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

type LocalMode = "solo" | "ai";
type LocalGameComponent = React.ComponentType<{
  game: BuiltInGame;
  onBack: () => void;
  config: GameStartConfig;
}>;

function gameById(id: string): BuiltInGame {
  const game = BUILT_IN_GAMES.find((item) => item.id === id);
  if (!game) throw new Error(`놀이를 찾을 수 없습니다: ${id}`);
  return game;
}

function renderLocalGame(
  id: string,
  Component: LocalGameComponent,
  mode: LocalMode = "solo",
  onBack = vi.fn(),
) {
  return renderWithIntl(
    <Component
      game={gameById(id)}
      onBack={onBack}
      config={{
        mode,
        players: mode === "ai" ? ["민준", "AI"] : ["민준"],
      }}
    />,
  );
}

function renderEnglishStoryGame(mode: LocalMode = "solo") {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en as never}
      timeZone="Asia/Seoul"
    >
      <StoryDiceGame
        game={gameById("story-dice")}
        onBack={vi.fn()}
        config={{
          mode,
          players: mode === "ai" ? ["Minjun", "AI"] : ["Minjun"],
        }}
      />
    </NextIntlClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function startStory(mode: LocalMode) {
  renderLocalGame("story-dice", StoryDiceGame, mode);
  await flushPromises();
  fireEvent.click(screen.getByRole("button", { name: /주사위 3개 굴리기/ }));
  await advance(1500);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "고양이가 학교에서 보물을 찾았어요." },
  });
  fireEvent.click(screen.getByRole("button", { name: /이야기 시작/ }));
  if (mode === "ai") await advance(400);
}

function submitStoryQuestion(value: string) {
  fireEvent.change(screen.getByPlaceholderText("이야기에 어울리는 질문을 만들어보세요..."), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: /질문 제출/ }));
}

function submitStoryAnswer(value: string) {
  fireEvent.change(screen.getByPlaceholderText("질문에 어울리는 짧은 대답을 한 문장으로 해보세요..."), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: /대답 제출/ }));
}

async function rollQuestionDice() {
  fireEvent.click(screen.getByRole("button", { name: /주사위.*굴리기/ }));
  await advance(1500);
  await flushPromises();
}

async function submitDiceQuestion(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /제출/ }));
  await flushPromises();
}

function relayRunSnapshot(
  id: string,
  mode: LocalMode,
  version: number,
  questionCount: number,
  status = "ACTIVE",
  aiTurnCount = 0,
) {
  return {
    id,
    gameId: "relay",
    mode: mode.toUpperCase(),
    status,
    version,
    targetCount: 3,
    questionCount,
    aiTurnCount,
    awaitingAiTurn:
      mode === "ai" &&
      questionCount === aiTurnCount + 1 &&
      questionCount < 3,
    preview: false,
  };
}

function installRelayRunServer(
  mode: LocalMode,
  issueAiTurn?: () => Promise<Response>,
) {
  let version = 1;
  let questionCount = 0;
  let aiTurnCount = 0;
  const runId = `relay-${mode}`;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === "/api/question-games/runs") {
      return new Response(JSON.stringify({
        run: relayRunSnapshot(runId, mode, version, questionCount, "ACTIVE", aiTurnCount),
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/ai-turn")) {
      if (issueAiTurn) return issueAiTurn();
      return Response.json({
        output: `인공지능 연결 질문 ${aiTurnCount + 1}은 무엇인가요?`,
        proof: `proof-${aiTurnCount + 1}`,
        expiresAt: "2099-07-16T03:01:30.000Z",
        runVersion: version,
      });
    }
    if (url.endsWith("/actions")) {
      version += 1;
      if (body.action === "relay-record-ai-turn") aiTurnCount += 1;
      else questionCount += 1;
      return Response.json({
        run: relayRunSnapshot(runId, mode, version, questionCount, "ACTIVE", aiTurnCount),
      });
    }
    if (url.endsWith("/complete")) {
      version += 1;
      const awarded = mode === "ai" ? 9 : 5;
      const dailyLimit = mode === "ai" ? 50 : 30;
      return Response.json({
        run: relayRunSnapshot(runId, mode, version, questionCount, "SETTLED", aiTurnCount),
        result: {
          awarded,
          dailyLimit,
          dailyRemaining: dailyLimit - awarded,
          cappedByLimit: false,
          preview: false,
        },
      });
    }
    return Response.json({ error: "지원하지 않는 시험 요청" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function startRelay(mode: LocalMode) {
  installRelayRunServer(mode);
  renderLocalGame("relay", RelayGame, mode);
  fireEvent.click(screen.getByRole("button", { name: "우주" }));
  fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));
  await flushPromises();
}

async function submitRelayQuestion(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /질문 (제출|연결)/ }));
  await flushPromises();
}

async function submitKaba(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /AI 선생님께 확인받기/ }));
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.1);
  aiMocks.ask.mockReset();
  aiMocks.ask.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("이야기 주사위 지역 목표", () => {
  it("최초 단어 요청은 언마운트 뒤 도착한 응답을 읽지 않는다", async () => {
    const delayed = deferred<unknown>();
    const parsedRead = vi.fn();
    aiMocks.ask.mockReturnValue(delayed.promise);
    const view = renderLocalGame("story-dice", StoryDiceGame);
    const lateResponse = {
      get parsed() {
        parsedRead();
        return {
          protagonist: ["고양이"],
          place: ["학교"],
          event: ["보물을 찾았어요"],
        };
      },
    };

    view.unmount();
    await act(async () => {
      delayed.resolve(lateResponse);
      await delayed.promise;
      await Promise.resolve();
    });

    expect(parsedRead).not.toHaveBeenCalled();
  });

  it.each([
    ["빈 객체", {}],
    ["일부 범주만 있는 객체", {
      protagonist: Array.from({ length: 6 }, (_, index) => `주인공 ${index + 1}`),
      place: Array.from({ length: 6 }, (_, index) => `장소 ${index + 1}`),
    }],
    ["빈 범주 배열", { protagonist: [], place: [], event: [] }],
    ["제한보다 긴 단어", {
      protagonist: Array.from({ length: 6 }, () => "가".repeat(61)),
      place: Array.from({ length: 6 }, () => "나".repeat(61)),
      event: Array.from({ length: 6 }, () => "다".repeat(61)),
    }],
  ])("인공지능 단어의 %s는 안전한 대체 단어로 바꾼다", async (_name, parsed) => {
    aiMocks.ask.mockResolvedValue({ parsed });
    renderLocalGame("story-dice", StoryDiceGame);

    await flushPromises();

    const poolTitle = screen.getByText(/주사위 단어/);
    const pool = poolTitle.parentElement;
    expect(pool).not.toBeNull();
    expect(pool?.querySelectorAll("span")).toHaveLength(24);
    expect(pool).not.toHaveTextContent("가".repeat(61));

    fireEvent.click(screen.getByRole("button", { name: /주사위 3개 굴리기/ }));
    await advance(1500);
    expect(screen.getByRole("textbox")).toBeVisible();
  });

  it("영어 화면의 대체 단어를 목록과 굴림 및 인공지능 문맥에 영어로 쓴다", async () => {
    const expectedWords = pickFallbackBilingualWords(8);
    const wordMatcher = (word: string) => (_content: string, element: Element | null) => (
      element?.tagName === "SPAN" && (
        element.textContent === word || element.textContent?.endsWith(` ${word}`)
      )
    );
    const expected = {
      protagonist: getStoryDiceWordText(
        expectedWords,
        expectedWords.protagonist[0],
        "en",
      ),
      place: getStoryDiceWordText(expectedWords, expectedWords.place[0], "en"),
      event: getStoryDiceWordText(expectedWords, expectedWords.event[0], "en"),
    };
    aiMocks.ask.mockImplementation(async ({ action }: { action: string }) => (
      action === "story-dice:words"
        ? { parsed: {} }
        : { text: "What happened next?" }
    ));
    renderEnglishStoryGame("ai");

    await flushPromises();

    for (const word of Object.values(expected)) {
      expect(screen.getByText(wordMatcher(word))).toBeVisible();
    }
    for (const word of [
      expectedWords.protagonist[0],
      expectedWords.place[0],
      expectedWords.event[0],
    ]) {
      expect(screen.queryByText(wordMatcher(word))).not.toBeInTheDocument();
    }

    const englishText = getQuestionGameText("en");
    fireEvent.click(screen.getByRole("button", { name: englishText.storyRoll3 }));
    await advance(1500);

    for (const word of Object.values(expected)) {
      expect(screen.getAllByText(wordMatcher(word))).toHaveLength(2);
    }
    const storyInput = screen.getByRole("textbox");
    expect(storyInput).toHaveAttribute(
      "placeholder",
      englishText.storyPlaceholder(
        expected.protagonist,
        expected.place,
        expected.event,
      ),
    );
    fireEvent.change(storyInput, {
      target: { value: "The robot found a secret map in the forest." },
    });
    fireEvent.click(screen.getByRole("button", { name: englishText.storyStart }));
    await advance(400);

    const questionRequest = aiMocks.ask.mock.calls.find(
      ([request]) => request.action === "story-dice:ai-question",
    )?.[0];
    expect(questionRequest?.context).toMatchObject(expected);
  });

  it("혼자 모드는 질문만 낸 상태가 아니라 셋째 답안으로 묶음을 닫을 때 끝난다", async () => {
    await startStory("solo");

    submitStoryQuestion("첫째 일은 왜 일어났나요?");
    submitStoryAnswer("첫째 까닭이에요.");
    submitStoryQuestion("둘째에는 무엇을 찾았나요?");
    submitStoryAnswer("둘째 보물을 찾았어요.");
    expect(screen.queryByText("이야기 주사위 끝!")).not.toBeInTheDocument();

    submitStoryQuestion("셋째에는 어떻게 해결했나요?");
    expect(screen.queryByText("이야기 주사위 끝!")).not.toBeInTheDocument();
    submitStoryAnswer("셋째에는 함께 해결했어요.");

    expect(screen.getByText("이야기 주사위 끝!")).toBeVisible();
    expect(screen.getByText(/대답 3개/)).toBeVisible();
  });

  it("빈 인공지능 응답은 대체 질문을 열고 셋째 답안 뒤 추가 질문을 요청하지 않는다", async () => {
    await startStory("ai");

    for (let index = 0; index < 3; index += 1) {
      expect(screen.getAllByText("그다음에는 어떤 일이 있었나요?")).toHaveLength(index + 1);
      submitStoryAnswer(`${index + 1}번째 대답이에요.`);
      if (index < 2) await advance(400);
    }

    expect(screen.getByText("이야기 주사위 끝!")).toBeVisible();
    const questionCalls = aiMocks.ask.mock.calls.filter(
      ([request]) => request.action === "story-dice:ai-question",
    );
    expect(questionCalls).toHaveLength(3);
    await advance(1000);
    expect(aiMocks.ask.mock.calls.filter(
      ([request]) => request.action === "story-dice:ai-question",
    )).toHaveLength(3);
  });
});

describe("질문 주사위 지역 목표", () => {
  it.each(["solo", "ai"] as const)(
    "%s 모드는 굴림 뒤 질문을 내기 전 다시 굴릴 수 없다",
    async (mode) => {
      renderLocalGame("dice", DiceGame, mode);

      await rollQuestionDice();

      expect(screen.getByRole("textbox")).toBeVisible();
      expect(screen.queryByRole("button", { name: /다시 굴리기/ }))
        .not.toBeInTheDocument();
    },
  );

  it("혼자 모드는 학생 질문 셋째 제출 직후 결과로 간다", async () => {
    renderLocalGame("dice", DiceGame);

    for (let index = 0; index < 3; index += 1) {
      await rollQuestionDice();
      await submitDiceQuestion(`${index + 1}번째 질문은 무엇인가요?`);
      if (index < 2) {
        expect(screen.queryByRole("button", { name: /다른 놀이 하러 가기/ })).not.toBeInTheDocument();
      }
    }

    expect(screen.getByRole("button", { name: /다른 놀이 하러 가기/ })).toBeVisible();
    expect(screen.getByText("📝 질문 기록 (3개)")).toBeVisible();
  });

  it("인공지능 질문을 기록하고 학생에게 돌려보낸 뒤 학생 질문 셋에서 끝난다", async () => {
    let generated = 0;
    aiMocks.ask.mockImplementation(async ({ action }: { action: string }) => {
      if (action === "dice:generate") {
        generated += 1;
        return { text: `인공지능 예시 질문 ${generated}은 무엇인가요?` };
      }
      return { text: "질문을 잘 만들었어요." };
    });
    renderLocalGame("dice", DiceGame, "ai");

    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");
    await rollQuestionDice();
    expect(screen.getByText("인공지능 예시 질문 1은 무엇인가요?")).toBeVisible();
    expect(screen.getByText(/민준.*🎲/)).toBeVisible();

    await rollQuestionDice();
    await submitDiceQuestion("둘째 학생 질문은 무엇인가요?");
    await rollQuestionDice();
    expect(screen.getByText("인공지능 예시 질문 2은 무엇인가요?")).toBeVisible();

    await rollQuestionDice();
    await submitDiceQuestion("셋째 학생 질문은 무엇인가요?");

    expect(screen.getByRole("button", { name: /다른 놀이 하러 가기/ })).toBeVisible();
    expect(aiMocks.ask.mock.calls.filter(([request]) => request.action === "dice:generate")).toHaveLength(2);
  });

  it("인공지능 질문이 비어도 학생 차례로 돌아온다", async () => {
    renderLocalGame("dice", DiceGame, "ai");
    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");
    await rollQuestionDice();

    expect(screen.getByText(/민준.*🎲/)).toBeVisible();
    expect(screen.getByRole("button", { name: /주사위.*굴리기/ })).toBeEnabled();
  });

  it("셋째 학생 질문은 끝나지 않는 피드백을 기다리지 않고 바로 끝난다", async () => {
    const pendingFeedback = deferred<{ text: string } | null>();
    let generated = 0;
    let feedbackCalls = 0;
    aiMocks.ask.mockImplementation(({ action }: { action: string }) => {
      if (action === "dice:generate") {
        generated += 1;
        return Promise.resolve({ text: `인공지능 예시 질문 ${generated}은 무엇인가요?` });
      }
      feedbackCalls += 1;
      return feedbackCalls === 1
        ? Promise.resolve({ text: "질문을 잘 만들었어요." })
        : pendingFeedback.promise;
    });
    renderLocalGame("dice", DiceGame, "ai");

    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");
    await rollQuestionDice();
    await rollQuestionDice();
    await submitDiceQuestion("둘째 학생 질문은 무엇인가요?");
    await rollQuestionDice();
    await rollQuestionDice();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "셋째 학생 질문은 무엇인가요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /제출/ }));
    await flushPromises();

    expect(screen.getByRole("button", { name: /다른 놀이 하러 가기/ })).toBeVisible();
    expect(feedbackCalls).toBe(1);
  });
});

describe("질문 릴레이 지역 목표", () => {
  it("혼자 모드는 학생 질문 셋째 제출 직후 자동 종료한다", async () => {
    await startRelay("solo");
    await submitRelayQuestion("우주에는 무엇이 있나요?");
    await submitRelayQuestion("그 별은 왜 빛나나요?");
    expect(screen.queryByText("릴레이 완성!")).not.toBeInTheDocument();
    await submitRelayQuestion("그 빛은 어디까지 가나요?");

    expect(screen.getByText("릴레이 완성!")).toBeVisible();
    expect(screen.getByText("총 3개의 질문이 이어졌어요!")).toBeVisible();
    expect(screen.getByText("+5점 적립!")).toBeVisible();
  });

  it("인공지능 질문을 목표에서 빼고 셋째 학생 질문 뒤 추가 요청 없이 끝난다", async () => {
    const fetchMock = installRelayRunServer("ai");
    renderLocalGame("relay", RelayGame, "ai");
    fireEvent.click(screen.getByRole("button", { name: "우주" }));
    fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));
    await flushPromises();

    await submitRelayQuestion("우주에는 무엇이 있나요?");
    await submitRelayQuestion("그 별은 왜 빛나나요?");
    expect(screen.queryByText("릴레이 완성!")).not.toBeInTheDocument();
    await submitRelayQuestion("그 빛은 어디까지 가나요?");

    expect(screen.getByText("릴레이 완성!")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ai-turn")))
      .toHaveLength(2);
    expect(screen.getByText("총 3개의 질문이 이어졌어요!")).toBeVisible();
    expect(screen.getByText("+9점 적립!")).toBeVisible();
  });

  it("인공지능 요청 중 목록 이동을 막고 바깥 종료 뒤 늦은 응답을 기록하지 않는다", async () => {
    const delayed = deferred<Response>();
    const onBack = vi.fn();
    const fetchMock = installRelayRunServer("ai", () => delayed.promise);
    const view = renderLocalGame("relay", RelayGame, "ai", onBack);
    fireEvent.click(screen.getByRole("button", { name: "우주" }));
    fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));
    await flushPromises();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "우주에는 무엇이 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문 제출/ }));
    await flushPromises();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ai-turn")))
      .toHaveLength(1);
    const back = screen.getByRole("button", { name: /목록/ });
    expect(back).toBeDisabled();
    fireEvent.click(back);
    expect(onBack).not.toHaveBeenCalled();
    view.unmount();

    await act(async () => {
      delayed.resolve(Response.json({
        output: "늦게 도착한 인공지능 질문은 무엇인가요?",
        proof: "late-proof",
        expiresAt: "2099-07-16T03:01:30.000Z",
        runVersion: 2,
      }));
      await delayed.promise;
    });

    expect(screen.queryAllByText("늦게 도착한 인공지능 질문은 무엇인가요?")).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url, init]) => {
      if (!String(url).endsWith("/actions")) return false;
      const body = JSON.parse(String((init as RequestInit | undefined)?.body));
      return body.action === "relay-record-ai-turn";
    })).toHaveLength(0);
  });
});

describe("까바 지역 목표", () => {
  it("인공지능 모드도 첫 학생 차례로 열 번 기록한 뒤 결과로 간다", async () => {
    renderLocalGame("kaba", KabaGame, "ai");

    for (let index = 0; index < 10; index += 1) {
      expect(screen.queryByText(/AI의 차례/)).not.toBeInTheDocument();
      await submitKaba(`${index + 1}번째 문장은 질문인가요?`);
      if (index < 9) {
        expect(screen.queryByText("완성!")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /다음 문장/ }));
      }
    }

    fireEvent.click(screen.getByRole("button", { name: /결과 보기/ }));
    expect(screen.getByText("완성!")).toBeVisible();
    expect(screen.getByText("10문제 중 10개 맞혔어요!")).toBeVisible();
    const entries = screen.getAllByTestId("kaba-result-entry");
    expect(entries).toHaveLength(10);
    for (const entry of entries) expect(entry).toHaveAttribute("data-player-name", "민준");
    expect(aiMocks.ask).toHaveBeenCalledTimes(10);
  });

  it("빈 또는 판독할 수 없는 인공지능 응답은 지역 질문 모양으로 판정한다", async () => {
    aiMocks.ask.mockResolvedValue({ text: "판정 형식이 없는 응답" });
    renderLocalGame("kaba", KabaGame, "ai");

    await submitKaba("질문이 아닌 문장입니다");

    expect(screen.getByText("다시해봐요")).toBeVisible();
  });
});

it("지역 화면은 점수 지급 훅을 가져오지 않는다", () => {
  const root = process.cwd();
  for (const file of ["StoryDiceGame.tsx", "DiceGame.tsx", "RelayGame.tsx", "KabaGame.tsx"]) {
    const source = readFileSync(join(
      root,
      "src/app/(student)/student-question-play/games",
      file,
    ), "utf8");
    expect(source).not.toContain("useSingleAward");
  }
});
