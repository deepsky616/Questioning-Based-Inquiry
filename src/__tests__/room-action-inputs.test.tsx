// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomDice from "@/app/(student)/student-question-play/games/RoomDice";
import RoomKaba from "@/app/(student)/student-question-play/games/RoomKaba";
import RoomLadder from "@/app/(student)/student-question-play/games/RoomLadder";
import RoomRelay from "@/app/(student)/student-question-play/games/RoomRelay";
import RoomStoryDice from "@/app/(student)/student-question-play/games/RoomStoryDice";
import {
  BUILT_IN_GAMES,
  type BuiltInGame,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";
import {
  createLadderState,
  readLadderState,
  type LadderRoomState,
} from "@/lib/question-game-room-engines/ladder";
import { assignLadderTopics } from "@/lib/question-ladder";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function getGame(id: string): BuiltInGame {
  return BUILT_IN_GAMES.find((candidate) => candidate.id === id)!;
}

const game = getGame("story-dice");

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
  return makeGameRoom("story-dice", gameState);
}

function makeGameRoom(
  gameId: string,
  gameState: Record<string, unknown>,
  overrides: Partial<GameRoom> = {},
): GameRoom {
  return {
    code: "1234",
    gameId,
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
    ...overrides,
  };
}

const conflict = (room: GameRoom): RoomActionResult => ({
  ok: false,
  room,
  status: 409,
  reason: "conflict",
});

const success = (room: GameRoom): RoomActionResult => ({ ok: true, room });

function actionSequence(room: GameRoom) {
  return vi.fn<RoomActionHandler>()
    .mockResolvedValueOnce(conflict(room))
    .mockResolvedValueOnce(success(room));
}

async function expectFailureThenSuccess(
  input: HTMLInputElement | HTMLTextAreaElement,
  submit: HTMLElement,
  onAction: ReturnType<typeof actionSequence>,
  value: string,
) {
  fireEvent.change(input, { target: { value } });
  fireEvent.click(submit);
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
  expect(input).toHaveValue(value);

  fireEvent.click(submit);
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
  expect(input).toHaveValue("");
}

const flowCases = [
  {
    name: "이야기",
    myId: "user-1",
    placeholder: "✏️ 세 단어로 이야기 한 문장을 만들어보세요!",
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
    placeholder: "이야기에 어울리는 질문을 만들어보세요...",
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
    placeholder: "질문에 어울리는 짧은 대답을 한 문장으로 해보세요...",
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
  vi.unstubAllGlobals();
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
    const onAction = actionSequence(room);

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
    await expectFailureThenSuccess(textArea, submitButton, onAction, input);
  });
});

describe("게임 방 입력", () => {
  it("질문 릴레이 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const room = makeGameRoom("relay", {}, { topic: "우주" });
    const onAction = actionSequence(room);

    render(
      <RoomRelay
        game={getGame("relay")}
        room={room}
        myId="user-1"
        actionLoading={false}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    await expectFailureThenSuccess(
      screen.getByPlaceholderText(/첫 번째 질문/) as HTMLTextAreaElement,
      screen.getByRole("button", { name: /질문 연결/ }),
      onAction,
      "우주는 얼마나 넓은가요?",
    );
  });

  it("까바놀이 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const room = makeGameRoom("kaba", {
      sentences: ["고양이가 잔다"],
      idx: 0,
      history: [],
    });
    const onAction = actionSequence(room);

    render(
      <RoomKaba
        game={getGame("kaba")}
        room={room}
        myId="user-1"
        actionLoading={false}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    await expectFailureThenSuccess(
      screen.getByPlaceholderText(/질문으로 바꿔/) as HTMLInputElement,
      screen.getByRole("button", { name: /확인하기/ }),
      onAction,
      "고양이가 자나요?",
    );
  });

  it("질문 주사위 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const room = makeGameRoom("dice", {
      phase: "writing",
      face: 1,
      history: [],
    });
    const onAction = actionSequence(room);

    render(
      <RoomDice
        game={getGame("dice")}
        room={room}
        myId="user-1"
        actionLoading={false}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    await expectFailureThenSuccess(
      screen.getByPlaceholderText(/질문 유형/) as HTMLTextAreaElement,
      screen.getByRole("button", { name: /제출하기/ }),
      onAction,
      "달은 지구 주위를 도나요?",
    );
  });

  it("질문 사다리 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const topics = ["우주", "물의 순환"];
    const grid = Array.from({ length: 10 }, () => [false]);
    const assignments = assignLadderTopics(topics, grid).map((assignment, index) => ({
      playerId: players[index].id,
      playerName: players[index].name,
      ...assignment,
    }));
    const state: LadderRoomState = {
      ...createLadderState(),
      phase: "compose",
      round: 1,
      roundId: "10000000-0000-4000-8000-000000000001",
      topicPool: topics,
      roundTopics: topics,
      grid,
      roundPlayerIds: players.map(({ id }) => id),
      roundTargetPlayerIds: players.map(({ id }) => id),
      assignments,
      questions: [],
    };
    expect(readLadderState(state)).not.toBeNull();
    const room = makeGameRoom("ladder", state, {
      playId: "30000000-0000-4000-8000-000000000001",
    });
    const onAction = actionSequence(room);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    render(
      <RoomLadder
        game={getGame("ladder")}
        room={room}
        myId="user-1"
        actionLoading={false}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: /주제 질문$/ }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "우주에는 별이 몇 개 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    const confirm = await screen.findByRole("button", { name: "도움말 없이 확정" });
    fireEvent.click(confirm);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("우주에는 별이 몇 개 있나요?");
    expect(onAction.mock.calls[0]?.[0]).toBe("ladder-submit-question");

    fireEvent.click(confirm);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(input).toHaveValue(""));
  });
});
