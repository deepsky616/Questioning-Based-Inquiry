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
