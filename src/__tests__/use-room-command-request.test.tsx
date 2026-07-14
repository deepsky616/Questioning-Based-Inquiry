// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type RoomCommandRequestJsonValue,
  useRoomCommandRequest,
} from "@/app/(student)/student-question-play/games/useRoomCommandRequest";
import type {
  GameRoom,
  RoomActionHandler,
  RoomActionResult,
} from "@/lib/question-games-data";

interface TestState {
  phase: string;
  roundId?: string;
  recentCommandIds: string[];
}

interface HookProps {
  room: GameRoom;
  state: TestState;
  onAction: RoomActionHandler;
  lifetimeParts?: readonly RoomCommandRequestJsonValue[];
  createCommandId: () => string;
}

function readTestState(value: unknown): TestState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (
    typeof state.phase !== "string" ||
    (state.roundId !== undefined && typeof state.roundId !== "string") ||
    !Array.isArray(state.recentCommandIds) ||
    !state.recentCommandIds.every((id) => typeof id === "string")
  ) {
    return null;
  }
  return state as unknown as TestState;
}

const players = [
  { id: "user-1", name: "학생 1", isHost: true, joinedAt: 1 },
  { id: "user-2", name: "학생 2", isHost: false, joinedAt: 2 },
];

const baseState: TestState = {
  phase: "play",
  roundId: "20000000-0000-4000-8000-000000000001",
  recentCommandIds: [],
};

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  const gameState: Record<string, unknown> = overrides.gameState ?? {
    ...baseState,
  };
  return {
    code: "1234",
    gameId: "relay",
    hostId: "user-1",
    status: "playing",
    players,
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    playId: "10000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

function success(room: GameRoom): RoomActionResult {
  return { ok: true, room };
}

function conflict(room: GameRoom): RoomActionResult {
  return { ok: false, room, status: 409, reason: "conflict" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function commandIds() {
  let index = 0;
  return vi.fn(() => {
    index += 1;
    return `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  });
}

function renderRequestHook(initialProps: HookProps) {
  return renderHook(
    (props: HookProps) => useRoomCommandRequest({
      room: props.room,
      gameId: "relay",
      state: props.state,
      readState: readTestState,
      onAction: props.onAction,
      lifetimeParts: props.lifetimeParts,
      createCommandId: props.createCommandId,
    }),
    { initialProps },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useRoomCommandRequest", () => {
  it("엄격 모드의 효과 재실행 뒤에도 요청을 확인한다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    const { result } = renderHook(() => useRoomCommandRequest({
      room,
      gameId: "relay",
      state: baseState,
      readState: readTestState,
      onAction,
      createCommandId: commandIds(),
    }), { reactStrictMode: true });

    await expect(act(() => result.current.send("relay-submit-question", {}, "질문")))
      .resolves.toBe("confirmed");
  });

  it("같은 수명과 값의 재시도는 같은 commandId와 expectedRoom을 쓴다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>()
      .mockResolvedValueOnce(conflict(room))
      .mockResolvedValueOnce(success(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await expect(act(() => result.current.send(
      "relay-submit-question",
      { playId: room.playId, roundId: baseState.roundId, question: "왜 빛날까요?" },
      "왜 빛날까요?",
    ))).resolves.toBe("retryable");
    await expect(act(() => result.current.send(
      "relay-submit-question",
      { playId: room.playId, roundId: baseState.roundId, question: "왜 빛날까요?" },
      "왜 빛날까요?",
    ))).resolves.toBe("confirmed");

    expect(createCommandId).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[0]?.[2]).toEqual({
      commandId: onAction.mock.calls[1]?.[2]?.commandId,
      expectedRoom: { code: room.code, createdAt: room.createdAt },
    });
  });

  it("같은 동작의 본문 값이 바뀌면 새 commandId를 만든다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await act(() => result.current.send("relay-submit-question", { question: "첫 질문?" }, "첫 질문?"));
    await act(() => result.current.send("relay-submit-question", { question: "둘째 질문?" }, "둘째 질문?"));

    expect(createCommandId).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[0]?.[2]?.commandId)
      .not.toBe(onAction.mock.calls[1]?.[2]?.commandId);
  });

  it("같은 동작의 A-B-A 재시도는 최초 A commandId를 다시 쓴다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await act(() => result.current.send("relay-submit-question", {}, "A"));
    await act(() => result.current.send("relay-submit-question", {}, "B"));
    await act(() => result.current.send("relay-submit-question", {}, "A"));

    expect(createCommandId).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[2]?.[2]?.commandId)
      .toBe(onAction.mock.calls[0]?.[2]?.commandId);
    expect(onAction.mock.calls[2]?.[2]?.commandId)
      .not.toBe(onAction.mock.calls[1]?.[2]?.commandId);
  });

  it("폴링 확인은 해당 서명만 지우고 다른 값의 재시도를 보존한다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await act(() => hook.result.current.send("relay-submit-question", {}, "A"));
    const firstId = onAction.mock.calls[0]?.[2]?.commandId;
    await act(() => hook.result.current.send("relay-submit-question", {}, "B"));
    const secondId = onAction.mock.calls[1]?.[2]?.commandId;

    const confirmedState = {
      ...baseState,
      recentCommandIds: [firstId!],
    };
    hook.rerender({
      room: makeRoom({ gameState: confirmedState }),
      state: confirmedState,
      onAction,
      createCommandId,
    });

    await waitFor(() => {
      expect(hook.result.current.acknowledgementVersion).toBe(1);
    });
    await act(() => hook.result.current.send("relay-submit-question", {}, "B"));

    expect(createCommandId).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls[2]?.[2]?.commandId).toBe(secondId);
  });

  it("객체 키 순서가 달라도 같은 JSON 값은 같은 commandId를 다시 쓴다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await act(() => result.current.send(
      "relay-submit-question",
      {},
      { question: "왜?", playerId: "user-1" },
    ));
    await act(() => result.current.send(
      "relay-submit-question",
      {},
      { playerId: "user-1", question: "왜?" },
    ));

    expect(createCommandId).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["정의되지 않은 값", undefined],
    ["유한하지 않은 수", Number.POSITIVE_INFINITY],
  ])("%s은 요청 전에 명시적으로 거절한다", async (_label, value) => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await expect(act(() => result.current.send(
      "relay-submit-question",
      {},
      value as unknown as RoomCommandRequestJsonValue,
    ))).rejects.toThrow("JSON");
    expect(createCommandId).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("순환 값은 요청 전에 명시적으로 거절한다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    await expect(act(() => result.current.send(
      "relay-submit-question",
      {},
      cyclic as unknown as RoomCommandRequestJsonValue,
    ))).rejects.toThrow("JSON");
    expect(createCommandId).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("직렬화에서 사라지는 배열 속성은 요청 전에 거절한다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });
    const value: RoomCommandRequestJsonValue[] = [];
    Object.defineProperty(value, "hidden", { value: "사라질 값" });

    await expect(act(() => result.current.send(
      "relay-submit-question",
      {},
      value,
    ))).rejects.toThrow("JSON");
    expect(createCommandId).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("409 최신 상태에 commandId가 있으면 confirmed로 처리한다", async () => {
    const room = makeRoom();
    const createCommandId = commandIds();
    const id = createCommandId();
    createCommandId.mockReturnValueOnce(id);
    const confirmedState = { ...baseState, recentCommandIds: [id] };
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(
      conflict(makeRoom({ gameState: confirmedState })),
    );
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await expect(act(() => result.current.send("relay-submit-question", {}, "질문")))
      .resolves.toBe("confirmed");
  });

  it("409 최신 상태에 commandId가 없으면 retryable로 처리한다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId: commandIds(),
    });

    await expect(act(() => result.current.send("relay-submit-question", {}, "질문")))
      .resolves.toBe("retryable");
  });

  it("요청 예외는 같은 명령으로 다시 시도할 수 있는 retryable이다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockRejectedValue(new Error("network"));
    const createCommandId = commandIds();
    const { result } = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });

    await expect(act(() => result.current.send("relay-submit-question", {}, "질문")))
      .resolves.toBe("retryable");
    await expect(act(() => result.current.send("relay-submit-question", {}, "질문")))
      .resolves.toBe("retryable");
    expect(createCommandId).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["createdAt", (room: GameRoom, state: TestState) => ({
      room: makeRoom({ ...room, createdAt: room.createdAt + 1 }), state,
    })],
    ["playId", (room: GameRoom, state: TestState) => ({
      room: makeRoom({ ...room, playId: "10000000-0000-4000-8000-000000000002" }), state,
    })],
    ["roundId", (room: GameRoom, state: TestState) => {
      const nextState = {
        ...state,
        roundId: "20000000-0000-4000-8000-000000000002",
      };
      return { room: makeRoom({ ...room, gameState: nextState }), state: nextState };
    }],
    ["participants", (room: GameRoom, state: TestState) => ({
      room: makeRoom({
        ...room,
        players: [...room.players, {
          id: "user-3", name: "학생 3", isHost: false, joinedAt: 3,
        }],
      }),
      state,
    })],
  ])("%s 변경은 새 수명에서 옛 요청과 다른 commandId를 쓴다", async (_label, change) => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
      lifetimeParts: ["user-1"],
    });
    await act(() => hook.result.current.send("relay-submit-question", {}, "질문"));
    const next = change(room, baseState);

    hook.rerender({
      room: next.room,
      state: next.state,
      onAction,
      createCommandId,
      lifetimeParts: ["user-1"],
    });
    await act(() => hook.result.current.send("relay-submit-question", {}, "질문"));

    expect(createCommandId).toHaveBeenCalledTimes(2);
  });

  it("현재 동작자 조각 변경도 새 요청 수명을 만든다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
      lifetimeParts: ["user-1"],
    });
    await act(() => hook.result.current.send("relay-submit-question", {}, "질문"));

    hook.rerender({
      room,
      state: baseState,
      onAction,
      createCommandId,
      lifetimeParts: ["user-2"],
    });
    await act(() => hook.result.current.send("relay-submit-question", {}, "질문"));

    expect(createCommandId).toHaveBeenCalledTimes(2);
  });

  it("새 수명 뒤 예전 send는 요청이나 현재 상태를 건드리지 않는다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(conflict(room));
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });
    const oldSend = hook.result.current.send;
    const nextState = {
      ...baseState,
      roundId: "20000000-0000-4000-8000-000000000002",
    };

    hook.rerender({
      room: makeRoom({ gameState: nextState }),
      state: nextState,
      onAction,
      createCommandId,
    });

    await expect(oldSend("relay-submit-question", {}, "옛 질문"))
      .resolves.toBe("stale");
    expect(createCommandId).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    expect(hook.result.current.pendingKind).toBeNull();
    expect(hook.result.current.acknowledgementVersion).toBe(0);
  });

  it.each(["success", "failure"])(
    "새 수명 뒤 늦은 %s는 현재 요청 상태를 바꾸지 않는다",
    async (kind) => {
      const room = makeRoom();
      const oldResponse = deferred<RoomActionResult>();
      const nextRoom = makeRoom({
        playId: "10000000-0000-4000-8000-000000000002",
      });
      const onAction = vi.fn<RoomActionHandler>()
        .mockImplementationOnce(() => oldResponse.promise)
        .mockResolvedValueOnce(success(nextRoom));
      const createCommandId = commandIds();
      const hook = renderRequestHook({
        room,
        state: baseState,
        onAction,
        createCommandId,
      });
      let oldOutcome: string | undefined;
      act(() => {
        void hook.result.current.send("relay-submit-question", {}, "옛 질문")
          .then((value) => { oldOutcome = value; });
      });
      expect(hook.result.current.pendingKind).toBe("relay-submit-question");

      hook.rerender({
        room: nextRoom,
        state: baseState,
        onAction,
        createCommandId,
      });
      await expect(act(() => hook.result.current.send(
        "relay-submit-question",
        {},
        "새 질문",
      ))).resolves.toBe("confirmed");
      const acknowledgementVersion = hook.result.current.acknowledgementVersion;

      await act(async () => {
        oldResponse.resolve(kind === "success" ? success(room) : conflict(room));
        await oldResponse.promise;
      });

      expect(oldOutcome).toBe("stale");
      expect(hook.result.current.pendingKind).toBeNull();
      expect(hook.result.current.acknowledgementVersion)
        .toBe(acknowledgementVersion);
    },
  );

  it("폴링 상태가 commandId를 확인하면 확인 횟수를 올리고 진행 요청을 해제한다", async () => {
    const room = makeRoom();
    const pending = deferred<RoomActionResult>();
    const onAction = vi.fn<RoomActionHandler>().mockImplementation(() => pending.promise);
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });
    act(() => {
      void hook.result.current.send("relay-submit-question", {}, "질문");
    });
    const commandId = onAction.mock.calls[0]?.[2]?.commandId;
    expect(commandId).toBeTruthy();

    const confirmedState = {
      ...baseState,
      recentCommandIds: [commandId!],
    };
    hook.rerender({
      room: makeRoom({ gameState: confirmedState }),
      state: confirmedState,
      onAction,
      createCommandId,
    });

    await waitFor(() => {
      expect(hook.result.current.acknowledgementVersion).toBe(1);
      expect(hook.result.current.pendingKind).toBeNull();
    });

    await act(async () => {
      pending.resolve(conflict(makeRoom({ gameState: confirmedState })));
      await pending.promise;
    });
  });

  it("단계가 바뀐 폴링 확인은 새 입력 수명으로 넘기고 확인 횟수를 올리지 않는다", async () => {
    const room = makeRoom();
    const pending = deferred<RoomActionResult>();
    const onAction = vi.fn<RoomActionHandler>().mockImplementation(() => pending.promise);
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });
    let outcome: string | undefined;
    act(() => {
      void hook.result.current.send("relay-submit-question", {}, "질문")
        .then((value) => { outcome = value; });
    });
    const commandId = onAction.mock.calls[0]?.[2]?.commandId;
    const nextState = {
      ...baseState,
      phase: "done",
      recentCommandIds: [commandId!],
    };
    const nextRoom = makeRoom({ status: "ended", gameState: nextState });

    hook.rerender({
      room: nextRoom,
      state: nextState,
      onAction,
      createCommandId,
    });

    await waitFor(() => {
      expect(hook.result.current.pendingKind).toBeNull();
      expect(hook.result.current.acknowledgementVersion).toBe(0);
    });
    await act(async () => {
      pending.resolve(conflict(nextRoom));
      await pending.promise;
    });
    expect(outcome).toBe("stale");
  });

  it("한 수명에서 요청이 진행 중이면 동시 요청을 보내지 않는다", async () => {
    const room = makeRoom();
    const pending = deferred<RoomActionResult>();
    const onAction = vi.fn<RoomActionHandler>().mockImplementation(() => pending.promise);
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId: commandIds(),
    });
    act(() => {
      void hook.result.current.send("relay-submit-question", {}, "첫 질문");
    });

    await expect(act(() => hook.result.current.send(
      "end-game-early",
      {},
      "끝내기",
    ))).resolves.toBe("retryable");
    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(conflict(room));
      await pending.promise;
    });
  });

  it("언마운트 뒤 늦은 응답은 stale이고 상태를 갱신하지 않는다", async () => {
    const room = makeRoom();
    const pending = deferred<RoomActionResult>();
    const onAction = vi.fn<RoomActionHandler>().mockImplementation(() => pending.promise);
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId: commandIds(),
    });
    let outcome: string | undefined;
    act(() => {
      void hook.result.current.send("relay-submit-question", {}, "질문")
        .then((value) => { outcome = value; });
    });
    hook.unmount();

    await act(async () => {
      pending.resolve(success(room));
      await pending.promise;
    });

    expect(outcome).toBe("stale");
  });

  it("언마운트 뒤 보관한 send는 요청을 시작하지 않는다", async () => {
    const room = makeRoom();
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    const createCommandId = commandIds();
    const hook = renderRequestHook({
      room,
      state: baseState,
      onAction,
      createCommandId,
    });
    const send = hook.result.current.send;
    hook.unmount();

    await expect(send("relay-submit-question", {}, "질문"))
      .resolves.toBe("stale");
    expect(createCommandId).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
