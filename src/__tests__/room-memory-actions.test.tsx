// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoomMemory from "@/app/(student)/student-question-play/games/RoomMemory";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));
const stateUpdateMocks = vi.hoisted(() => ({
  afterUnmount: false,
  updateAfterUnmount: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useState<T>(initialState: T | (() => T)) {
      const [value, setValue] = actual.useState(initialState);
      const setObservedValue = (nextValue: React.SetStateAction<T>) => {
        if (stateUpdateMocks.afterUnmount) {
          stateUpdateMocks.updateAfterUnmount();
        }
        setValue(nextValue);
      };

      return [value, setObservedValue] as const;
    },
  };
});

vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false }),
}));

const fixedRoundId = "00000000-0000-4000-8000-000000000006";

beforeEach(() => {
  aiMocks.ask.mockReset();
  stateUpdateMocks.afterUnmount = false;
  stateUpdateMocks.updateAfterUnmount.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeMemoryRoom(
  state: Record<string, unknown>,
  players: GameRoom["players"] = [
    { id: "host", name: "방장", isHost: true, joinedAt: 1 },
    { id: "other", name: "학생", isHost: false, joinedAt: 2 },
  ],
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
    gameState: state,
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  };
}

function makeProps(
  room: GameRoom,
  onAction: RoomActionHandler,
  myId = "host",
) {
  return {
    game: BUILT_IN_GAMES.find((item) => item.id === "memory")!,
    room,
    myId,
    actionLoading: false,
    onAction,
    onLeave: vi.fn(),
  };
}

function makeSetupState(): Record<string, unknown> {
  return {
    phase: "setup",
    difficulty: "normal",
    pairs: [],
    qCards: [],
    aCards: [],
    diceRolls: {},
    turnOrder: [],
    currentTurnIdx: 0,
    takenIds: [],
    revealedIds: [],
    scores: {},
  };
}

function makeRollingState(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    phase: "rolling",
    difficulty: "normal",
    pairs: [],
    qCards: [],
    aCards: [],
    diceRolls: {},
    rollRoundId: "round-1",
    turnOrder: [],
    currentTurnIdx: 0,
    takenIds: [],
    revealedIds: [],
    scores: {},
    ...overrides,
  };
}

function conflict(room: GameRoom): RoomActionResult {
  return {
    ok: false,
    room,
    status: 409,
    reason: "conflict",
  };
}

function success(room: GameRoom): RoomActionResult {
  return { ok: true, room };
}

function generatedPairs(count: number) {
  return {
    text: JSON.stringify(
      Array.from({ length: count }, (_, index) => ({
        question: `질문 ${index + 1}`,
        answer: `대답 ${index + 1}`,
      })),
    ),
  };
}

async function finishDiceAnimation() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12 * 80);
  });
}

