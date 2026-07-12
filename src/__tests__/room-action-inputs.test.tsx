// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoomStoryDice from "@/app/(student)/student-question-play/games/RoomStoryDice";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
} from "@/lib/question-games-data";

const game = BUILT_IN_GAMES.find((candidate) => candidate.id === "story-dice")!;

const words = {
  protagonist: ["토끼"],
  place: ["학교"],
  event: ["책"],
};

const players = [
  { id: "user-1", name: "서연", isHost: true, joinedAt: 1 },
  { id: "user-2", name: "민준", isHost: false, joinedAt: 2 },
];

function makeRoom(gameState: Record<string, unknown>): GameRoom {
  return {
    code: "1234",
    gameId: "story-dice",
    hostId: "user-1",
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

const flowCases = [
  {
    name: "이야기",
    myId: "user-1",
    placeholder: "단어를 모두 사용해 짧은 이야기를 한 문장으로 만들어보세요...",
    buttonName: "이야기 시작! →",
    input: "토끼가 학교에서 책을 발견했다.",
    state: {
      phase: "story",
      words,
      rolled: { protagonist: "토끼", place: "학교", event: "책" },
      chain: [],
      taggerId: "user-1",
      nextQuestionerIdx: 0,
    },
  },
  {
    name: "질문",
    myId: "user-2",
    placeholder: "이야기/앞 대답에 어울리는 질문을 만들어보세요...",
    buttonName: "질문 제출 →",
    input: "토끼는 왜 책을 집었나요?",
    state: {
      phase: "qa",
      words,
      rolled: { protagonist: "토끼", place: "학교", event: "책" },
      chain: [{
        type: "story",
        text: "토끼가 학교에서 책을 발견했다.",
        playerId: "user-1",
        playerName: "서연",
      }],
      taggerId: "user-1",
      nextQuestionerIdx: 0,
    },
  },
  {
    name: "대답",
    myId: "user-1",
    placeholder: "학생의 질문에 어울리는 대답을 한 문장으로 해보세요...",
    buttonName: "대답 제출 →",
    input: "친구에게 읽어 주려고 집었어요.",
    state: {
      phase: "qa",
      words,
      rolled: { protagonist: "토끼", place: "학교", event: "책" },
      chain: [
        {
          type: "story",
          text: "토끼가 학교에서 책을 발견했다.",
          playerId: "user-1",
          playerName: "서연",
        },
        {
          type: "question",
          text: "토끼는 왜 책을 집었나요?",
          playerId: "user-2",
          playerName: "민준",
        },
      ],
      taggerId: "user-1",
      nextQuestionerIdx: 0,
    },
  },
] as const;

afterEach(() => {
  cleanup();
});

describe("이야기 주사위 입력", () => {
  it.each(flowCases)("$name 제출은 실패 뒤 유지하고 성공 뒤 비운다", async ({
    myId,
    placeholder,
    buttonName,
    input,
    state,
  }) => {
    const room = makeRoom(state);
    const onAction = vi.fn<RoomActionHandler>();
    onAction
      .mockResolvedValueOnce({
        ok: false,
        room,
        status: 409,
        reason: "conflict",
      })
      .mockResolvedValueOnce({ ok: true, room });

    render(
      <RoomStoryDice
        game={game}
        room={room}
        myId={myId}
        actionLoading={false}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    const textArea = screen.getByPlaceholderText(placeholder) as HTMLTextAreaElement;
    const submitButton = screen.getByRole("button", { name: buttonName });
    fireEvent.change(textArea, { target: { value: input } });

    fireEvent.click(submitButton);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(textArea.value).toBe(input);

    fireEvent.click(submitButton);
    await waitFor(() => expect(textArea.value).toBe(""));
    expect(onAction).toHaveBeenCalledTimes(2);
  });
});
