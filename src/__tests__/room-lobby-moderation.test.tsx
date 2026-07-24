// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoomLobby from "@/app/(student)/student-question-play/games/RoomLobby";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { BUILT_IN_GAMES, type GameRoom } from "@/lib/question-games-data";

const room: GameRoom = {
  code: "1234",
  gameId: "dice",
  hostId: "host",
  status: "waiting",
  players: [
    { id: "host", name: "방장", isHost: true, joinedAt: 1 },
    { id: "guest", name: "친구", isHost: false, joinedAt: 2 },
  ],
  topic: "",
  chain: [],
  turnIndex: 0,
  gameState: {},
  version: 1,
  createdAt: 1,
  updatedAt: 1,
};

afterEach(cleanup);

describe("질문놀이 대기방 참여자 관리", () => {
  it("방장에게만 다른 학생 내보내기 조작과 확인 창을 제공한다", async () => {
    const onRemovePlayer = vi.fn().mockResolvedValue(true);
    render(
      <RoomLobby
        game={BUILT_IN_GAMES.find(({ id }) => id === "dice")!}
        room={room}
        myId="host"
        actionLoading={false}
        onStart={() => {}}
        onLeave={() => {}}
        onRemovePlayer={onRemovePlayer}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "친구 내보내기" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "친구 학생을 방에서 내보낼까요?",
    );
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));

    expect(onRemovePlayer).toHaveBeenCalledWith("guest");
  });

  it("일반 참가자에게는 내보내기 조작을 보여주지 않는다", () => {
    render(
      <RoomLobby
        game={BUILT_IN_GAMES.find(({ id }) => id === "dice")!}
        room={room}
        myId="guest"
        actionLoading={false}
        onStart={() => {}}
        onLeave={() => {}}
        onRemovePlayer={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /내보내기/ })).not.toBeInTheDocument();
  });
});
