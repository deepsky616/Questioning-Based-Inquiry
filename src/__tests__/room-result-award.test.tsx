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
import RoomResult from "@/app/(student)/student-question-play/games/RoomResult";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";

interface AwardResponse {
  awards: Array<{
    studentId: string;
    bonusType: string;
    points: number;
    reason: string;
  }>;
  summary?: string;
}

const AWARD: AwardResponse = {
  awards: [{
    studentId: "host",
    bonusType: "PARTICIPATION",
    points: 1,
    reason: "게임 참여",
  }],
  summary: "함께 잘 탐구했습니다.",
};

const NEW_AWARD: AwardResponse = {
  awards: [{
    studentId: "host",
    bonusType: "PARTICIPATION",
    points: 9,
    reason: "새 방 결과",
  }],
  summary: "새 방 결과입니다.",
};

const game = BUILT_IN_GAMES.find((item) => item.id === "dice")!;

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "host",
    status: "ended",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 100,
    updatedAt: 100,
    pointAwardKeyVersion: 1,
    ...overrides,
  };
}

function success(room: GameRoom): RoomActionResult {
  return { ok: true, room };
}

function conflict(room: GameRoom): RoomActionResult {
  return { ok: false, room, status: 409, reason: "conflict" };
}

function jsonResponse(body: unknown, status = 200) {
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

let fetchMock: ReturnType<typeof vi.fn>;
let onAction: ReturnType<typeof vi.fn<RoomActionHandler>>;

function renderResult(room = makeRoom()) {
  return render(
    <RoomResult
      game={game}
      room={room}
      myId="host"
      scoreLabel="질문"
      scoreUnit="개"
      scores={[{ playerId: "host", name: "방장", score: 2 }]}
      questions={[{
        playerId: "host",
        playerName: "방장",
        question: "우주는 왜 넓을까요?",
      }]}
      onAction={onAction}
      onLeave={vi.fn()}
    />,
  );
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(AWARD));
  vi.stubGlobal("fetch", fetchMock);
  onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(makeRoom()));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("게임 결과 포인트 지급", () => {
  it("방 생성 시각을 보내고 성공한 결과만 요청 시작 수명에 공유한다", async () => {
    renderResult();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toMatchObject({
      gameId: "dice",
      roomCode: "1234",
      roomCreatedAt: 100,
    });
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(
      "update-state",
      { patch: { awardResult: AWARD } },
      { expectedRoom: { code: "1234", createdAt: 100 } },
    ));
  });

  it("지급 실패 뒤 API만 다시 호출하고 오류 본문은 공유하지 않는다", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("실패", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(AWARD));

    renderResult();

    const retry = await screen.findByRole("button", { name: "포인트 다시 받기" });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
  });

  it("형식이 잘못된 성공 응답은 결과로 인정하거나 공유하지 않는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "잘못된 응답" }));

    renderResult();

    expect(
      await screen.findByRole("button", { name: "포인트 다시 받기" }),
    ).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByText("+1점")).not.toBeInTheDocument();
  });

  it("공유 실패는 API를 다시 부르지 않고 같은 시작 수명에 결과만 다시 공유한다", async () => {
    onAction
      .mockResolvedValueOnce(conflict(makeRoom()))
      .mockResolvedValueOnce(success(makeRoom()));

    renderResult();

    const retry = await screen.findByRole("button", { name: "결과 다시 공유" });
    expect(screen.getByText("+1점")).toBeVisible();
    fireEvent.click(retry);

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const call of onAction.mock.calls) {
      expect(call[2]).toEqual({ expectedRoom: { code: "1234", createdAt: 100 } });
    }
  });

  it("같은 코드의 새 수명에서는 이전 지역 결과와 공유 다시 시도를 숨긴다", async () => {
    onAction.mockResolvedValue(conflict(makeRoom()));
    const view = renderResult();
    expect(
      await screen.findByRole("button", { name: "결과 다시 공유" }),
    ).toBeVisible();
    expect(screen.getByText("+1점")).toBeVisible();

    view.rerender(
      <RoomResult
        game={game}
        room={makeRoom({ createdAt: 200, hostId: "other" })}
        myId="host"
        scoreLabel="질문"
        scoreUnit="개"
        scores={[{ playerId: "host", name: "방장", score: 2 }]}
        questions={[]}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.queryByText("+1점")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "결과 다시 공유" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("지급 대기 중 수명이 바뀌면 늦은 결과를 표시하거나 공유하지 않는다", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const view = renderResult();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const replacement = makeRoom({
      createdAt: 200,
      gameState: { awardResult: NEW_AWARD },
    });
    view.rerender(
      <RoomResult
        game={game}
        room={replacement}
        myId="host"
        scoreLabel="질문"
        scoreUnit="개"
        scores={[{ playerId: "host", name: "방장", score: 2 }]}
        questions={[]}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    await act(async () => {
      pending.resolve(jsonResponse(AWARD));
      await pending.promise;
    });

    expect(screen.getByText("+9점")).toBeVisible();
    expect(screen.queryByText("+1점")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
