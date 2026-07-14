// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom, RoomActionResult } from "@/lib/question-games-data";
import { useRoom } from "@/app/(student)/student-question-play/games/useRoom";

function makeRoom(version = 1, code = "1234"): GameRoom {
  return {
    code,
    gameId: "question-chain",
    hostId: "user-1",
    status: "waiting",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version,
    createdAt: 1,
    updatedAt: 1,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function requestBody(init?: RequestInit) {
  return init?.body ? JSON.parse(String(init.body)) : null;
}

describe("useRoom sendAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("inactive: 활성 방이 없으면 요청하지 않고 실패 결과를 반환한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    let actionResult;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actionResult).toEqual({
      ok: false,
      room: null,
      status: null,
      reason: "inactive",
    });
    unmount();
  });

  it("기대 방이 있지만 현재 방이 없으면 superseded를 반환한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("start", {}, {
        expectedRoom: { code: "1234", createdAt: 1 },
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actionResult).toEqual({
      ok: false,
      room: null,
      status: null,
      reason: "superseded",
    });
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("같은 sendAction 참조는 호출 시점의 최신 버전을 보낸다", async () => {
    const sentVersions: number[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      sentVersions.push(body.expectedVersion);
      return jsonResponse({ room: makeRoom(body.expectedVersion + 1) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.version).toBe(1));
    const sendAction = result.current.sendAction;

    await act(async () => {
      await sendAction("start");
    });
    await act(async () => {
      await sendAction("end");
    });

    expect(sentVersions).toEqual([1, 2]);
    unmount();
  });

  it("성공 명령 결과를 화면까지 반환한다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      return jsonResponse({
        room: makeRoom(2),
        result: { retryAfterMs: 1200 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("memory-resolve-miss", {
        revealId: "reveal-1",
      });
    });

    expect(actionResult).toMatchObject({
      ok: true,
      result: { retryAfterMs: 1200 },
    });
    unmount();
  });

  it.each([
    ["음수", -1],
    ["소수", 1.5],
    ["무한값", Number.POSITIVE_INFINITY],
    ["문자열", "1200"],
  ])(
    "%s retryAfterMs는 화면 결과에서 버린다",
    async (_kind, retryAfterMs) => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = requestBody(init);
        if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
        if (!init?.method) return jsonResponse({ room: makeRoom(1) });
        return jsonResponse({
          room: makeRoom(2),
          result: { retryAfterMs },
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result, unmount } = renderHook(() => useRoom());

      await act(async () => {
        await result.current.joinRoom("1234");
      });
      let actionResult: RoomActionResult | undefined;
      await act(async () => {
        actionResult = await result.current.sendAction("memory-resolve-miss");
      });

      expect(actionResult).toMatchObject({ ok: true, room: { version: 2 } });
      expect(actionResult).not.toHaveProperty("result.retryAfterMs");
      unmount();
    },
  );

  it("버전 2 memory-roll은 최신 기대 버전과 실행 및 라운드 식별값을 보낸다", async () => {
    const currentRoom = {
      ...makeRoom(7),
      playId: "play-1",
      gameState: { stateVersion: 2, game: "memory", roundId: "round-1" },
    };
    let actionBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (!init?.method) return jsonResponse({ room: currentRoom });
      actionBody = body;
      return jsonResponse({ room: { ...currentRoom, version: 8 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
      await result.current.sendAction("memory-roll", {
        playId: "play-1",
        roundId: "round-1",
      });
    });

    expect(actionBody).toMatchObject({
      action: "memory-roll",
      playId: "play-1",
      roundId: "round-1",
      expectedVersion: 7,
      expectedCreatedAt: 1,
      commandId: expect.any(String),
    });
    unmount();
  });

  it.each([
    ["배열", [{ retryAfterMs: 1200 }]],
    ["과대 문자열", "x".repeat(10_000)],
  ])("%s 명령 결과는 화면에 반환하지 않는다", async (_kind, commandResult) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      return jsonResponse({ room: makeRoom(2), result: commandResult });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("memory-resolve-miss");
    });

    expect(actionResult).toMatchObject({ ok: true, room: { version: 2 } });
    expect(actionResult).not.toHaveProperty("result");
    unmount();
  });

  it("명령 식별값을 전달하고 화면의 놀이와 차례 식별값을 유지한다", async () => {
    const generatedCommandIds = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ];
    const randomUUID = vi.fn()
      .mockReturnValueOnce(generatedCommandIds[0])
      .mockReturnValueOnce(generatedCommandIds[1]);
    const actionBodies: Array<Record<string, unknown>> = [];
    const currentRoom = {
      ...makeRoom(1),
      playId: "room-play",
      gameState: { roundId: "room-round" },
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (!init?.method) return jsonResponse({ room: currentRoom });
      actionBodies.push(body);
      return jsonResponse({
        room: { ...currentRoom, version: currentRoom.version + actionBodies.length },
      });
    });
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
      await result.current.sendAction("first", {
        playId: "screen-play",
        roundId: "round-7",
      }, { commandId: "given-command" });
      await result.current.sendAction("second");
      await result.current.sendAction("third");
    });

    expect(actionBodies[0]).toMatchObject({
      commandId: "given-command",
      playId: "screen-play",
      roundId: "round-7",
    });
    expect(actionBodies[1]).toMatchObject({ commandId: generatedCommandIds[0] });
    expect(actionBodies[2]).toMatchObject({ commandId: generatedCommandIds[1] });
    expect(randomUUID).toHaveBeenCalledTimes(2);
    unmount();
  });

  it.each([
    ["코드", { code: "1234", createdAt: 2 }],
    ["생성 시각", { code: "5678", createdAt: 1 }],
  ])(
    "이전 방 %s 조건이면 새 방에 요청하지 않고 superseded를 반환한다",
    async (_identityPart, expectedRoom) => {
      const currentRoom = {
        ...makeRoom(1, "5678"),
        createdAt: 2,
        updatedAt: 2,
      };
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = requestBody(init);
          if (body?.action === "fail") {
            return jsonResponse({ error: "기존 오류" }, 400);
          }
          return jsonResponse({ room: currentRoom });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      const { result, unmount } = renderHook(() => useRoom());

      await act(async () => {
        await result.current.joinRoom("5678");
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => {
        await result.current.sendAction("fail");
      });
      expect(result.current.error).toBe("기존 오류");
      fetchMock.mockClear();

      let actionResult: RoomActionResult | undefined;
      await act(async () => {
        actionResult = await result.current.sendAction("start", {}, {
          expectedRoom,
        });
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(actionResult).toEqual({
        ok: false,
        room: currentRoom,
        status: null,
        reason: "superseded",
      });
      expect(result.current.error).toBe("기존 오류");
      unmount();
    },
  );

  it("높은 409를 먼저 반영하면 늦은 성공 응답이 방 버전을 낮추지 않는다", async () => {
    const delayedSuccess = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      if (body?.action === "slow") return delayedSuccess.promise;
      return jsonResponse({ error: "conflict", room: makeRoom(3) }, 409);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.version).toBe(1));

    let conflictResult;
    let successResult;
    await act(async () => {
      const successPromise = result.current.sendAction("slow");
      const conflictPromise = result.current.sendAction("fast");
      conflictResult = await conflictPromise;
      delayedSuccess.resolve(jsonResponse({ room: makeRoom(2) }));
      successResult = await successPromise;
    });

    expect(result.current.room?.version).toBe(3);
    expect(conflictResult).toMatchObject({
      ok: false,
      status: 409,
      reason: "conflict",
      room: { version: 3 },
    });
    expect(successResult).toMatchObject({
      ok: true,
      room: { version: 3 },
    });
    unmount();
  });

  it("다른 코드의 유효한 409 방은 적용하지 않고 기본 오류를 표시한다", async () => {
    const currentRoom = makeRoom(1, "1234");
    const otherRoom = makeRoom(2, "5678");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = requestBody(init);
        if (body?.action === "join") {
          return jsonResponse({ room: currentRoom });
        }
        if (!init?.method) return jsonResponse({ room: currentRoom });
        return jsonResponse({ room: otherRoom }, 409);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(actionResult).toEqual({
      ok: false,
      room: currentRoom,
      status: 409,
      reason: "conflict",
    });
    expect(result.current.room).toEqual(currentRoom);
    expect(result.current.error).toBe("작업 실패");
    unmount();
  });

  it("낮은 폴링 응답이 최신 동작 응답을 덮어쓰지 않는다", async () => {
    const delayedPoll = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return delayedPoll.promise;
      return jsonResponse({ room: makeRoom(2) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.sendAction("start");
      delayedPoll.resolve(jsonResponse({ room: makeRoom(1) }));
      await delayedPoll.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.room?.version).toBe(2);
    unmount();
  });

  it("같은 버전 폴링 응답은 현재 방 객체 참조를 바꾸지 않는다", async () => {
    const delayedPoll = deferred<Response>();
    const joinedRoom = makeRoom(1);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestBody(init)?.action === "join") {
        return jsonResponse({ room: joinedRoom });
      }
      return delayedPoll.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const connectedRoom = result.current.room;

    await act(async () => {
      delayedPoll.resolve(jsonResponse({
        room: { ...joinedRoom, gameState: { phase: "stale" } },
      }));
      await delayedPoll.promise;
      await Promise.resolve();
    });

    expect(result.current.room).toBe(connectedRoom);
    expect(result.current.room?.gameState).toEqual({});
    unmount();
  });

  it("높은 성공 응답 뒤 늦은 낮은 409는 현재 방과 오류를 바꾸지 않는다", async () => {
    const delayedConflict = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      if (body?.action === "slow") return delayedConflict.promise;
      return jsonResponse({ room: makeRoom(3) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.version).toBe(1));

    let conflictResult;
    await act(async () => {
      const conflictPromise = result.current.sendAction("slow");
      await result.current.sendAction("fast");
      delayedConflict.resolve(jsonResponse({
        error: "stale conflict",
        room: makeRoom(2),
      }, 409));
      conflictResult = await conflictPromise;
    });

    expect(result.current.room?.version).toBe(3);
    expect(result.current.error).toBeNull();
    expect(conflictResult).toMatchObject({
      ok: false,
      status: 409,
      reason: "conflict",
      room: { version: 3 },
    });
    unmount();
  });

  it("같은 버전 409는 방 객체를 유지하고 충돌 오류를 표시한다", async () => {
    const currentRoom = makeRoom(2);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: currentRoom });
      return jsonResponse({ error: "conflict", room: currentRoom }, 409);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.version).toBe(2));
    const beforeConflict = result.current.room;

    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(actionResult).toMatchObject({
      ok: false,
      status: 409,
      reason: "conflict",
    });
    expect(result.current.room).toBe(beforeConflict);
    expect(result.current.error).toBe("conflict");
    unmount();
  });

  it("network: 연결 오류면 현재 방을 담은 실패 결과를 반환한다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let actionResult;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(result.current.room?.version).toBe(1);
    expect(actionResult).toMatchObject({
      ok: false,
      status: null,
      reason: "network",
      room: { version: 1 },
    });
    unmount();
  });

  it("rejected: 서버 거절이면 현재 방을 담은 실패 결과를 반환한다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      return jsonResponse({ error: "bad request" }, 400);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let actionResult;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(result.current.room?.version).toBe(1);
    expect(actionResult).toMatchObject({
      ok: false,
      status: 400,
      reason: "rejected",
      room: { version: 1 },
    });
    unmount();
  });

  it("일반 글 본문의 HTTP 거절도 실제 상태를 보존한다", async () => {
    const currentRoom = makeRoom(1);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (!init?.method) return jsonResponse({ room: currentRoom });
      return new Response("service unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(actionResult).toEqual({
      ok: false,
      room: currentRoom,
      status: 503,
      reason: "rejected",
    });
    expect(result.current.error).toBe("작업 실패");
    unmount();
  });
});

