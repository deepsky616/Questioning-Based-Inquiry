// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import { useRoom } from "@/app/(student)/student-question-play/games/useRoom";

function makeRoom(version = 1): GameRoom {
  return {
    code: "1234",
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
