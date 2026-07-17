// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { QuestionGameRoomFlow } from "@/components/question-games/QuestionGameRoomFlow";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";
import GamePage from "@/app/(student)/student-question-play/[gameId]/page";

const roomHook = vi.hoisted(() => ({
  useRoom: vi.fn(),
}));

const pageMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("@/app/(student)/student-question-play/games/useRoom", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/app/(student)/student-question-play/games/useRoom")
  >();
  return { ...actual, useRoom: roomHook.useRoom };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pageMocks.push }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "student-1" } } }),
}));

describe("질문놀이 방 복원 화면", () => {
  const game = BUILT_IN_GAMES.find(({ id }) => id === "relay")!;

  beforeEach(() => {
    window.sessionStorage.clear();
    roomHook.useRoom.mockReturnValue({
      room: null,
      error: null,
      actionLoading: false,
      isRestoring: true,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      sendAction: vi.fn(),
      leaveRoom: vi.fn(),
      setActiveCode: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("현재 놀이 식별값으로 방을 복원하며 그동안 방 선택을 숨긴다", () => {
    render(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );

    expect(roomHook.useRoom).toHaveBeenCalledWith(game.id);
    expect(screen.getByRole("status")).toHaveTextContent("방 연결을 복원하는 중...");
    expect(screen.queryByRole("button", { name: /방 개설하기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /방 코드 입력/ })).not.toBeInTheDocument();
  });

  it("학생 상세 화면을 새로 열면 저장 표지를 확인한 뒤 방 흐름을 자동으로 연다", async () => {
    window.sessionStorage.setItem("question-game-room:relay", JSON.stringify({
      code: "1234",
      gameId: "relay",
      createdAt: 1_000,
    }));
    const value = { gameId: "relay" };
    const params = Object.assign(Promise.resolve(value), {
      status: "fulfilled" as const,
      value,
    });

    render(
      <Suspense fallback={<p role="status">방 화면을 여는 중...</p>}>
        <GamePage params={params} />
      </Suspense>,
    );

    expect(screen.queryByRole("button", { name: "친구와 함께" })).not.toBeInTheDocument();
    await waitFor(() => expect(roomHook.useRoom).toHaveBeenCalledWith("relay"));
    expect(screen.getByRole("status")).toHaveTextContent("방 연결을 복원하는 중...");
    expect(screen.queryByRole("button", { name: /방 개설하기/ })).not.toBeInTheDocument();
  });

  it("열린 방의 연결이 늦어지면 상태와 즉시 다시 확인 동작을 보여 준다", async () => {
    const refreshRoom = vi.fn();
    roomHook.useRoom.mockReturnValue({
      room: {
        code: "1234",
        gameId: "relay",
        hostId: "student-1",
        status: "waiting",
        players: [{
          id: "student-1",
          name: "학생",
          isHost: true,
          joinedAt: 1,
        }],
        topic: "",
        chain: [],
        turnIndex: 0,
        gameState: {},
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      error: null,
      actionLoading: false,
      isRestoring: false,
      connectionState: "delayed",
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      sendAction: vi.fn(),
      leaveRoom: vi.fn(),
      setActiveCode: vi.fn(),
      refreshRoom,
    });

    render(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "방 연결 상태" })).toHaveTextContent(
      "방 연결이 늦어지고 있어요. 현재 화면을 유지하며 다시 확인합니다.",
    );
    screen.getByRole("button", { name: "지금 다시 확인" }).click();
    expect(refreshRoom).toHaveBeenCalledOnce();
  });
});