describe("메모리 카드 생성", () => {
  it("첫 생성 상태 저장이 실패하면 인공지능 생성을 시작하지 않는다", async () => {
    const room = makeMemoryRoom(makeSetupState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(conflict(room));

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(aiMocks.ask).not.toHaveBeenCalled();
  });

  it("첫 생성 상태 저장 실패 뒤 생성 잠금을 풀어 다시 시도한다", async () => {
    const room = makeMemoryRoom(makeSetupState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(conflict(room));

    render(<RoomMemory {...makeProps(room, onAction)} />);
    const difficultyButton = screen.getByRole("button", { name: /쉬움/ });

    fireEvent.click(difficultyButton);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    fireEvent.click(difficultyButton);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
  });

  it("첫 저장과 인공지능 생성이 성공하면 새 라운드로 굴리기 상태를 저장한다", async () => {
    const room = makeMemoryRoom(makeSetupState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));
    aiMocks.ask.mockResolvedValue(generatedPairs(6));
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => fixedRoundId),
    });

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction).toHaveBeenNthCalledWith(1, "update-state", {
      patch: { phase: "generating", difficulty: "easy" },
    });
    expect(aiMocks.ask).toHaveBeenCalledWith({
      action: "memory:pairs",
      context: { count: "6" },
    });
    expect(onAction).toHaveBeenNthCalledWith(
      2,
      "update-state",
      expect.objectContaining({
        patch: expect.objectContaining({
          phase: "rolling",
          rollRoundId: fixedRoundId,
        }),
      }),
      { expectedRoom: { code: "1234", createdAt: 10 } },
    );
  });

  it("인공지능 생성 대기 중 화면을 떠나면 이전 방의 카드를 저장하지 않는다", async () => {
    const room = makeMemoryRoom(makeSetupState());
    let resolveAsk!: (value: ReturnType<typeof generatedPairs>) => void;
    const pendingAsk = new Promise<ReturnType<typeof generatedPairs>>((resolve) => {
      resolveAsk = resolve;
    });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));
    aiMocks.ask.mockReturnValue(pendingAsk);

    const { unmount } = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

    await waitFor(() => expect(aiMocks.ask).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      resolveAsk(generatedPairs(6));
      await pendingAsk;
    });

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["방 코드가", { code: "5678" }],
    ["방 생성 시각이", { createdAt: 20 }],
  ])(
    "인공지능 생성 대기 중 %s 바뀌면 이전 방의 카드를 저장하지 않는다",
    async (_identityPart, roomOverride) => {
      const room = makeMemoryRoom(makeSetupState());
      const nextRoom = { ...makeMemoryRoom(makeSetupState()), ...roomOverride };
      let resolveAsk!: (value: ReturnType<typeof generatedPairs>) => void;
      const pendingAsk = new Promise<ReturnType<typeof generatedPairs>>((resolve) => {
        resolveAsk = resolve;
      });
      const onAction = vi
        .fn<RoomActionHandler>()
        .mockResolvedValue(success(room));
      aiMocks.ask.mockReturnValue(pendingAsk);

      const view = render(<RoomMemory {...makeProps(room, onAction)} />);
      fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

      await waitFor(() => expect(aiMocks.ask).toHaveBeenCalledTimes(1));
      expect(onAction).toHaveBeenCalledTimes(1);
      view.rerender(<RoomMemory {...makeProps(nextRoom, onAction)} />);

      await act(async () => {
        resolveAsk(generatedPairs(6));
        await pendingAsk;
      });

      expect(onAction).toHaveBeenCalledTimes(1);
    },
  );

  it("인공지능 생성 대기 중 같은 방의 버전만 바뀌면 카드를 저장한다", async () => {
    const room = makeMemoryRoom(makeSetupState());
    const nextRoom = { ...makeMemoryRoom(makeSetupState()), version: 2 };
    let resolveAsk!: (value: ReturnType<typeof generatedPairs>) => void;
    const pendingAsk = new Promise<ReturnType<typeof generatedPairs>>((resolve) => {
      resolveAsk = resolve;
    });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));
    aiMocks.ask.mockReturnValue(pendingAsk);

    const view = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));

    await waitFor(() => expect(aiMocks.ask).toHaveBeenCalledTimes(1));
    view.rerender(<RoomMemory {...makeProps(nextRoom, onAction)} />);

    await act(async () => {
      resolveAsk(generatedPairs(6));
      await pendingAsk;
    });

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(
      2,
      "update-state",
      expect.any(Object),
      { expectedRoom: { code: "1234", createdAt: 10 } },
    );
  });
});

