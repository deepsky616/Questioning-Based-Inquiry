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
import { applyQuestionGameRoomCommand } from "@/lib/question-game-room-engine";
import { assignLadderTopics } from "@/lib/question-ladder";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function getGame(id: string): BuiltInGame {
  return BUILT_IN_GAMES.find((candidate) => candidate.id === id)!;
}

const players = [
  { id: "user-1", name: "서연", isHost: true, joinedAt: 1 },
  { id: "user-2", name: "민준", isHost: false, joinedAt: 2 },
];

function uuid(index: number): string {
  return `30000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
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

function changed(result: ReturnType<typeof applyQuestionGameRoomCommand>): GameRoom {
  if (result.kind !== "changed") {
    throw new Error(`시험 방을 만들지 못했습니다: ${result.kind}`);
  }
  return result.room;
}

function startRoom(gameId: "story-dice" | "dice" | "relay" | "kaba"): GameRoom {
  const waiting = makeGameRoom(gameId, {}, { status: "waiting", version: 3 });
  const ids = [uuid(1), uuid(2), uuid(3)];
  return changed(applyQuestionGameRoomCommand({
    room: waiting,
    userId: "user-1",
    userName: "서연",
    action: "start",
    body: {
      commandId: uuid(10),
      expectedCreatedAt: waiting.createdAt,
      expectedVersion: waiting.version,
    },
    now: 10,
    random: () => 0,
    randomUUID: () => ids.shift() ?? uuid(9),
  }));
}

let commandIndex = 30;

function runCommand(
  room: GameRoom,
  userId: string,
  action: string,
  extra: Record<string, unknown> = {},
): GameRoom {
  commandIndex += 1;
  const user = room.players.find((player) => player.id === userId)!;
  const roundId = typeof room.gameState.roundId === "string"
    ? room.gameState.roundId
    : undefined;
  return changed(applyQuestionGameRoomCommand({
    room,
    userId,
    userName: user.name,
    action,
    body: {
      commandId: uuid(commandIndex),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      ...(roundId ? { roundId } : {}),
      ...extra,
    },
    now: commandIndex,
    random: () => 0,
    randomUUID: () => uuid(commandIndex + 100),
  }));
}

function storyRoom(phase: "story" | "question" | "answer"): GameRoom {
  let room = runCommand(startRoom("story-dice"), "user-1", "story-prepare");
  room = runCommand(room, "user-1", "story-roll");
  if (phase === "story") return room;
  room = runCommand(room, "user-1", "story-submit-story", {
    story: "토끼가 학교에서 책을 발견했다.",
  });
  if (phase === "question") return room;
  return runCommand(room, "user-2", "story-submit-question", {
    locale: "ko",
    question: "토끼는 왜 책을 집었나요?",
  });
}

function activeRoom(gameId: "dice" | "relay" | "kaba"): GameRoom {
  const room = startRoom(gameId);
  if (gameId === "dice") return runCommand(room, "user-1", "dice-roll");
  if (gameId === "relay") {
    return runCommand(room, "user-1", "relay-set-topic", { topic: "우주" });
  }
  return runCommand(room, "user-1", "kaba-prepare");
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
  expect(onAction.mock.calls[0]?.[2]?.commandId).toBe(
    onAction.mock.calls[1]?.[2]?.commandId,
  );
}

const flowCases = [
  {
    name: "이야기",
    myId: "user-1",
    label: "세 단어로 이야기를 써 보세요.",
    buttonName: /이야기 보내기/,
    input: "토끼가 학교에서 책을 발견했다.",
    room: storyRoom("story"),
  },
  {
    name: "질문",
    myId: "user-2",
    label: "이야기에 이어질 질문을 만들어 보세요.",
    buttonName: /질문 보내기/,
    input: "토끼는 왜 책을 집었나요?",
    room: storyRoom("question"),
  },
  {
    name: "대답",
    myId: "user-1",
    label: "친구의 질문에 답해 보세요.",
    buttonName: /대답 보내기/,
    input: "친구에게 읽어 주려고 집었어요.",
    room: storyRoom("answer"),
  },
] as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("이야기 주사위 입력", () => {
  it.each(flowCases)("$name 제출은 실패 뒤 유지하고 성공 뒤 비운다", async ({
    name,
    myId,
    label,
    buttonName,
    input,
    room,
  }) => {
    const onAction = actionSequence(room);

    render(
      <RoomStoryDice
        game={getGame("story-dice")}
        room={room}
        myId={myId}
        actionLoading={false}
        onAction={onAction}
        onLeave={vi.fn()}
      />,
    );

    const textArea = screen.getByRole("textbox", { name: label }) as HTMLTextAreaElement;
    const submitButton = screen.getByRole("button", { name: buttonName });
    await expectFailureThenSuccess(textArea, submitButton, onAction, input);
    const expectedAction = name === "이야기"
      ? "story-submit-story"
      : name === "질문"
        ? "story-submit-question"
        : "story-submit-answer";
    const valueKey = name === "이야기" ? "story" : name === "질문" ? "question" : "answer";
    expect(onAction.mock.calls[0]?.slice(0, 2)).toEqual([
      expectedAction,
      {
        playId: room.playId,
        roundId: room.gameState.roundId,
        ...(name === "질문" ? { locale: "ko" } : {}),
        [valueKey]: input,
      },
    ]);
  });
});

describe("게임 방 입력", () => {
  it("질문 릴레이 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const room = activeRoom("relay");
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
      screen.getByPlaceholderText(/이어질 질문/) as HTMLTextAreaElement,
      screen.getByRole("button", { name: /질문 보내기/ }),
      onAction,
      "우주는 얼마나 넓은가요?",
    );
    expect(onAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "relay-submit-question",
      {
        playId: room.playId,
        roundId: room.gameState.roundId,
        locale: "ko",
        question: "우주는 얼마나 넓은가요?",
      },
    ]);
  });

  it("까바놀이 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const room = activeRoom("kaba");
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
      screen.getByRole("button", { name: /질문 보내기/ }),
      onAction,
      "고양이가 자나요?",
    );
    expect(onAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "kaba-submit-question",
      {
        playId: room.playId,
        roundId: room.gameState.roundId,
        locale: "ko",
        question: "고양이가 자나요?",
      },
    ]);
  });

  it("질문 주사위 제출은 실패 뒤 유지하고 성공 뒤 비운다", async () => {
    const room = activeRoom("dice");
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
      screen.getByPlaceholderText(/질문을 써 보세요/) as HTMLTextAreaElement,
      screen.getByRole("button", { name: /질문 보내기/ }),
      onAction,
      "달은 지구 주위를 도나요?",
    );
    expect(onAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "dice-submit-question",
      {
        playId: room.playId,
        roundId: room.gameState.roundId,
        locale: "ko",
        question: "달은 지구 주위를 도나요?",
      },
    ]);
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
