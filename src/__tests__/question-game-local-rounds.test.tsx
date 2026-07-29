// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StoryDiceGame from "@/app/(student)/student-question-play/games/StoryDiceGame";
import DiceGame from "@/app/(student)/student-question-play/games/DiceGame";
import RelayGame from "@/app/(student)/student-question-play/games/RelayGame";
import KabaGame from "@/app/(student)/student-question-play/games/KabaGame";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";
import { BUILT_IN_GAMES, type BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "@/app/(student)/student-question-play/[gameId]/page";

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

async function startStory(
  mode: LocalMode,
  options: StoryDiceRunServerOptions = {},
) {
  const fetchMock = installStoryDiceRunServer(mode, options);
  renderLocalGame("story-dice", StoryDiceGame, mode);
  await flushPromises();
  fireEvent.click(screen.getByRole("button", { name: /주사위 3개 굴리기/ }));
  await flushPromises();
  await advance(1500);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "서버 해적이 서버 미래도시에서 서버 비밀지도를 찾았어요." },
  });
  fireEvent.click(screen.getByRole("button", { name: /이야기 시작/ }));
  await flushPromises();
  if (mode === "ai") {
    await advance(400);
    await flushPromises();
  }
  return fetchMock;
}

async function submitStoryQuestion(value: string) {
  fireEvent.change(screen.getByPlaceholderText("이야기에 어울리는 질문을 만들어보세요..."), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: /질문 제출/ }));
  await flushPromises();
}

async function submitStoryAnswer(value: string) {
  fireEvent.change(screen.getByPlaceholderText("질문에 어울리는 짧은 대답을 한 문장으로 해보세요..."), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: /대답 제출/ }));
  await flushPromises();
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

const STORY_DICE_SERVER_WORDS = {
  protagonist: [
    "서버 로봇", "서버 탐정", "서버 마법사", "서버 발명가",
    "서버 외계인", "서버 학생", "서버 강아지", "서버 해적",
  ],
  place: [
    "서버 학교", "서버 숲", "서버 바다", "서버 우주",
    "서버 놀이공원", "서버 무인도", "서버 동굴", "서버 미래도시",
  ],
  event: [
    "서버 보물상자", "서버 비밀지도", "서버 열쇠", "서버 타임머신",
    "서버 마법책", "서버 편지", "서버 버튼", "서버 알 수 없는 소리",
  ],
} as const;

const STORY_DICE_SERVER_ROLL = {
  protagonist: STORY_DICE_SERVER_WORDS.protagonist[7],
  place: STORY_DICE_SERVER_WORDS.place[7],
  event: STORY_DICE_SERVER_WORDS.event[1],
};

type StoryDiceRunStep =
  | "ROLL"
  | "STORY"
  | "STUDENT_QUESTION"
  | "AI_QUESTION"
  | "STUDENT_ANSWER"
  | "COMPLETE";

interface StoryDiceRunServerOptions {
  loseFinalAnswerResponse?: boolean;
  loseFirstAiIssueResponse?: boolean;
  loseFirstAiRecordResponse?: boolean;
}

function storyDiceRunSnapshot(
  mode: LocalMode,
  version: number,
  questionCount: number,
  aiTurnCount: number,
  step: StoryDiceRunStep,
  status: "ACTIVE" | "SETTLED",
) {
  return {
    id: `story-dice-${mode}`,
    gameId: "story-dice",
    mode: mode.toUpperCase(),
    status,
    version,
    targetCount: 3,
    questionCount,
    aiTurnCount,
    awaitingAiTurn: step === "AI_QUESTION",
    preview: false,
    storyDiceNextStep: step,
    storyWordPool: STORY_DICE_SERVER_WORDS,
    storyRolledWords: step === "ROLL" ? null : STORY_DICE_SERVER_ROLL,
  };
}