describe("메모리 주사위", () => {
  it("애니메이션 뒤 현재 라운드의 참가자별 주사위 명령만 보낸다", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const room = makeMemoryRoom(makeRollingState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
    await finishDiceAnimation();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("memory-roll", {
      roll: 1,
      rollRoundId: "round-1",
    });
  });

  it("주사위 저장 결과가 끝날 때까지 굴리고 서버 결과를 표시한다", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const room = makeMemoryRoom(makeRollingState());
    const savedRoom = makeMemoryRoom(
      makeRollingState({ diceRolls: { host: 4 } }),
    );
    let resolveAction!: (result: RoomActionResult) => void;
    const pendingAction = new Promise<RoomActionResult>((resolve) => {
      resolveAction = resolve;
    });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockReturnValue(pendingAction);

    const view = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
    await finishDiceAnimation();

    expect(
      screen.getByRole("button", { name: /^🎲 [1-6]$/ }),
    ).toBeDisabled();

    await act(async () => {
      resolveAction(success(savedRoom));
      await pendingAction;
    });
    view.rerender(<RoomMemory {...makeProps(savedRoom, onAction)} />);

    expect(screen.getByText("내 주사위").parentElement).toHaveTextContent("4");
    expect(
      screen.queryByRole("button", { name: /주사위 굴리기/ }),
    ).not.toBeInTheDocument();
  });

  it("주사위 애니메이션 중 화면을 떠나면 저장 명령을 보내지 않는다", async () => {
    vi.useFakeTimers();
    const room = makeMemoryRoom(makeRollingState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));

    const { unmount } = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 80);
    });

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 80);
    });

    expect(onAction).not.toHaveBeenCalled();
  });

  it("주사위 저장 대기 중 화면을 떠나면 응답 뒤 상태를 갱신하지 않는다", async () => {
    vi.useFakeTimers();
    const room = makeMemoryRoom(makeRollingState());
    let resolveAction!: (result: RoomActionResult) => void;
    const pendingAction = new Promise<RoomActionResult>((resolve) => {
      resolveAction = resolve;
    });
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockReturnValue(pendingAction);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { unmount } = render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
    await finishDiceAnimation();
    expect(onAction).toHaveBeenCalledTimes(1);

    unmount();
    stateUpdateMocks.afterUnmount = true;
    await act(async () => {
      resolveAction(conflict(room));
      await pendingAction;
    });

    expect(stateUpdateMocks.updateAfterUnmount).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("주사위 저장이 실패하면 지역 결과를 비우고 다시 굴릴 수 있다", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const room = makeMemoryRoom(makeRollingState());
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(conflict(room));

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
    await finishDiceAnimation();

    expect(onAction).toHaveBeenNthCalledWith(1, "memory-roll", {
      roll: expect.any(Number),
      rollRoundId: "round-1",
    });
    const retryButton = screen.getByRole("button", {
      name: /주사위 굴리기/,
    });
    expect(retryButton).toBeEnabled();

    fireEvent.click(retryButton);
    await finishDiceAnimation();
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("서버 방에 내 결과가 있으면 다시 굴리기 단추를 숨긴다", () => {
    const room = makeMemoryRoom(
      makeRollingState({ diceRolls: { host: 6 } }),
    );
    const onAction = vi.fn<RoomActionHandler>();

    render(<RoomMemory {...makeProps(room, onAction)} />);

    expect(
      screen.queryByRole("button", { name: /주사위 굴리기/ }),
    ).not.toBeInTheDocument();
  });

  it("모든 결과가 있어도 방장이 별도 놀이 상태 저장을 보내지 않는다", async () => {
    const room = makeMemoryRoom(
      makeRollingState({ diceRolls: { host: 6, other: 4 } }),
    );
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));

    render(<RoomMemory {...makeProps(room, onAction)} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(onAction).not.toHaveBeenCalled();
  });

  it("라운드 값이 없는 예전 방은 공용 예전 방 값을 보낸다", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const rollingState = makeRollingState();
    delete rollingState.rollRoundId;
    const room = makeMemoryRoom(rollingState);
    const onAction = vi
      .fn<RoomActionHandler>()
      .mockResolvedValue(success(room));

    render(<RoomMemory {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
    await finishDiceAnimation();

    expect(onAction).toHaveBeenCalledWith("memory-roll", {
      roll: expect.any(Number),
      rollRoundId: "legacy:1234:10",
    });
  });
});