describe("useRoom request ordering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("나가기 성공 뒤 늦은 PATCH 응답은 이전 방을 되살리지 않는다", async () => {
    const delayedAction = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom() });
      if (body?.action === "slow") return delayedAction.promise;
      if (body?.action === "leave") {
        return jsonResponse({ room: null, deleted: true });
      }
      return jsonResponse({ room: makeRoom() });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      const actionPromise = result.current.sendAction("slow");
      await result.current.leaveRoom();
      delayedAction.resolve(jsonResponse({ room: makeRoom(2) }));
      actionResult = await actionPromise;
    });

    expect(result.current.room).toBeNull();
    expect(actionResult).toMatchObject({
      ok: false,
      room: null,
      status: null,
      reason: "superseded",
    });
    unmount();
  });

  it("다른 방 연결 뒤 이전 방 GET 응답을 무시한다", async () => {
    const delayedOldPoll = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = requestBody(init);
      if (body?.action === "join") {
        const code = url.endsWith("5678") ? "5678" : "1234";
        return jsonResponse({ room: makeRoom(1, code) });
      }
      if (url.endsWith("1234")) return delayedOldPoll.promise;
      return jsonResponse({ room: makeRoom(2, "5678") });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.joinRoom("5678");
      delayedOldPoll.resolve(jsonResponse({ room: makeRoom(3, "1234") }));
      await delayedOldPoll.promise;
      await Promise.resolve();
    });

    expect(result.current.room?.code).toBe("5678");
    unmount();
  });

  it("같은 방 재참가 성공 뒤 새 폴링의 더 높은 버전을 반영한다", async () => {
    const delayedOldPoll = deferred<Response>();
    let joinCount = 0;
    let pollCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") {
        joinCount += 1;
        return jsonResponse({ room: makeRoom(joinCount) });
      }
      pollCount += 1;
      if (pollCount === 1) return delayedOldPoll.promise;
      return jsonResponse({ room: makeRoom(3) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(pollCount).toBe(1));

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.version).toBe(3));
    expect(pollCount).toBe(2);

    await act(async () => {
      delayedOldPoll.resolve(jsonResponse({ room: makeRoom(4) }));
      await delayedOldPoll.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.room?.version).toBe(3);
    unmount();
  });

  it("다른 방 연결 뒤 이전 방 PATCH 응답은 superseded를 반환한다", async () => {
    const delayedAction = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = requestBody(init);
      if (body?.action === "join") {
        const code = url.endsWith("5678") ? "5678" : "1234";
        return jsonResponse({ room: makeRoom(1, code) });
      }
      if (body?.action === "slow") return delayedAction.promise;
      const code = url.endsWith("5678") ? "5678" : "1234";
      return jsonResponse({ room: makeRoom(1, code) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      const actionPromise = result.current.sendAction("slow");
      await result.current.joinRoom("5678");
      delayedAction.resolve(jsonResponse({ room: makeRoom(2, "1234") }));
      actionResult = await actionPromise;
    });

    expect(result.current.room?.code).toBe("5678");
    expect(actionResult).toMatchObject({
      ok: false,
      reason: "superseded",
    });
    unmount();
  });

  it("세대가 지난 실패 응답은 현재 방 오류를 덮지 않는다", async () => {
    const delayedAction = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = requestBody(init);
      if (body?.action === "join") {
        const code = url.endsWith("5678") ? "5678" : "1234";
        return jsonResponse({ room: makeRoom(1, code) });
      }
      if (body?.action === "slow") return delayedAction.promise;
      const code = url.endsWith("5678") ? "5678" : "1234";
      return jsonResponse({ room: makeRoom(1, code) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    await act(async () => {
      const actionPromise = result.current.sendAction("slow");
      await result.current.joinRoom("5678");
      delayedAction.resolve(jsonResponse({ error: "old failure" }, 500));
      await actionPromise;
    });

    expect(result.current.room?.code).toBe("5678");
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("생성 뒤 시작한 참가가 먼저 끝나면 늦은 생성 성공은 무시한다", async () => {
    const delayedCreate = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (init?.method === "POST") return delayedCreate.promise;
      if (body?.action === "join") {
        return jsonResponse({ room: makeRoom(1, "5678") });
      }
      return jsonResponse({ room: makeRoom(1, String(input).slice(-4)) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      const createPromise = result.current.createRoom("question-chain");
      await result.current.joinRoom("5678");
      delayedCreate.resolve(jsonResponse({ room: makeRoom(1, "1234") }));
      await createPromise;
    });

    expect(result.current.room?.code).toBe("5678");
    unmount();
  });

  it("참가 뒤 시작한 생성이 먼저 끝나면 늦은 참가 성공은 무시한다", async () => {
    const delayedJoin = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return delayedJoin.promise;
      if (init?.method === "POST") {
        return jsonResponse({ room: makeRoom(1, "5678") });
      }
      return jsonResponse({ room: makeRoom(1, String(input).slice(-4)) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      const joinPromise = result.current.joinRoom("1234");
      await result.current.createRoom("question-chain");
      delayedJoin.resolve(jsonResponse({ room: makeRoom(1, "1234") }));
      await joinPromise;
    });

    expect(result.current.room?.code).toBe("5678");
    unmount();
  });

  it("이전 연결 실패는 최신 연결의 방과 오류를 바꾸지 않는다", async () => {
    const delayedCreate = deferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (init?.method === "POST") return delayedCreate.promise;
      if (body?.action === "join") {
        return jsonResponse({ room: makeRoom(1, "5678") });
      }
      return jsonResponse({ room: makeRoom(1, String(input).slice(-4)) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      const createPromise = result.current.createRoom("question-chain");
      await result.current.joinRoom("5678");
      delayedCreate.resolve(jsonResponse({ error: "old failure" }, 500));
      await createPromise;
    });

    expect(result.current.room?.code).toBe("5678");
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("겹친 두 방 동작 중 하나가 먼저 끝나도 actionLoading은 참이다", async () => {
    const firstAction = deferred<Response>();
    const secondAction = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom() });
      if (body?.action === "first") return firstAction.promise;
      if (body?.action === "second") return secondAction.promise;
      return jsonResponse({ room: makeRoom() });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let firstPromise: Promise<RoomActionResult>;
    let secondPromise: Promise<RoomActionResult>;
    await act(async () => {
      firstPromise = result.current.sendAction("first");
      secondPromise = result.current.sendAction("second");
      await Promise.resolve();
    });
    expect(result.current.actionLoading).toBe(true);

    await act(async () => {
      firstAction.resolve(jsonResponse({ room: makeRoom(2) }));
      await firstPromise;
    });
    expect(result.current.actionLoading).toBe(true);

    await act(async () => {
      secondAction.reject(new Error("offline"));
      await secondPromise;
    });
    expect(result.current.actionLoading).toBe(false);
    unmount();
  });

  it("폴링 요청은 actionLoading에 포함하지 않는다", async () => {
    const delayedPoll = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom() });
      return delayedPoll.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(result.current.actionLoading).toBe(false);
    unmount();
  });

  it("현재 방 PATCH의 404는 연결을 비운다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom() });
      if (body?.action === "missing") {
        return jsonResponse({ error: "room missing" }, 404);
      }
      return jsonResponse({ room: makeRoom() });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("missing");
    });
    const requestCount = fetchMock.mock.calls.length;
    let left = false;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(result.current.room).toBeNull();
    expect(result.current.error).toBe("room missing");
    expect(actionResult).toEqual({
      ok: false,
      room: null,
      status: 404,
      reason: "missing",
    });
    expect(left).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    unmount();
  });

  it("현재 방 GET의 404는 연결을 비운다", async () => {
    const delayedPoll = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom() });
      return delayedPoll.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      delayedPoll.resolve(jsonResponse({ error: "room missing" }, 404));
      await delayedPoll.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    const requestCount = fetchMock.mock.calls.length;
    let left = false;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(result.current.room).toBeNull();
    expect(result.current.error).toBe("room missing");
    expect(left).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    unmount();
  });
});