function installStoryDiceRunServer(
  mode: LocalMode,
  options: StoryDiceRunServerOptions = {},
) {
  let version = 1;
  let questionCount = 0;
  let aiTurnCount = 0;
  let step: StoryDiceRunStep = "ROLL";
  let status: "ACTIVE" | "SETTLED" = "ACTIVE";
  let result: Record<string, unknown> | null = null;
  let finalAnswerResponseLost = false;
  let firstAiIssueResponseLost = false;
  let firstAiRecordResponseLost = false;
  let nextAiProofSequence = 1;
  const aiIssueResponses = new Map<string, Record<string, unknown>>();
  const aiRecordResponses = new Map<string, Record<string, unknown>>();

  const currentRun = () => storyDiceRunSnapshot(
    mode,
    version,
    questionCount,
    aiTurnCount,
    step,
    status,
  );

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url === "/api/question-games/runs") {
      return new Response(JSON.stringify({ run: currentRun() }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.endsWith("/result")) {
      return Response.json({ run: currentRun(), result });
    }

    if (url.endsWith("/ai-turn")) {
      if (mode !== "ai" || step !== "AI_QUESTION" || body.expectedVersion !== version) {
        return Response.json({ error: "인공지능 질문 차례가 아닙니다." }, { status: 409 });
      }
      const replay = aiIssueResponses.get(body.requestId);
      if (replay) return Response.json(replay);
      const proofSequence = nextAiProofSequence;
      nextAiProofSequence += 1;
      const issued = {
        output: `인공지능 질문 ${aiTurnCount + 1}: 다음에는 어떤 일이 있었나요?`,
        proof: `story-proof-${proofSequence}`,
        proofId: `story-proof-id-${proofSequence}`,
        expiresAt: "2099-07-16T03:01:30.000Z",
        runVersion: version,
      };
      aiIssueResponses.set(body.requestId, issued);
      if (options.loseFirstAiIssueResponse && !firstAiIssueResponseLost) {
        firstAiIssueResponseLost = true;
        throw new TypeError("인공지능 질문 발급 응답 연결이 끊겼습니다.");
      }
      return Response.json(issued);
    }

    if (!url.endsWith("/actions")) {
      return Response.json({ error: "지원하지 않는 시험 요청" }, { status: 404 });
    }
    if (body.action === "story-dice-record-ai-question") {
      const replay = aiRecordResponses.get(body.requestId);
      if (replay) return Response.json({ ...replay, replayed: true });
    }
    if (body.expectedVersion !== version) {
      return Response.json({ error: "이야기 주사위 상태가 바뀌었습니다." }, { status: 409 });
    }
    if (
      body.action === "story-dice-submit-story" &&
      (
        typeof body.story !== "string" ||
        !Object.values(STORY_DICE_SERVER_ROLL).every((word) => body.story.includes(word))
      )
    ) {
      return Response.json(
        { error: "주사위로 나온 세 단어를 모두 넣어 이야기를 써 주세요." },
        { status: 400 },
      );
    }

    if (body.action === "story-dice-roll" && step === "ROLL") {
      step = "STORY";
    } else if (body.action === "story-dice-submit-story" && step === "STORY") {
      step = mode === "ai" ? "AI_QUESTION" : "STUDENT_QUESTION";
    } else if (
      body.action === "story-dice-submit-question" &&
      mode === "solo" &&
      step === "STUDENT_QUESTION"
    ) {
      step = "STUDENT_ANSWER";
    } else if (
      body.action === "story-dice-record-ai-question" &&
      mode === "ai" &&
      step === "AI_QUESTION"
    ) {
      aiTurnCount += 1;
      step = "STUDENT_ANSWER";
    } else if (body.action === "story-dice-submit-answer" && step === "STUDENT_ANSWER") {
      questionCount += 1;
      if (questionCount === 3) {
        status = "SETTLED";
        step = "COMPLETE";
        const awarded = mode === "ai" ? 9 : 5;
        const dailyLimit = mode === "ai" ? 50 : 30;
        result = {
          awarded,
          dailyLimit,
          dailyRemaining: dailyLimit - awarded,
          cappedByLimit: false,
          preview: false,
        };
      } else {
        step = mode === "ai" ? "AI_QUESTION" : "STUDENT_QUESTION";
      }
    } else {
      return Response.json({ error: "이야기 주사위 차례가 맞지 않습니다." }, { status: 409 });
    }

    version += 1;
    const response = { run: currentRun(), result, replayed: false };
    if (body.action === "story-dice-record-ai-question") {
      aiRecordResponses.set(body.requestId, response);
      if (options.loseFirstAiRecordResponse && !firstAiRecordResponseLost) {
        firstAiRecordResponseLost = true;
        throw new TypeError("인공지능 질문 기록 응답 연결이 끊겼습니다.");
      }
    }
    if (
      options.loseFinalAnswerResponse &&
      body.action === "story-dice-submit-answer" &&
      questionCount === 3 &&
      !finalAnswerResponseLost
    ) {
      finalAnswerResponseLost = true;
      throw new TypeError("정산 응답 연결이 끊겼습니다.");
    }
    return Response.json(response);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

function diceRunSnapshot(
  id: string,
  mode: LocalMode,
  version: number,
  questionCount: number,
  aiTurnCount: number,
  nextStep: "STUDENT_ROLL" | "STUDENT_QUESTION" | "AI_ROLL" | "AI_QUESTION" | "COMPLETE",
  pendingRoll: { actor: "STUDENT" | "AI"; face: number } | null,
  status = "ACTIVE",
) {
  return {
    id,
    gameId: "dice",
    mode: mode.toUpperCase(),
    status,
    version,
    targetCount: 3,
    questionCount,
    aiTurnCount,
    awaitingAiTurn: nextStep === "AI_QUESTION",
    nextStep,
    pendingRoll,
    preview: false,
  };
}

function installDiceRunServer(
  mode: LocalMode,
  options: { failFirstAiRoll?: boolean; failFirstAiTurn?: boolean } = {},
) {
  const runId = `dice-${mode}`;
  let version = 1;
  let questionCount = 0;
  let aiTurnCount = 0;
  let nextStep: "STUDENT_ROLL" | "STUDENT_QUESTION" | "AI_ROLL" | "AI_QUESTION" | "COMPLETE" = "STUDENT_ROLL";
  let pendingRoll: { actor: "STUDENT" | "AI"; face: number } | null = null;
  let status = "ACTIVE";
  let failedAiRoll = false;
  let failedAiTurn = false;
  let result: Record<string, unknown> | null = null;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === "/api/question-games/runs") {
      return new Response(JSON.stringify({
        run: diceRunSnapshot(
          runId,
          mode,
          version,
          questionCount,
          aiTurnCount,
          nextStep,
          pendingRoll,
          status,
        ),
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/result")) {
      return Response.json({
        run: diceRunSnapshot(
          runId,
          mode,
          version,
          questionCount,
          aiTurnCount,
          nextStep,
          pendingRoll,
          status,
        ),
        result,
      });
    }
    if (url.endsWith("/ai-turn")) {
      if (options.failFirstAiTurn && !failedAiTurn) {
        failedAiTurn = true;
        return Response.json({ error: "인공지능 응답이 지연되고 있습니다" }, { status: 503 });
      }
      return Response.json({
        output: `인공지능 예시 질문 ${aiTurnCount + 1}은 무엇인가요?`,
        proof: `dice-proof-${aiTurnCount + 1}`,
        expiresAt: "2099-07-16T03:01:30.000Z",
        runVersion: version,
      });
    }
    if (url.endsWith("/actions") && body.action === "dice-roll") {
      const actor = nextStep === "AI_ROLL" ? "AI" : "STUDENT";
      if (actor === "AI" && options.failFirstAiRoll && !failedAiRoll) {
        failedAiRoll = true;
        return Response.json({ error: "인공지능 주사위 응답이 지연되고 있습니다" }, { status: 503 });
      }
      pendingRoll = { actor, face: (version % 6) + 1 };
      nextStep = actor === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";
      version += 1;
    } else if (url.endsWith("/actions") && body.action === "dice-submit-question") {
      questionCount += 1;
      pendingRoll = null;
      version += 1;
      if (questionCount === 3) {
        status = "SETTLED";
        nextStep = "COMPLETE";
        const awarded = mode === "ai" ? 9 : 5;
        const dailyLimit = mode === "ai" ? 50 : 30;
        result = {
          awarded,
          dailyLimit,
          dailyRemaining: dailyLimit - awarded,
          cappedByLimit: false,
          preview: false,
        };
      } else {
        nextStep = mode === "ai" ? "AI_ROLL" : "STUDENT_ROLL";
      }
    } else if (url.endsWith("/actions") && body.action === "dice-record-ai-question") {
      aiTurnCount += 1;
      pendingRoll = null;
      nextStep = "STUDENT_ROLL";
      version += 1;
    } else {
      return Response.json({ error: "지원하지 않는 시험 요청" }, { status: 404 });
    }
    return Response.json({
      run: diceRunSnapshot(
        runId,
        mode,
        version,
        questionCount,
        aiTurnCount,
        nextStep,
        pendingRoll,
        status,
      ),
      result,
      replayed: false,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const KABA_SENTENCES = [
  "하늘이 맑습니다.",
  "별이 밝게 빛납니다.",
  "새가 나무 위에 앉았습니다.",
  "친구가 운동장에서 달립니다.",
  "비가 창문을 두드립니다.",
  "강물이 바다로 흐릅니다.",
  "꽃이 봄에 피어납니다.",
  "달이 구름 뒤에 숨었습니다.",
  "바람이 나뭇잎을 흔듭니다.",
  "책이 책상 위에 놓여 있습니다.",
] as const;

function kabaRunSnapshot(
  mode: LocalMode,
  version: number,
  questionCount: number,
  correctCount: number,
) {
  const active = questionCount < KABA_SENTENCES.length;
  return {
    id: `kaba-${mode}`,
    gameId: "kaba",
    mode: mode.toUpperCase(),
    status: active ? "ACTIVE" : "SETTLED",
    version,
    targetCount: KABA_SENTENCES.length,
    questionCount,
    aiTurnCount: 0,
    awaitingAiTurn: false,
    preview: false,
    correctCount,
    currentSentence: active ? KABA_SENTENCES[questionCount] : null,
    kabaNextStep: active ? "STUDENT_ATTEMPT" : "COMPLETE",
  };
}

function installKabaRunServer(
  mode: LocalMode,
  options: {
    judgements?: readonly boolean[];
    loseResponseAt?: number;
    rejectAfterConcurrentAdvanceAt?: number;
  } = {},
) {
  let version = 1;
  let questionCount = 0;
  let correctCount = 0;
  let lostResponse = false;
  let result: Record<string, unknown> | null = null;
  const responsesByRequestId = new Map<string, Record<string, unknown>>();

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url === "/api/question-games/runs") {
      return new Response(JSON.stringify({
        run: kabaRunSnapshot(mode, version, questionCount, correctCount),
      }), { status: 201, headers: { "content-type": "application/json" } });
    }

    if (url.endsWith("/result")) {
      return Response.json({
        run: kabaRunSnapshot(mode, version, questionCount, correctCount),
        result,
      });
    }

    if (url.endsWith("/actions") && body.action === "kaba-submit-attempt") {
      const replayed = responsesByRequestId.get(body.requestId);
      if (replayed) return Response.json({ ...replayed, replayed: true });
      if (body.expectedVersion !== version || questionCount >= KABA_SENTENCES.length) {
        return Response.json({ error: "까바놀이 상태가 바뀌었습니다." }, { status: 409 });
      }

      const attemptIndex = questionCount;
      const correct = options.judgements?.[attemptIndex] ?? true;
      questionCount += 1;
      correctCount += correct ? 1 : 0;
      version += 1;

      if (questionCount === KABA_SENTENCES.length) {
        const awarded = mode === "ai" ? correctCount * 2 + 3 : correctCount + 2;
        const dailyLimit = mode === "ai" ? 50 : 30;
        result = {
          awarded,
          dailyLimit,
          dailyRemaining: dailyLimit - awarded,
          cappedByLimit: false,
          preview: false,
        };
      }

      if (options.rejectAfterConcurrentAdvanceAt === attemptIndex) {
        return Response.json(
          { error: "까바놀이 상태가 다른 화면에서 바뀌었습니다." },
          { status: 409 },
        );
      }

      const response = {
        run: kabaRunSnapshot(mode, version, questionCount, correctCount),
        result,
        correct,
        replayed: false,
      };
      responsesByRequestId.set(body.requestId, response);

      if (options.loseResponseAt === attemptIndex && !lostResponse) {
        lostResponse = true;
        throw new TypeError("응답 연결이 끊겼습니다.");
      }
      return Response.json(response);
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
  fireEvent.click(screen.getByRole("button", { name: /확인/ }));
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
  it("혼자 모드는 질문과 답변 세 묶음을 서버에 저장하고 5점을 받는다", async () => {
    const fetchMock = await startStory("solo");
    const questions = [
      "첫째 일은 왜 일어났나요?",
      "둘째에는 무엇을 찾았나요?",
      "셋째에는 어떻게 해결했나요?",
    ];

    for (let index = 0; index < questions.length; index += 1) {
      await submitStoryQuestion(questions[index]);
      expect(screen.queryByText("이야기 주사위 끝!")).not.toBeInTheDocument();
      await submitStoryAnswer(`${index + 1}번째 대답이에요.`);
    }

    expect(screen.getByText("이야기 주사위 끝!")).toBeVisible();
    expect(screen.getByText(/대답 3개/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("+5점 적립!");
    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(actionBodies.filter((body) => body.action === "story-dice-submit-question")).toHaveLength(3);
    expect(actionBodies.filter((body) => body.action === "story-dice-submit-answer")).toEqual(
      questions.map((question, index) => expect.objectContaining({
        action: "story-dice-submit-answer",
        question,
        story: "서버 해적이 서버 미래도시에서 서버 비밀지도를 찾았어요.",
        answer: `${index + 1}번째 대답이에요.`,
      })),
    );
  });

  it("인공지능 모드는 서버 질문과 답변 세 묶음을 마치고 9점을 받는다", async () => {
    const fetchMock = await startStory("ai");

    for (let index = 0; index < 3; index += 1) {
      expect(screen.getByText(
        `인공지능 질문 ${index + 1}: 다음에는 어떤 일이 있었나요?`,
      )).toBeVisible();
      await submitStoryAnswer(`${index + 1}번째 인공지능 놀이 대답이에요.`);
      if (index < 2) {
        await advance(400);
        await flushPromises();
      }
    }

    expect(screen.getByText("이야기 주사위 끝!")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("+9점 적립!");
    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(actionBodies.filter(
      (body) => body.action === "story-dice-record-ai-question",
    )).toHaveLength(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ai-turn"))).toHaveLength(3);
  });

  it("서버가 내려준 단어 목록과 굴림 결과를 그대로 사용한다", async () => {
    const fetchMock = installStoryDiceRunServer("solo");
    renderLocalGame("story-dice", StoryDiceGame);
    await flushPromises();

    expect(screen.getByText(/서버 로봇/)).toBeVisible();
    expect(screen.getByText(/서버 학교/)).toBeVisible();
    expect(screen.getByText(/서버 보물상자/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /주사위 3개 굴리기/ }));
    await flushPromises();
    await advance(1500);

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("서버 해적"),
    );
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("서버 미래도시"),
    );
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("서버 비밀지도"),
    );
    const rollRequest = fetchMock.mock.calls.find(([, init]) => (
      init?.body && JSON.parse(String(init.body)).action === "story-dice-roll"
    ));
    expect(rollRequest).toBeDefined();
  });

  it("질문 형식이 아닌 문장은 서버에 보내지 않고 입력값과 안내를 유지한다", async () => {
    const fetchMock = await startStory("solo");

    await submitStoryQuestion("이 문장은 질문 형식이 아닙니다.");

    expect(screen.getByText("질문하는 문장으로 작성해 주세요.")).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue("이 문장은 질문 형식이 아닙니다.");
    const questionRequests = fetchMock.mock.calls.filter(([, init]) => (
      init?.body && JSON.parse(String(init.body)).action === "story-dice-submit-question"
    ));
    expect(questionRequests).toHaveLength(0);
  });

  it("마지막 답변 정산 응답이 유실되어도 서버 결과를 읽어 완료와 포인트를 복구한다", async () => {
    const fetchMock = await startStory("solo", { loseFinalAnswerResponse: true });

    for (let index = 0; index < 3; index += 1) {
      await submitStoryQuestion(`${index + 1}번째에는 무슨 일이 있었나요?`);
      await submitStoryAnswer(`${index + 1}번째 일을 설명하는 대답이에요.`);
    }
    await flushPromises();

    expect(screen.getByText("이야기 주사위 끝!")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("+5점 적립!");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result"))).toHaveLength(1);
    const finalAnswerRequests = fetchMock.mock.calls.filter(([, init]) => (
      init?.body && JSON.parse(String(init.body)).action === "story-dice-submit-answer"
    ));
    expect(finalAnswerRequests).toHaveLength(3);
  });

  it("인공지능 질문 발급 응답이 유실되면 같은 요청 식별값으로 같은 증명을 다시 받는다", async () => {
    const fetchMock = await startStory("ai", { loseFirstAiIssueResponse: true });
    const question = "인공지능 질문 1: 다음에는 어떤 일이 있었나요?";

    expect(screen.getByRole("alert")).toHaveTextContent(
      "인공지능 질문 발급 응답 연결이 끊겼습니다.",
    );
    const firstIssueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(firstIssueBodies).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "인공지능 질문 다시 만들기" }));
    await flushPromises();

    const issueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(issueBodies).toHaveLength(2);
    expect(issueBodies[1].requestId).toBe(issueBodies[0].requestId);
    const recordBodies = fetchMock.mock.calls
      .filter(([, init]) => (
        init?.body &&
        JSON.parse(String(init.body)).action === "story-dice-record-ai-question"
      ))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(recordBodies).toHaveLength(1);
    expect(recordBodies[0]).toMatchObject({
      generationRequestId: issueBodies[0].requestId,
      output: question,
      proof: "story-proof-1",
    });
    expect(screen.getAllByText(question)).toHaveLength(1);
    expect(screen.getByPlaceholderText(
      "질문에 어울리는 짧은 대답을 한 문장으로 해보세요...",
    )).toBeVisible();
  });

  it("인공지능 질문 기록 응답이 유실되면 결과 조회로 다음 대답 단계를 복구한다", async () => {
    const fetchMock = await startStory("ai", { loseFirstAiRecordResponse: true });
    const question = "인공지능 질문 1: 다음에는 어떤 일이 있었나요?";
    const issueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    const recordBodies = fetchMock.mock.calls
      .filter(([, init]) => (
        init?.body &&
        JSON.parse(String(init.body)).action === "story-dice-record-ai-question"
      ))
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(issueBodies).toHaveLength(1);
    expect(recordBodies).toHaveLength(1);
    expect(recordBodies[0].generationRequestId).toBe(issueBodies[0].requestId);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result")))
      .toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByText(question)).toHaveLength(1);
    expect(screen.getByPlaceholderText(
      "질문에 어울리는 짧은 대답을 한 문장으로 해보세요...",
    )).toBeVisible();
  });
});

describe("질문 주사위 지역 목표", () => {
  it.each([
    [
      "혼자 모드의 인공지능 질문 수",
      diceRunSnapshot("dice-invalid-solo-count", "solo", 3, 1, 1, "STUDENT_ROLL", null),
    ],
    [
      "인공지능 모드의 차례 수",
      diceRunSnapshot("dice-invalid-ai-count", "ai", 3, 0, 1, "STUDENT_ROLL", null),
    ],
    [
      "완료 단계와 정산 상태",
      diceRunSnapshot("dice-invalid-complete", "solo", 7, 3, 0, "COMPLETE", null, "ACTIVE"),
    ],
    [
      "허용되지 않은 상태",
      diceRunSnapshot("dice-invalid-status", "solo", 1, 0, 0, "STUDENT_ROLL", null, "PAUSED"),
    ],
  ])("%s가 맞지 않는 실행 응답을 열지 않는다", async (_case, invalidRun) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/question-games/runs") {
        return Response.json({ run: invalidRun }, { status: 201 });
      }
      return Response.json({ error: "등록되면 안 되는 요청" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderLocalGame("dice", DiceGame, invalidRun.mode === "AI" ? "ai" : "solo");

    fireEvent.click(screen.getByRole("button", { name: /주사위.*굴리기/ }));
    await flushPromises();

    expect(screen.getByRole("alert")).toHaveTextContent("실행 정보를 확인할 수 없습니다");
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("굴림 응답이 유실된 뒤 실행이 그대로면 목록 이동을 막는다", async () => {
    const onBack = vi.fn();
    const initialRun = diceRunSnapshot(
      "dice-uncertain-roll",
      "solo",
      1,
      0,
      0,
      "STUDENT_ROLL",
      null,
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return Response.json({ run: initialRun }, { status: 201 });
      }
      if (url.endsWith("/actions") && body.action === "dice-roll") {
        throw new TypeError("굴림 응답 끊김");
      }
      if (url.endsWith("/result")) {
        return Response.json({ run: initialRun, result: null });
      }
      return Response.json({ error: "알 수 없는 요청" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderLocalGame("dice", DiceGame, "solo", onBack);

    fireEvent.click(screen.getByRole("button", { name: /주사위.*굴리기/ }));
    await flushPromises();
    await flushPromises();

    expect(screen.getByRole("alert")).toHaveTextContent("굴림 응답 끊김");
    const back = screen.getByRole("button", { name: /목록/ });
    expect(back).toBeDisabled();
    fireEvent.click(back);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("인공지능 모드의 학생 질문 뒤 다음 단계가 틀리면 화면 차례로 반영하지 않는다", async () => {
    const runId = "dice-invalid-question-step";
    let rolled = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return Response.json({
          run: diceRunSnapshot(runId, "ai", 1, 0, 0, "STUDENT_ROLL", null),
        }, { status: 201 });
      }
      if (url.endsWith("/actions") && body.action === "dice-roll") {
        rolled = true;
        return Response.json({
          run: diceRunSnapshot(
            runId,
            "ai",
            2,
            0,
            0,
            "STUDENT_QUESTION",
            { actor: "STUDENT", face: 4 },
          ),
        });
      }
      if (url.endsWith("/actions") && body.action === "dice-submit-question") {
        return Response.json({
          run: diceRunSnapshot(runId, "ai", 3, 1, 0, "STUDENT_ROLL", null),
        });
      }
      if (url.endsWith("/result") && rolled) {
        return Response.json({
          run: diceRunSnapshot(runId, "ai", 3, 1, 0, "STUDENT_ROLL", null),
          result: null,
        });
      }
      return Response.json({ error: "알 수 없는 요청" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderLocalGame("dice", DiceGame, "ai");

    await rollQuestionDice();
    await submitDiceQuestion("다음 차례를 확인하는 질문인가요?");
    await flushPromises();

    expect(screen.getByRole("alert")).toHaveTextContent("질문 저장 결과를 확인할 수 없습니다");
    expect(screen.queryByText("다음 차례를 확인하는 질문인가요?", { selector: "p" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });

  it.each(["solo", "ai"] as const)(
    "%s 모드는 굴림 뒤 질문을 내기 전 다시 굴릴 수 없다",
    async (mode) => {
      installDiceRunServer(mode);
      renderLocalGame("dice", DiceGame, mode);

      await rollQuestionDice();

      expect(screen.getByRole("textbox")).toBeVisible();
      expect(screen.queryByRole("button", { name: /다시 굴리기/ }))
        .not.toBeInTheDocument();
    },
  );

  it("혼자 모드는 학생 질문 셋째 제출 직후 결과로 간다", async () => {
    installDiceRunServer("solo");
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
    expect(screen.getByText("+5점 적립!")).toBeVisible();
  });

  it("학생 질문 뒤 인공지능이 주사위를 자동으로 굴리고 질문한 뒤 학생 질문 셋에서 끝난다", async () => {
    const fetchMock = installDiceRunServer("ai");
    aiMocks.ask.mockResolvedValue({ text: "질문을 잘 만들었어요." });
    renderLocalGame("dice", DiceGame, "ai");

    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");
    expect(screen.queryByRole("button", { name: /주사위.*굴리기/ })).not.toBeInTheDocument();
    expect(screen.getByText("인공지능이 주사위를 준비하고 있어요...")).toBeVisible();
    await advance(2100);
    await flushPromises();
    expect(screen.getByText("인공지능 예시 질문 1은 무엇인가요?")).toBeVisible();
    expect(screen.getByText(/민준.*🎲/)).toBeVisible();

    await rollQuestionDice();
    await submitDiceQuestion("둘째 학생 질문은 무엇인가요?");
    await advance(2100);
    await flushPromises();
    expect(screen.getByText("인공지능 예시 질문 2은 무엇인가요?")).toBeVisible();

    await rollQuestionDice();
    await submitDiceQuestion("셋째 학생 질문은 무엇인가요?");

    expect(screen.getByRole("button", { name: /다른 놀이 하러 가기/ })).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ai-turn"))).toHaveLength(2);
    expect(screen.getByText("+9점 적립!")).toBeVisible();
  });

  it("인공지능 질문 발급이 실패하면 같은 차례를 다시 시도한다", async () => {
    installDiceRunServer("ai", { failFirstAiTurn: true });
    renderLocalGame("dice", DiceGame, "ai");
    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");
    await advance(2100);
    await flushPromises();

    expect(screen.getByRole("button", { name: /인공지능 질문 다시 만들기/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /인공지능 질문 다시 만들기/ }));
    await flushPromises();

    expect(screen.getByText("인공지능 예시 질문 1은 무엇인가요?")).toBeVisible();
    expect(screen.getByText(/민준.*🎲/)).toBeVisible();
    expect(screen.getByRole("button", { name: /주사위.*굴리기/ })).toBeEnabled();
  });

  it("인공지능 자동 굴리기가 실패하면 반복 요청하지 않고 직접 다시 시도한다", async () => {
    const fetchMock = installDiceRunServer("ai", { failFirstAiRoll: true });
    renderLocalGame("dice", DiceGame, "ai");
    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");

    await advance(800);
    await flushPromises();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "인공지능 주사위 응답이 지연되고 있습니다",
    );
    expect(screen.getByRole("button", { name: "인공지능 주사위 다시 굴리기" }))
      .toBeVisible();

    await advance(5000);
    const rollRequestsBeforeRetry = fetchMock.mock.calls.filter(([, init]) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return body.action === "dice-roll";
    });
    expect(rollRequestsBeforeRetry).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "인공지능 주사위 다시 굴리기" }));
    await advance(1600);
    await flushPromises();
    expect(screen.getByText("인공지능 예시 질문 1은 무엇인가요?")).toBeVisible();
  });

  it("셋째 학생 질문은 끝나지 않는 피드백을 기다리지 않고 바로 끝난다", async () => {
    installDiceRunServer("ai");
    const pendingFeedback = deferred<{ text: string } | null>();
    let feedbackCalls = 0;
    aiMocks.ask.mockImplementation(() => {
      feedbackCalls += 1;
      return feedbackCalls === 1
        ? Promise.resolve({ text: "질문을 잘 만들었어요." })
        : pendingFeedback.promise;
    });
    renderLocalGame("dice", DiceGame, "ai");

    await rollQuestionDice();
    await submitDiceQuestion("첫째 학생 질문은 무엇인가요?");
    await advance(2100);
    await flushPromises();
    await rollQuestionDice();
    await submitDiceQuestion("둘째 학생 질문은 무엇인가요?");
    await advance(2100);
    await flushPromises();
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
  it("혼자 모드는 서버의 혼합 판정으로 열 번을 마치고 정답 수에 맞춰 적립한다", async () => {
    const judgements = [true, false, true, true, false, true, false, true, true, false];
    installKabaRunServer("solo", { judgements });
    renderLocalGame("kaba", KabaGame, "solo");
    await flushPromises();

    for (let index = 0; index < 10; index += 1) {
      await submitKaba(`${index + 1}번째로 바꾼 문장인가요?`);
      expect(screen.getByText(judgements[index] ? "잘했어요!" : "다시 해봐요!")).toBeVisible();
      fireEvent.click(screen.getByRole("button", {
        name: index === 9 ? /결과 보기/ : /다음 문장/,
      }));
    }

    expect(screen.getByText("완성!")).toBeVisible();
    expect(screen.getByText("10문제 중 6개 맞혔어요!")).toBeVisible();
    expect(screen.getByText("+8점 적립!")).toBeVisible();
    expect(aiMocks.ask).not.toHaveBeenCalled();
  });

  it("인공지능 모드는 서버가 모두 맞다고 판정한 열 번을 마치고 23점을 적립한다", async () => {
    installKabaRunServer("ai");
    aiMocks.ask.mockResolvedValue({
      text: "판정: 잘했어요\n이유: 질문 형태입니다.\n격려: 계속 이어 가세요.",
    });
    renderLocalGame("kaba", KabaGame, "ai");
    await flushPromises();

    for (let index = 0; index < 10; index += 1) {
      expect(screen.queryByText(/AI의 차례/)).not.toBeInTheDocument();
      await submitKaba(`${index + 1}번째 문장은 질문인가요?`);
      expect(screen.getByText("잘했어요")).toBeVisible();
      fireEvent.click(screen.getByRole("button", {
        name: index === 9 ? /결과 보기/ : /다음 문장/,
      }));
    }

    expect(screen.getByText("완성!")).toBeVisible();
    expect(screen.getByText("10문제 중 10개 맞혔어요!")).toBeVisible();
    expect(screen.getByText("+23점 적립!")).toBeVisible();
    const entries = screen.getAllByTestId("kaba-result-entry");
    expect(entries).toHaveLength(10);
    for (const entry of entries) expect(entry).toHaveAttribute("data-player-name", "민준");
    expect(aiMocks.ask).toHaveBeenCalledTimes(10);
  });

  it("인공지능 문구가 긍정이어도 서버의 틀린 판정을 뒤집지 않는다", async () => {
    installKabaRunServer("ai", { judgements: [false] });
    aiMocks.ask.mockResolvedValue({
      text: "판정: 잘했어요\n이유: 아주 좋은 질문입니다.\n격려: 잘했어요.",
    });
    renderLocalGame("kaba", KabaGame, "ai");
    await flushPromises();

    await submitKaba("서버가 틀렸다고 판정할 문장인가요?");

    expect(screen.getByText("다시해봐요")).toBeVisible();
    expect(screen.getByText("원문의 대상과 행동 또는 상태를 유지해 질문으로 바꿔 보세요.")).toBeVisible();
    expect(screen.queryByText("잘했어요", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.queryByText("아주 좋은 질문입니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("잘했어요.")).not.toBeInTheDocument();
  });

  it("저장 뒤 응답이 끊겨도 결과 조회로 같은 시도의 서버 판정을 복구한다", async () => {
    const fetchMock = installKabaRunServer("solo", {
      judgements: [true],
      loseResponseAt: 0,
    });
    renderLocalGame("kaba", KabaGame, "solo");
    await flushPromises();

    await submitKaba("응답이 끊겨도 저장된 질문인가요?");

    expect(screen.getByText("잘했어요!")).toBeVisible();
    expect(screen.getByText(/1개 맞힘/)).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result")))
      .toHaveLength(1);
  });

  it("다른 화면 제출로 명시적으로 거절된 시도를 현재 화면의 성공으로 기록하지 않는다", async () => {
    installKabaRunServer("solo", {
      judgements: [true],
      rejectAfterConcurrentAdvanceAt: 0,
    });
    renderLocalGame("kaba", KabaGame, "solo");
    await flushPromises();

    await submitKaba("현재 화면에서 작성한 질문인가요?");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "질문놀이 상태가 다른 화면에서 변경되었습니다.",
    );
    expect(screen.queryByText("잘했어요!")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("kaba-result-entry")).toHaveLength(0);
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
