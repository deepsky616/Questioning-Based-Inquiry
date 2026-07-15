// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomResult from "@/app/(student)/student-question-play/games/RoomResult";
import type { GameAwardResult } from "@/lib/game-award-result";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";

const auth = vi.hoisted(() => ({
  session: {
    data: {
      user: { id: "teacher", name: "교사", role: "TEACHER" },
    },
    status: "authenticated",
  } as {
    data: { user: { id: string; name: string; role: string } } | null;
    status: "authenticated" | "loading" | "unauthenticated";
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => auth.session,
}));

const PLAY_ID = "11111111-1111-4111-8111-111111111111";
const NEXT_PLAY_ID = "22222222-2222-4222-8222-222222222222";
const AWARD: GameAwardResult = {
  awards: [{
    studentId: "student",
    bonusType: "PARTICIPATION",
    points: 1,
    reason: "게임 참여",
  }],
  summary: "함께 잘 탐구했습니다.",
};
const NEW_AWARD: GameAwardResult = {
  awards: [{
    studentId: "student",
    bonusType: "PARTICIPATION",
    points: 9,
    reason: "새 실행 결과",
  }],
  summary: "새 실행 결과입니다.",
};
const game = BUILT_IN_GAMES.find((item) => item.id === "dice")!;

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "teacher",
    status: "ended",
    players: [
      { id: "teacher", name: "교사", isHost: true, joinedAt: 1 },
      { id: "student", name: "학생", isHost: false, joinedAt: 2 },
    ],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {
      stateVersion: 2,
      game: "dice",
      phase: "done",
      endReason: "completed",
    },
    version: 7,
    createdAt: 100,
    updatedAt: 100,
    playId: PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
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

function renderResult(
  room = makeRoom(),
  myId = "teacher",
  actionLoading = false,
  onLeave = vi.fn(),
) {
  return render(
    <RoomResult
      game={game}
      room={room}
      myId={myId}
      scoreLabel="질문"
      scoreUnit="개"
      scores={[
        { playerId: "teacher", name: "교사", score: 0 },
        { playerId: "student", name: "학생", score: 2 },
      ]}
      questions={[{
        playerId: "student",
        playerName: "학생",
        question: "우주는 왜 넓을까요?",
      }]}
      actionLoading={actionLoading}
      onAction={onAction}
      onLeave={onLeave}
    />,
  );
}

beforeEach(() => {
  auth.session = {
    data: {
      user: { id: "teacher", name: "교사", role: "TEACHER" },
    },
    status: "authenticated",
  };
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    ...AWARD,
    alreadyAwarded: true,
  }));
  vi.stubGlobal("fetch", fetchMock);
  onAction = vi.fn<RoomActionHandler>().mockResolvedValue(
    success(makeRoom({ awardResult: AWARD })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verified room result awards", () => {
  it("sends only execution identifiers and publishes without a client result", async () => {
    renderResult();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toEqual({
      gameId: "dice",
      roomCode: "1234",
      roomCreatedAt: 100,
      playId: PLAY_ID,
    });
    expect(requestBody).not.toHaveProperty("contributions");
    expect(requestBody).not.toHaveProperty("topic");
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(
      "publish-award-result",
      { playId: PLAY_ID },
      { expectedRoom: { code: "1234", createdAt: 100, playId: PLAY_ID } },
    ));
    expect(onAction.mock.calls[0][1]).not.toHaveProperty("result");
    expect(screen.getByText("+1점")).toBeVisible();
  });

  it("does not request points for a student host", async () => {
    auth.session = {
      data: { user: { id: "teacher", name: "학생", role: "STUDENT" } },
      status: "authenticated",
    };

    renderResult();
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it.each(["host", "insufficient-players"])(
    "does not request points after a %s ending",
    async (endReason) => {
      renderResult(makeRoom({
        gameState: {
          stateVersion: 2,
          game: "dice",
          phase: "done",
          endReason,
        },
      }));
      await act(async () => {});

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onAction).not.toHaveBeenCalled();
    },
  );

  it("retries an award request before publishing", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("실패", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(AWARD));

    renderResult();

    const retry = await screen.findByRole("button", { name: "포인트 다시 받기" });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onAction).toHaveBeenCalledOnce());
  });

  it("locks leaving and restarting while the point request is pending", async () => {
    const pending = deferred<Response>();
    const onLeave = vi.fn();
    fetchMock.mockReturnValue(pending.promise);

    renderResult(makeRoom(), "teacher", false, onLeave);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const leave = screen.getByRole("button", { name: /나가기/ });
    const restart = screen.getByRole("button", { name: /대기실로 돌아가기/ });
    expect(leave).toBeDisabled();
    expect(restart).toBeDisabled();
    fireEvent.click(leave);
    fireEvent.click(restart);
    expect(onLeave).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(new Response("실패", { status: 500 }));
      await pending.promise;
    });
  });

  it("locks leaving and restarting while the verified result is publishing", async () => {
    const pending = deferred<RoomActionResult>();
    const onLeave = vi.fn();
    onAction.mockReturnValue(pending.promise);

    renderResult(makeRoom(), "teacher", false, onLeave);
    await waitFor(() => expect(onAction).toHaveBeenCalledOnce());

    const leave = screen.getByRole("button", { name: /나가기/ });
    const restart = screen.getByRole("button", { name: /대기실로 돌아가기/ });
    expect(leave).toBeDisabled();
    expect(restart).toBeDisabled();
    fireEvent.click(leave);
    fireEvent.click(restart);
    expect(onLeave).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolve(success(makeRoom({ awardResult: AWARD })));
      await pending.promise;
    });
  });

  it("honors the shared room action lock on a published result", async () => {
    const onLeave = vi.fn();
    renderResult(
      makeRoom({ awardResult: AWARD }),
      "teacher",
      true,
      onLeave,
    );

    const leave = screen.getByRole("button", { name: /나가기/ });
    const restart = screen.getByRole("button", { name: /대기실로 돌아가기/ });
    expect(leave).toBeDisabled();
    expect(restart).toBeDisabled();
    fireEvent.click(leave);
    fireEvent.click(restart);
    expect(onLeave).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed successful award response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ...AWARD,
      internalId: "private",
    }));

    renderResult();

    expect(
      await screen.findByRole("button", { name: "포인트 다시 받기" }),
    ).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByText("+1점")).not.toBeInTheDocument();
  });

  it("retries publication without repeating the point request", async () => {
    onAction
      .mockResolvedValueOnce(conflict(makeRoom()))
      .mockResolvedValueOnce(success(makeRoom({ awardResult: AWARD })));

    renderResult();

    const retry = await screen.findByRole("button", { name: "결과 다시 공유" });
    expect(screen.getByText("+1점")).toBeVisible();
    fireEvent.click(retry);

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledOnce();
    for (const call of onAction.mock.calls) {
      expect(call).toEqual([
        "publish-award-result",
        { playId: PLAY_ID },
        { expectedRoom: { code: "1234", createdAt: 100, playId: PLAY_ID } },
      ]);
    }
  });

  it("ignores a late award response from another play in the same room", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const view = renderResult();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    view.rerender(
      <RoomResult
        game={game}
        room={makeRoom({
          hostId: "other",
          version: 8,
          playId: NEXT_PLAY_ID,
          awardResult: NEW_AWARD,
        })}
        myId="teacher"
        scoreLabel="질문"
        scoreUnit="개"
        scores={[{ playerId: "student", name: "학생", score: 2 }]}
        questions={[]}
        actionLoading={false}
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
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reads the shared result only from the room top level", async () => {
    renderResult(makeRoom({
      awardResult: NEW_AWARD,
      gameState: {
        stateVersion: 2,
        game: "dice",
        phase: "done",
        endReason: "completed",
        awardResult: AWARD,
      },
    }));
    await act(async () => {});

    expect(screen.getByText("+9점")).toBeVisible();
    expect(screen.queryByText("+1점")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
