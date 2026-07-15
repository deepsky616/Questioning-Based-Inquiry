// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomMemory from "@/app/(student)/student-question-play/games/RoomMemory";
import MemoryGame from "@/app/(student)/student-question-play/games/MemoryGame";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
  type RoomCommandResult,
} from "@/lib/question-games-data";
import {
  createMemoryState,
  readMemoryState,
  type MemoryRoomState,
} from "@/lib/question-game-room-engines/memory";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "host", name: "방장", role: "STUDENT" } },
    status: "authenticated",
  }),
}));

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));
const awardMocks = vi.hoisted(() => ({
  award: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false }),
}));

vi.mock("@/app/(student)/student-question-play/games/useSingleAward", () => ({
  useSingleAward: () => ({
    award: awardMocks.award,
    result: null,
    reset: awardMocks.reset,
  }),
  AwardBadge: () => null,
}));

const game = BUILT_IN_GAMES.find((item) => item.id === "memory")!;
const players: GameRoom["players"] = [
  { id: "host", name: "방장", isHost: true, joinedAt: 1 },
  { id: "other", name: "학생", isHost: false, joinedAt: 2 },
];

beforeEach(() => {
  aiMocks.ask.mockReset();
  awardMocks.award.mockReset();
  awardMocks.reset.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRoom(
  state: MemoryRoomState = createMemoryState(),
  overrides: Partial<GameRoom> = {},
): GameRoom {
  return {
    code: "1234",
    gameId: "memory",
    hostId: "host",
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: state as unknown as Record<string, unknown>,
    version: 7,
    createdAt: 10,
    updatedAt: 10,
    playId: "play-1",
    ...overrides,
  };
}

function makeRollingState(
  overrides: Partial<MemoryRoomState> = {},
): MemoryRoomState {
  const pairs = Array.from({ length: 6 }, (_, index) => ({
    id: `pair-${index}`,
    question: `질문 ${index + 1}`,
    answer: `대답 ${index + 1}`,
  }));
  const state: MemoryRoomState = {
    ...createMemoryState(),
    phase: "rolling",
    roundId: "round-1",
    difficulty: "easy",
    pairs,
    qCards: pairs.map((pair, index) => ({
      id: `question-${index}`,
      pairId: pair.id,
      type: "q",
    })),
    aCards: pairs.map((pair, index) => ({
      id: `answer-${index}`,
      pairId: pair.id,
      type: "a",
    })),
    scores: { host: 0, other: 0 },
    maxAttempts: 18,
    ...overrides,
  };
  expect(readMemoryState(state)).not.toBeNull();
  return state;
}

function makePlayState(
  overrides: Partial<MemoryRoomState> = {},
): MemoryRoomState {
  const state: MemoryRoomState = {
    ...makeRollingState(),
    phase: "play",
    diceRolls: { host: 6, other: 4 },
    turnOrder: ["host", "other"],
    ...overrides,
  };
  expect(readMemoryState(state)).not.toBeNull();
  return state;
}

function makeMissState(
  revealId = "reveal-1",
  overrides: Partial<MemoryRoomState> = {},
): MemoryRoomState {
  return makePlayState({
    attempts: 1,
    revealedIds: ["question-0", "answer-1"],
    lastReveal: {
      revealId,
      result: "miss",
      turnPlayerId: "host",
      resolveAt: 9999,
    },
    ...overrides,
  });
}

function makeCompletedState(): MemoryRoomState {
  const playState = makePlayState();
  const state: MemoryRoomState = {
    ...playState,
    phase: "done",
    endReason: "completed",
    takenIds: [
      ...playState.qCards.map(({ id }) => id),
      ...playState.aCards.map(({ id }) => id),
    ],
    revealedIds: [],
    scores: { host: playState.pairs.length, other: 0 },
    attempts: playState.pairs.length,
    lastReveal: {
      revealId: "reveal-completed",
      result: "match",
      turnPlayerId: "host",
      resolveAt: 9999,
    },
  };
  expect(readMemoryState(state)).not.toBeNull();
  return state;
}

function makeProps(
  room: GameRoom,
  onAction: RoomActionHandler,
  myId = "host",
  actionLoading = false,
) {
  return {
    game,
    room,
    myId,
    actionLoading,
    onAction,
    onLeave: vi.fn(),
  };
}

function success(
  room: GameRoom,
  result?: RoomCommandResult,
): RoomActionResult {
  return { ok: true, room, ...(result ? { result } : {}) };
}

function failure(room: GameRoom): RoomActionResult {
  return { ok: false, room, status: 409, reason: "conflict" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function generatedPairs(count: number) {
  return {
    text: JSON.stringify(
      Array.from({ length: count }, (_, index) => ({
        question: {
          ko: `질문 ${index + 1}`,
          en: `Question ${index + 1}`,
        },
        answer: {
          ko: `대답 ${index + 1}`,
          en: `Answer ${index + 1}`,
        },
      })),
    ),
  };
}

function generatedLocalPairs(count: number) {
  return {
    text: JSON.stringify(
      Array.from({ length: count }, (_, index) => ({
        question: `질문 ${index + 1}`,
        answer: `대답 ${index + 1}`,
      })),
    ),
  };
}

function stubCommandIds(...ids: string[]) {
  let index = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => ids[index++] ?? ids.at(-1) ?? "command-id"),
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("메모리 준비와 주사위 서버 명령", () => {
  it("준비 자료만 생성해 memory-prepare 한 번을 보낸다", async () => {
    const room = makeRoom();
    const preparedRoom = makeRoom(makeRollingState(), { version: 8 });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(preparedRoom));
    aiMocks.ask.mockResolvedValue(generatedPairs(6));
    stubCommandIds("00000000-0000-4000-8000-000000000101");

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(
      "memory-prepare",
      {
        playId: "play-1",
        difficulty: "easy",
        pairs: expect.arrayContaining([
          expect.objectContaining({
            question: "질문 1",
            answer: "대답 1",
          }),
        ]),
      },
      { commandId: "00000000-0000-4000-8000-000000000101" },
    );
    const body = onAction.mock.calls[0]?.[1];
    expect(body).not.toHaveProperty("roundId");
    expect(body).not.toHaveProperty("qCards");
    expect(body).not.toHaveProperty("aCards");
    expect(body).not.toHaveProperty("turnOrder");
    expect(body).not.toHaveProperty("diceRolls");
    expect((body?.pairs as Array<Record<string, unknown>>)[0]).not.toHaveProperty("id");
  });

  it("준비 자료를 만드는 동안 대기 상태를 보이고 중복 요청을 막는다", async () => {
    let resolveAsk!: (value: ReturnType<typeof generatedPairs>) => void;
    const pendingAsk = new Promise<ReturnType<typeof generatedPairs>>((resolve) => {
      resolveAsk = resolve;
    });
    aiMocks.ask.mockReturnValue(pendingAsk);
    const room = makeRoom();
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(makeRoom(makeRollingState())));
    stubCommandIds("00000000-0000-4000-8000-000000000102");

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

    expect(screen.getByText("카드 만드는 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /쉬움/ })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();

    await act(async () => {
      resolveAsk(generatedPairs(6));
      await pendingAsk;
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("주사윗값을 만들지 않고 현재 라운드의 memory-roll만 보낸다", async () => {
    const room = makeRoom(makeRollingState());
    const rolledRoom = makeRoom(
      makeRollingState({ diceRolls: { host: 4 } }),
      { version: 8 },
    );
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(rolledRoom, { roll: 4 }));
    stubCommandIds("00000000-0000-4000-8000-000000000103");

    const view = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(
      "memory-roll",
      { playId: "play-1", roundId: "round-1" },
      { commandId: "00000000-0000-4000-8000-000000000103" },
    );
    expect(screen.queryByText("4")).not.toBeInTheDocument();

    view.rerender(<RoomMemory {...makeProps(rolledRoom, onAction)} />);
    expect(screen.getByText("내 주사위").parentElement).toHaveTextContent("4");
  });
});

describe("메모리 카드 서버 명령과 화면 상태", () => {
  it("서버가 공개한 카드 상태에 맞춰 memory-flip만 보낸다", async () => {
    const room = makeRoom(makePlayState());
    const questionRoom = makeRoom(
      makePlayState({ revealedIds: ["question-0"] }),
      { version: 8 },
    );
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(questionRoom));
    stubCommandIds(
      "00000000-0000-4000-8000-000000000201",
      "00000000-0000-4000-8000-000000000202",
    );

    const view = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: "질문 카드 1" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    expect(onAction).toHaveBeenNthCalledWith(
      1,
      "memory-flip",
      { playId: "play-1", roundId: "round-1", cardId: "question-0" },
      { commandId: "00000000-0000-4000-8000-000000000201" },
    );
    expect(screen.getByRole("button", { name: "대답 카드 1" })).toBeDisabled();

    view.rerender(<RoomMemory {...makeProps(questionRoom, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: "대답 카드 2" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));

    expect(onAction).toHaveBeenNthCalledWith(
      2,
      "memory-flip",
      { playId: "play-1", roundId: "round-1", cardId: "answer-1" },
      { commandId: "00000000-0000-4000-8000-000000000202" },
    );
  });

  it("현재 차례와 시도 수를 보이고 다른 참가자 입력을 막는다", () => {
    const room = makeRoom(makePlayState());
    const onAction = vi.fn<RoomActionHandler>();

    render(<RoomMemory {...makeProps(room, onAction, "other")} />);

    expect(screen.getByText(/방장의 차례/)).toBeInTheDocument();
    expect(screen.getByText("시도 0/18")).toBeInTheDocument();
    expect(screen.getByText("내 차례를 기다리는 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 카드 1" })).toBeDisabled();
  });

  it("요청 처리와 실패 공개 및 획득 카드 상태를 분명히 보인다", () => {
    const onAction = vi.fn<RoomActionHandler>();
    const loadingRoom = makeRoom(makePlayState());
    const first = render(
      <RoomMemory {...makeProps(loadingRoom, onAction, "host", true)} />,
    );
    expect(screen.getByText("요청 처리 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 카드 1" })).toBeDisabled();
    first.unmount();

    const missRoom = makeRoom(makeMissState());
    const second = render(<RoomMemory {...makeProps(missRoom, onAction)} />);
    expect(screen.getByText("카드를 다시 덮는 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 카드 2" })).toBeDisabled();
    second.unmount();

    const takenRoom = makeRoom(makePlayState({
      attempts: 1,
      takenIds: ["question-0", "answer-0"],
      scores: { host: 1, other: 0 },
      lastReveal: {
        revealId: "match-1",
        result: "match",
        turnPlayerId: "host",
        resolveAt: 0,
      },
    }));
    render(<RoomMemory {...makeProps(takenRoom, onAction)} />);
    const taken = screen.getByRole("button", {
      name: "획득한 질문 카드: 질문 1",
    });
    expect(taken).toBeDisabled();
    expect(taken).toHaveTextContent("질문 1");
  });

  it("손상된 버전 2 상태는 그리거나 명령을 보내지 않는다", () => {
    const room = {
      ...makeRoom(),
      gameState: {
        stateVersion: 2,
        game: "memory",
        phase: "play",
      },
    };
    const onAction = vi.fn<RoomActionHandler>();

    render(<RoomMemory {...makeProps(room, onAction)} />);

    expect(screen.getAllByText(/준비 중/).length).toBeGreaterThan(0);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("실패 공개 복원", () => {
  it("모든 참가자가 같은 공개를 한 효과로 복원하고 서버 대기값 뒤 다시 보낸다", async () => {
    vi.useFakeTimers();
    const room = makeRoom(makeMissState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValueOnce(success(room, { retryAfterMs: 1200 }))
      .mockResolvedValue(success(room));
    stubCommandIds("00000000-0000-4000-8000-000000000301");

    const view = render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      "memory-resolve-miss",
      { playId: "play-1", roundId: "round-1", revealId: "reveal-1" },
      { commandId: "00000000-0000-4000-8000-000000000301" },
    );

    view.rerender(
      <RoomMemory
        {...makeProps({
          ...room,
          gameState: { ...room.gameState },
        }, onAction, "other")}
      />,
    );
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1199);
    });
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0]);
  });

  it("큰 서버 대기값은 복원 대기 상한까지만 기다린다", async () => {
    vi.useFakeTimers();
    const room = makeRoom(makeMissState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValueOnce(success(room, { retryAfterMs: 3200 }))
      .mockResolvedValue(success(room));
    stubCommandIds("00000000-0000-4000-8000-000000000305");

    render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2499);
    });
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0]);
  });

  it("실패 뒤 같은 공개의 높은 버전이 오면 같은 명령으로 복원을 재개한다", async () => {
    const room = makeRoom(makeMissState());
    const nextRoom = makeRoom(makeMissState(), { version: 8 });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValueOnce(failure(nextRoom))
      .mockResolvedValue(success(nextRoom));
    stubCommandIds("00000000-0000-4000-8000-000000000306");

    const view = render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    view.rerender(
      <RoomMemory
        {...makeProps({
          ...room,
          gameState: { ...room.gameState },
        }, onAction, "other")}
      />,
    );
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    view.rerender(<RoomMemory {...makeProps(nextRoom, onAction, "other")} />);
    await flushEffects();

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0]);
  });

  it("높은 버전이 요청 실패보다 먼저 와도 실패 뒤 같은 명령으로 재개한다", async () => {
    const room = makeRoom(makeMissState());
    const nextRoom = makeRoom(makeMissState(), { version: 8 });
    const firstRequest = deferred<RoomActionResult>();
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValue(success(nextRoom));
    stubCommandIds("00000000-0000-4000-8000-000000000307");

    const view = render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    view.rerender(<RoomMemory {...makeProps(nextRoom, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    firstRequest.resolve(failure(nextRoom));
    await flushEffects();

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0]);
  });

  it("네트워크 예외 뒤 같은 공개의 높은 버전이 오면 복원을 재개한다", async () => {
    const room = makeRoom(makeMissState());
    const nextRoom = makeRoom(makeMissState(), { version: 8 });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(success(nextRoom));
    stubCommandIds("00000000-0000-4000-8000-000000000308");

    const view = render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    view.rerender(<RoomMemory {...makeProps(nextRoom, onAction, "other")} />);
    await flushEffects();

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0]);
  });

  it("정상 재시도 대기 중 버전이 올라가도 타이머를 다시 시작하지 않는다", async () => {
    vi.useFakeTimers();
    const room = makeRoom(makeMissState());
    const nextRoom = makeRoom(makeMissState(), { version: 8 });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValueOnce(success(room, { retryAfterMs: 1200 }))
      .mockResolvedValue(success(nextRoom));
    stubCommandIds("00000000-0000-4000-8000-000000000309");

    const view = render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    view.rerender(<RoomMemory {...makeProps(nextRoom, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[1]).toEqual(onAction.mock.calls[0]);
  });

  it.each([
    ["없음", undefined],
    ["음수", -1],
    ["소수", 1.5],
  ])("%s 서버 대기값은 반복 복원 요청을 만들지 않는다", async (_kind, retryAfterMs) => {
    vi.useFakeTimers();
    const room = makeRoom(makeMissState());
    const result = retryAfterMs === undefined ? undefined : { retryAfterMs };
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room, result));
    stubCommandIds("00000000-0000-4000-8000-000000000302");

    render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("공개가 해소되면 예약 요청을 취소하고 새 공개에는 새 효과를 만든다", async () => {
    vi.useFakeTimers();
    const room = makeRoom(makeMissState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValueOnce(success(room, { retryAfterMs: 1200 }))
      .mockResolvedValue(success(room));
    stubCommandIds(
      "00000000-0000-4000-8000-000000000303",
      "00000000-0000-4000-8000-000000000304",
    );

    const view = render(<RoomMemory {...makeProps(room, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    const clearRoom = makeRoom(makePlayState(), { version: 8 });
    view.rerender(<RoomMemory {...makeProps(clearRoom, onAction, "other")} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(onAction).toHaveBeenCalledTimes(1);

    const nextRoom = makeRoom(makeMissState("reveal-2"), { version: 9 });
    view.rerender(<RoomMemory {...makeProps(nextRoom, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith(
      "memory-resolve-miss",
      { playId: "play-1", roundId: "round-1", revealId: "reveal-2" },
      { commandId: "00000000-0000-4000-8000-000000000304" },
    );
  });

  it("실행 수명이 바뀌면 옛 지연 응답을 버리고 새 명령으로 시작한다", async () => {
    vi.useFakeTimers();
    const oldRoom = makeRoom(makeMissState());
    const newRoom = makeRoom(
      makeMissState("reveal-1", { roundId: "round-2" }),
      { createdAt: 20, updatedAt: 20, version: 1, playId: "play-2" },
    );
    const oldRequest = deferred<RoomActionResult>();
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValue(success(newRoom));
    stubCommandIds(
      "00000000-0000-4000-8000-000000000310",
      "00000000-0000-4000-8000-000000000311",
    );

    const view = render(<RoomMemory {...makeProps(oldRoom, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(1);

    view.rerender(<RoomMemory {...makeProps(newRoom, onAction, "other")} />);
    await flushEffects();
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith(
      "memory-resolve-miss",
      { playId: "play-2", roundId: "round-2", revealId: "reveal-1" },
      { commandId: "00000000-0000-4000-8000-000000000311" },
    );

    oldRequest.resolve(success(oldRoom, { retryAfterMs: 1200 }));
    await flushEffects();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(onAction).toHaveBeenCalledTimes(2);
  });
});

describe("RoomMemory 결과 흐름", () => {
  it("방장은 엄격한 완료 결과에서 대기실 다시 시작을 보존한다", async () => {
    const completedState = makeCompletedState();
    expect(readMemoryState(completedState)).toEqual(completedState);
    const room = makeRoom(completedState, { status: "ended" });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "not-ready" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )));

    render(<RoomMemory {...makeProps(room, onAction)} />);

    const returnButton = await screen.findByRole("button", { name: /대기실/ });
    fireEvent.click(returnButton);
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith("restart");
    });
  });
});

describe("RoomMemory 명령 소스 경계", () => {
  it("허용한 네 서버 명령 밖의 지역 판정 경로가 없다", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/(student)/student-question-play/games/RoomMemory.tsx",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\bset-state\b|\bupdate-state\b/);
    expect(source).not.toMatch(/Math\.random|Date\.now/);
    const actions = [
      ...source.matchAll(/(?:onAction|onActionRef\.current)\(\s*["']([^"']+)["']/g),
    ]
      .map((match) => match[1]);
    expect(new Set(actions)).toEqual(new Set([
      "memory-prepare",
      "memory-roll",
      "memory-flip",
      "memory-resolve-miss",
    ]));
  });
});

async function startLocalMemory(difficulty: "쉬움" | "보통" | "어려움") {
  const pairCount = difficulty === "쉬움" ? 6 : difficulty === "보통" ? 10 : 15;
  aiMocks.ask.mockResolvedValue(generatedLocalPairs(pairCount));
  vi.spyOn(Math, "random").mockReturnValue(0);
  render(
    <MemoryGame
      game={game}
      onBack={vi.fn()}
      config={{ mode: "solo", players: ["학생"] }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(difficulty) }));
  await screen.findByText("💧 질문 카드 (파란색)");
}

function localQuestionCards() {
  const section = screen.getByText("💧 질문 카드 (파란색)").parentElement;
  if (!section) throw new Error("질문 카드 영역이 없습니다");
  return within(section).getAllByRole("button");
}

function localAnswerCards() {
  const section = screen.getByText("⭐ 대답 카드 (노란색)").parentElement;
  if (!section) throw new Error("대답 카드 영역이 없습니다");
  return within(section).getAllByRole("button");
}

function chooseLocalPair(questionIndex: number, answerIndex: number) {
  fireEvent.click(localQuestionCards()[questionIndex]);
  fireEvent.click(localAnswerCards()[answerIndex]);
}

describe("지역 메모리 최대 시도", () => {
  it.each([
    ["쉬움", 18],
    ["보통", 30],
    ["어려움", 45],
  ] as const)("%s은 공통 규칙의 최대 시도 %s를 보인다", async (difficulty, max) => {
    await startLocalMemory(difficulty);
    expect(screen.getByText(new RegExp(`시도 0/${max}`))).toBeInTheDocument();
  });

  it("획득 카드 글자를 흐리지 않고 카드 영역에 화면 주제 색을 쓴다", async () => {
    await startLocalMemory("쉬움");
    vi.useFakeTimers();

    const questionSection = screen.getByText("💧 질문 카드 (파란색)").parentElement;
    const answerSection = screen.getByText("⭐ 대답 카드 (노란색)").parentElement;
    expect(questionSection).toHaveClass("bg-card", "text-card-foreground");
    expect(answerSection).toHaveClass("bg-card", "text-card-foreground");

    chooseLocalPair(0, 0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(localQuestionCards()[0]).not.toHaveStyle({ opacity: "0.3" });
    expect(localAnswerCards()[0]).not.toHaveStyle({ opacity: "0.3" });
    expect(localQuestionCards()[0].className).toContain("dark:");
    expect(localAnswerCards()[0].className).toContain("dark:");
  });

  it("마지막 허용 실패를 보여 준 뒤 결과로 이동하고 완료로 적립한다", async () => {
    await startLocalMemory("쉬움");
    vi.useFakeTimers();

    for (let attempt = 1; attempt <= 18; attempt += 1) {
      chooseLocalPair(0, 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1800);
      });
    }

    expect(screen.getByText("짝 찾기 완성!")).toBeInTheDocument();
    expect(awardMocks.award).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "memory",
      mode: "solo",
      completed: true,
    }));
  });

  it("마지막 허용 성공 뒤 짝이 남아도 결과로 이동한다", async () => {
    await startLocalMemory("쉬움");
    vi.useFakeTimers();

    for (let attempt = 1; attempt < 18; attempt += 1) {
      chooseLocalPair(0, 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1800);
      });
    }
    chooseLocalPair(0, 0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText("짝 찾기 완성!")).toBeInTheDocument();
    expect(awardMocks.award).toHaveBeenCalledTimes(1);
    expect(awardMocks.award).toHaveBeenCalledWith({
      mode: "solo",
      gameId: "memory",
      validQuestions: 1,
      completed: true,
    });
  });

  it("모든 짝을 찾으면 최대 시도 전에 결과로 이동한다", async () => {
    await startLocalMemory("쉬움");
    vi.useFakeTimers();

    for (let index = 0; index < 6; index += 1) {
      chooseLocalPair(index, index);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }

    expect(screen.getByText("짝 찾기 완성!")).toBeInTheDocument();
  });
});