describe("useRoom leaveRoom", () => {
  let leaveResponse: Response | Error;
  let fetchMock: ReturnType<typeof vi.fn>;
  let pollRoom: GameRoom;

  beforeEach(() => {
    pollRoom = makeRoom();
    leaveResponse = jsonResponse({ room: null, deleted: true });
    fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body?.action === "join") {
        return jsonResponse({ room: makeRoom() });
      }
      if (body?.action === "leave") {
        if (leaveResponse instanceof Error) throw leaveResponse;
        return leaveResponse;
      }
      return jsonResponse({ room: pollRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("성공 응답 뒤에만 방을 비운다", async () => {
    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.code).toBe("1234"));

    let left = false;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(true);
    expect(result.current.room).toBeNull();
    unmount();
  });

  it("나가기 성공 뒤 늦은 폴링이 방을 되살리지 않는다", async () => {
    const staleRoom = makeRoom(2);
    let resolvePoll!: (response: Response) => void;
    const pendingPoll = new Promise<Response>((resolve) => {
      resolvePoll = resolve;
    });
    fetchMock.mockImplementation(async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body?.action === "join") {
        return jsonResponse({ room: makeRoom() });
      }
      if (body?.action === "leave") {
        return jsonResponse({ room: null, deleted: true });
      }
      return pendingPoll;
    });

    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    let left = false;
    await act(async () => {
      const leavePromise = result.current.leaveRoom();
      const pollAfterLeave = leavePromise.then((didLeave) => {
        left = didLeave;
        resolvePoll(jsonResponse({ room: staleRoom }));
      });
      await Promise.all([leavePromise, pollAfterLeave, pendingPoll]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(left).toBe(true);
    expect(result.current.room).toBeNull();
    unmount();
  });

  it("409이면 최신 방을 반영하고 방을 유지한다", async () => {
    const latest = makeRoom(2);
    pollRoom = latest;
    leaveResponse = jsonResponse({
      error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
      room: latest,
    }, 409);
    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let left = true;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(false);
    expect(result.current.room).toEqual(latest);
    expect(result.current.error).toContain("방 상태가 바뀌었어요");
    unmount();
  });

  it("높은 동작 성공 뒤 늦은 낮은 409 나가기는 현재 방과 오류를 바꾸지 않는다", async () => {
    const delayedLeave = deferred<Response>();
    fetchMock.mockImplementation(async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: makeRoom(1) });
      if (body?.action === "leave") return delayedLeave.promise;
      if (!init?.method) return jsonResponse({ room: makeRoom(1) });
      return jsonResponse({ room: makeRoom(3) });
    });

    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let left = true;
    await act(async () => {
      const leavePromise = result.current.leaveRoom();
      await result.current.sendAction("start");
      delayedLeave.resolve(jsonResponse({
        error: "stale leave conflict",
        room: makeRoom(2),
      }, 409));
      left = await leavePromise;
    });

    expect(left).toBe(false);
    expect(result.current.room?.version).toBe(3);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("409 나가기 실패 뒤에도 진행 중 폴링의 더 최신 방을 반영한다", async () => {
    const conflictRoom = makeRoom(2);
    const polledRoom = makeRoom(3);
    let resolvePoll!: (response: Response) => void;
    const pendingPoll = new Promise<Response>((resolve) => {
      resolvePoll = resolve;
    });
    fetchMock.mockImplementation(async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body?.action === "join") {
        return jsonResponse({ room: makeRoom() });
      }
      if (body?.action === "leave") {
        return jsonResponse({
          error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
          room: conflictRoom,
        }, 409);
      }
      return pendingPoll;
    });

    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    let left = true;
    await act(async () => {
      left = await result.current.leaveRoom();
      resolvePoll(jsonResponse({ room: polledRoom }));
      await pendingPoll;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(left).toBe(false);
    expect(result.current.room).toEqual(polledRoom);
    expect(result.current.error).toContain("방 상태가 바뀌었어요");
    unmount();
  });

  it("연결 오류면 기존 방을 유지한다", async () => {
    leaveResponse = new Error("offline");
    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let left = true;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(false);
    expect(result.current.room?.code).toBe("1234");
    expect(result.current.error).toBe("네트워크 오류");
    unmount();
  });
});

describe("useRoom response validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["create", "join"] as const)(
    "%s의 부분 방 성공 응답은 연결하지 않는다",
    async (operation) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        jsonResponse({ room: { code: "1234" } }),
      ));
      const { result, unmount } = renderHook(() => useRoom());

      let connected: GameRoom | null = makeRoom();
      await act(async () => {
        connected = operation === "create"
          ? await result.current.createRoom("question-chain")
          : await result.current.joinRoom("1234");
      });

      expect(connected).toBeNull();
      expect(result.current.room).toBeNull();
      expect(result.current.error).toBe(
        operation === "create" ? "방 생성 실패" : "참가 실패",
      );
      unmount();
    },
  );

  it.each(["create", "join"] as const)(
    "%s의 일반 글 503은 서버 거절 기본 문구를 표시한다",
    async (operation) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response("service unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ));
      const { result, unmount } = renderHook(() => useRoom());

      await act(async () => {
        if (operation === "create") {
          await result.current.createRoom("question-chain");
        } else {
          await result.current.joinRoom("1234");
        }
      });

      expect(result.current.error).toBe(
        operation === "create" ? "방 생성 실패" : "참가 실패",
      );
      unmount();
    },
  );

  it("요청 코드와 다른 참가 성공 응답은 연결하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ room: makeRoom(1, "5678") }),
    ));
    const { result, unmount } = renderHook(() => useRoom());

    let connected: GameRoom | null = makeRoom();
    await act(async () => {
      connected = await result.current.joinRoom("1234");
    });

    expect(connected).toBeNull();
    expect(result.current.room).toBeNull();
    expect(result.current.error).toBe("참가 실패");
    unmount();
  });

  it("부분 방 동작 성공과 충돌 응답은 현재 방을 보존한다", async () => {
    const currentRoom = makeRoom();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (body?.action === "partial-success") {
        return jsonResponse({ room: { code: "1234", version: 2 } });
      }
      if (body?.action === "partial-conflict") {
        return jsonResponse({
          error: "conflict",
          room: { code: "1234", version: 3 },
        }, 409);
      }
      return jsonResponse({ room: currentRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let successResult: RoomActionResult | undefined;
    let conflictResult: RoomActionResult | undefined;
    await act(async () => {
      successResult = await result.current.sendAction("partial-success");
      conflictResult = await result.current.sendAction("partial-conflict");
    });

    expect(successResult).toEqual({
      ok: false,
      room: currentRoom,
      status: 200,
      reason: "rejected",
    });
    expect(conflictResult).toEqual({
      ok: false,
      room: currentRoom,
      status: 409,
      reason: "conflict",
    });
    expect(result.current.room).toEqual(currentRoom);
    unmount();
  });

  it("부분 방 폴링 응답은 현재 방을 바꾸지 않는다", async () => {
    const currentRoom = makeRoom();
    const delayedPoll = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      return delayedPoll.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      delayedPoll.resolve(jsonResponse({
        room: { ...currentRoom, version: 2, players: [{ id: "broken" }] },
      }));
      await delayedPoll.promise;
      await Promise.resolve();
    });

    expect(result.current.room).toEqual(currentRoom);
    unmount();
  });

  it("부분 방 나가기 성공 응답은 현재 방을 보존한다", async () => {
    const currentRoom = makeRoom();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (body?.action === "leave") {
        return jsonResponse({ room: { code: "1234" } });
      }
      return jsonResponse({ room: currentRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let left = true;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(false);
    expect(result.current.room).toEqual(currentRoom);
    expect(result.current.error).toBe("나가기 실패");
    unmount();
  });

  it("null 본문의 동작 404는 연결을 비우고 missing을 반환한다", async () => {
    const currentRoom = makeRoom();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (body?.action === "missing") return jsonResponse(null, 404);
      return jsonResponse({ room: currentRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("missing");
    });

    expect(actionResult).toEqual({
      ok: false,
      room: null,
      status: 404,
      reason: "missing",
    });
    expect(result.current.room).toBeNull();
    expect(result.current.error).toBe("방을 찾을 수 없어요");
    unmount();
  });

  it("null 본문의 폴링 404는 연결을 비운다", async () => {
    const currentRoom = makeRoom();
    const delayedPoll = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (requestBody(init)?.action === "join") {
        return jsonResponse({ room: currentRoom });
      }
      return delayedPoll.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      delayedPoll.resolve(jsonResponse(null, 404));
      await delayedPoll.promise;
      await Promise.resolve();
    });

    expect(result.current.room).toBeNull();
    expect(result.current.error).toBe("방을 찾을 수 없어요");
    unmount();
  });
});

