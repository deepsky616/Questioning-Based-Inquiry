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
vi.mock("@/app/(student)/student-question-play/games/RoomRelay", () => ({
  default: () => <div data-testid="active-room-game">놀이 입력 영역</div>,
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

  it("연결이 돌아오면 최신 차례로 맞춘 사실을 알린다", async () => {
    const activeRoom = {
      code: "1234",
      gameId: "relay",
      hostId: "student-1",
      status: "waiting" as const,
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
    };
    const shared = {
      room: activeRoom,
      error: null,
      actionNotice: null,
      actionLoading: false,
      isRestoring: false,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      sendAction: vi.fn(),
      leaveRoom: vi.fn(),
      setActiveCode: vi.fn(),
      refreshRoom: vi.fn(),
      clearActionNotice: vi.fn(),
    };
    roomHook.useRoom.mockReturnValue({
      ...shared,
      connectionState: "delayed",
    });
    const view = render(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );

    roomHook.useRoom.mockReturnValue({
      ...shared,
      connectionState: "connected",
    });
    view.rerender(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );

    expect(await screen.findByText("방 연결이 복구되어 최신 차례로 맞췄어요."))
      .toBeInTheDocument();
  });

  it("같은 요청이 이미 처리된 경우 저장된 결과를 쓰고 있음을 알린다", () => {
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
      actionNotice: { kind: "replayed", id: 1 },
      actionLoading: false,
      isRestoring: false,
      connectionState: "connected",
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      sendAction: vi.fn(),
      leaveRoom: vi.fn(),
      setActiveCode: vi.fn(),
      refreshRoom: vi.fn(),
      clearActionNotice: vi.fn(),
    });

    render(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText(
      "이미 처리된 활동이에요. 저장된 최신 결과를 보여 줍니다.",
    )).toBeInTheDocument();
  });

  it("진행 중 동작 오류는 모든 친구 놀이에서 화면 아래에 보이고 닫을 수 있다", () => {
    const clearError = vi.fn();
    roomHook.useRoom.mockReturnValue({
      room: {
        code: "1234",
        gameId: "relay",
        hostId: "student-1",
        status: "playing",
        players: [{
          id: "student-1",
          name: "학생",
          isHost: true,
          joinedAt: 1,
        }],
        topic: "",
        chain: [],
        turnIndex: 0,
        gameState: { stateVersion: 2 },
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      error: "질문을 보내지 못했어요",
      actionNotice: null,
      actionLoading: false,
      isRestoring: false,
      connectionState: "connected",
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      sendAction: vi.fn(),
      leaveRoom: vi.fn(),
      setActiveCode: vi.fn(),
      refreshRoom: vi.fn(),
      clearActionNotice: vi.fn(),
      clearError,
    });

    render(
      <QuestionGameRoomFlow
        game={game}
        myId="student-1"
        allowJoin
        onExit={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("질문을 보내지 못했어요");
    expect(alert).toHaveClass("fixed", "bottom-4");
    screen.getByRole("button", { name: "오류 알림 닫기" }).click();
    expect(clearError).toHaveBeenCalledOnce();
  });
});