describe("useRoom room lifetime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [1, 2],
    [2, 1],
  ])(
    "폴링 방 생성 시각이 %s에서 %s로 바뀌면 연결을 비운다",
    async (currentCreatedAt, responseCreatedAt) => {
      const currentRoom = {
        ...makeRoom(),
        createdAt: currentCreatedAt,
        updatedAt: currentCreatedAt,
      };
      const delayedPoll = deferred<Response>();
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (requestBody(init)?.action === "join") {
          return jsonResponse({ room: currentRoom });
        }
        return delayedPoll.promise;
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result, unmount } = renderHook(() => useRoom());

      await act(async () => {
        await result.current.joinRoom("1234");
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => {
        delayedPoll.resolve(jsonResponse({
          room: { ...currentRoom, version: 2, createdAt: responseCreatedAt },
        }));
        await delayedPoll.promise;
        await Promise.resolve();
      });

      expect(result.current.room).toBeNull();
      unmount();
    },
  );

  it("동작 응답의 방 생성 시각이 바뀌면 연결을 비우고 superseded를 반환한다", async () => {
    const currentRoom = makeRoom();
    const replacement = { ...makeRoom(2), createdAt: 2, updatedAt: 2 };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (body?.action === "start") return jsonResponse({ room: replacement });
      return jsonResponse({ room: currentRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
    });
    let actionResult: RoomActionResult | undefined;
    await act(async () => {
      actionResult = await result.current.sendAction("start");
    });

    expect(result.current.room).toBeNull();
    expect(actionResult).toEqual({
      ok: false,
      room: null,
      status: null,
      reason: "superseded",
    });
    unmount();
  });

  it("방 동작과 나가기는 현재 생성 시각을 본문에 보낸다", async () => {
    const currentRoom = { ...makeRoom(), createdAt: 42, updatedAt: 42 };
    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init);
      if (body?.action === "join") return jsonResponse({ room: currentRoom });
      if (body?.action === "start" || body?.action === "memory-roll") {
        bodies.push(body);
        return jsonResponse({
          room: {
            ...currentRoom,
            version: body.action === "start" ? 2 : 3,
          },
        });
      }
      if (body?.action === "leave") {
        bodies.push(body);
        return jsonResponse({ room: null, deleted: true });
      }
      return jsonResponse({ room: currentRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useRoom());

    await act(async () => {
      await result.current.joinRoom("1234");
      await result.current.sendAction("start");
      await result.current.sendAction("memory-roll", {
        roll: 5,
        rollRoundId: "round-1",
      });
      await result.current.leaveRoom();
    });

    expect(bodies).toEqual([
      expect.objectContaining({ action: "start", expectedCreatedAt: 42 }),
      expect.objectContaining({
        action: "memory-roll",
        expectedCreatedAt: 42,
      }),
      expect.objectContaining({ action: "leave", expectedCreatedAt: 42 }),
    ]);
    expect(bodies[1]).not.toHaveProperty("expectedVersion");
    unmount();
  });
});
