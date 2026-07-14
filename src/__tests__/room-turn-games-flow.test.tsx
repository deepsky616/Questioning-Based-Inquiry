// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomDice from "@/app/(student)/student-question-play/games/RoomDice";
import RoomKaba from "@/app/(student)/student-question-play/games/RoomKaba";
import RoomRelay from "@/app/(student)/student-question-play/games/RoomRelay";
import RoomStoryDice from "@/app/(student)/student-question-play/games/RoomStoryDice";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import {
  BUILT_IN_GAMES,
  type BuiltInGame,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";

vi.mock("@/app/(student)/student-question-play/games/RoomResult", () => ({
  default: () => <div data-testid="room-result" />,
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type TurnGameId = "story-dice" | "dice" | "relay" | "kaba";

const players = [
  { id: "user-1", name: "서연", isHost: true, joinedAt: 1 },
  { id: "user-2", name: "민준", isHost: false, joinedAt: 2 },
];

let idIndex = 100;

function uuid(index = ++idIndex): string {
  return `40000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function game(gameId: TurnGameId): BuiltInGame {
  return BUILT_IN_GAMES.find((candidate) => candidate.id === gameId)!;
}

function waiting(gameId: TurnGameId, roomPlayers = players): GameRoom {
  return {
    code: "2468",
    gameId,
    hostId: "user-1",
    status: "waiting",
    players: roomPlayers,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 2,
    createdAt: 20,
    updatedAt: 20,
  };
}

function changed(result: ReturnType<typeof applyQuestionGameRoomCommand>): GameRoom {
  if (result.kind !== "changed") {
    throw new Error(`시험 방을 만들지 못했습니다: ${result.kind}`);
  }
  return result.room;
}

function start(gameId: TurnGameId, roomPlayers = players): GameRoom {
  const room = waiting(gameId, roomPlayers);
  const generated = [uuid(), uuid(), uuid()];
  return changed(applyQuestionGameRoomCommand({
    room,
    userId: "user-1",
    userName: "서연",
    action: "start",
    body: {
      commandId: uuid(),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
    },
    now: ++idIndex,
    random: () => 0,
    randomUUID: () => generated.shift() ?? uuid(),
  }));
}

function run(
  room: GameRoom,
  userId: string,
  action: string,
  extra: Record<string, unknown> = {},
): GameRoom {
  const player = room.players.find((candidate) => candidate.id === userId)!;
  const roundId = typeof room.gameState.roundId === "string"
    ? room.gameState.roundId
    : undefined;
  return changed(applyQuestionGameRoomCommand({
    room,
    userId,
    userName: player.name,
    action,
    body: {
      commandId: uuid(),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      ...(roundId ? { roundId } : {}),
      ...extra,
    },
    now: ++idIndex,
    random: () => 0,
    randomUUID: () => uuid(),
  }));
}

function prepared(gameId: TurnGameId): GameRoom {
  const room = start(gameId);
  if (gameId === "story-dice") return run(room, "user-1", "story-prepare");
  if (gameId === "relay") {
    return run(room, "user-1", "relay-set-topic", { topic: "우주" });
  }
  if (gameId === "kaba") return run(room, "user-1", "kaba-prepare");
  return room;
}

function withRecord(gameId: TurnGameId): GameRoom {
  let room = prepared(gameId);
  if (gameId === "story-dice") {
    room = run(room, "user-1", "story-roll");
    room = run(room, "user-1", "story-submit-story", {
      story: "토끼가 학교에서 책을 찾았다.",
    });
    room = run(room, "user-2", "story-submit-question", {
      locale: "ko",
      question: "토끼는 왜 책을 찾았나요?",
    });
    return run(room, "user-1", "story-submit-answer", {
      answer: "친구와 함께 읽으려고 찾았어요.",
    });
  }
  if (gameId === "dice") {
    room = run(room, "user-1", "dice-roll");
    return run(room, "user-1", "dice-submit-question", {
      locale: "ko",
      question: "달은 왜 밝게 보이나요?",
    });
  }
  if (gameId === "relay") {
    return run(room, "user-1", "relay-submit-question", {
      locale: "ko",
      question: "우주는 왜 넓어 보이나요?",
    });
  }
  return run(room, "user-1", "kaba-submit-question", {
    locale: "ko",
    question: "고양이가 자나요?",
  });
}

function afterOneRound(gameId: TurnGameId): GameRoom {
  let room = withRecord(gameId);
  if (gameId === "story-dice") return room;
  if (gameId === "dice") {
    room = run(room, "user-2", "dice-roll");
    return run(room, "user-2", "dice-submit-question", {
      locale: "ko",
      question: "별은 왜 반짝이나요?",
    });
  }
  if (gameId === "relay") {
    return run(room, "user-2", "relay-submit-question", {
      locale: "ko",
      question: "별빛은 어디에서 오나요?",
    });
  }
  return run(room, "user-2", "kaba-submit-question", {
    locale: "ko",
    question: "개미가 걷나요?",
  });
}

function completedDiceRoom(): GameRoom {
  let room = start("dice");
  for (let turn = 0; turn < 6; turn += 1) {
    const state = room.gameState as { turnOrder: string[]; currentTurnIdx: number };
    const playerId = state.turnOrder[state.currentTurnIdx];
    room = run(room, playerId, "dice-roll");
    room = run(room, playerId, "dice-submit-question", {
      locale: "ko",
      question: `이 질문 ${turn + 1}은 왜 필요한가요?`,
    });
  }
  return room;
}

function success(room: GameRoom): RoomActionResult {
  return { ok: true, room };
}

function renderGame(
  gameId: TurnGameId,
  room: GameRoom,
  myId: string,
  onAction: RoomActionHandler = vi.fn(async () => success(room)),
  actionLoading = false,
) {
  const props = {
    game: game(gameId),
    room,
    myId,
    actionLoading,
    onAction,
    onLeave: vi.fn(),
  };
  if (gameId === "story-dice") return render(<RoomStoryDice {...props} />);
  if (gameId === "dice") return render(<RoomDice {...props} />);
  if (gameId === "relay") return render(<RoomRelay {...props} />);
  return render(<RoomKaba {...props} />);
}

describe("차례 놀이 명령 흐름", () => {
  it("준비와 굴리기 명령은 좁은 이름과 본문만 보낸다", async () => {
    const story = start("story-dice");
    const storyAction = vi.fn<RoomActionHandler>(async () => success(story));
    renderGame("story-dice", story, "user-1", storyAction);
    fireEvent.click(screen.getByRole("button", { name: "이야기 준비하기" }));
    await waitFor(() => expect(storyAction).toHaveBeenCalledTimes(1));
    expect(storyAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "story-prepare",
      { playId: story.playId },
    ]);
    cleanup();

    const dice = start("dice");
    const diceAction = vi.fn<RoomActionHandler>(async () => success(dice));
    renderGame("dice", dice, "user-1", diceAction, true);
    fireEvent.click(screen.getByRole("button", { name: "주사위 굴리기" }));
    await waitFor(() => expect(diceAction).toHaveBeenCalledTimes(1));
    expect(diceAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "dice-roll",
      { playId: dice.playId, roundId: dice.gameState.roundId },
    ]);
  });

  it("주제와 카바 준비 명령은 서버 준비만 요청한다", async () => {
    const relay = start("relay");
    const relayAction = vi.fn<RoomActionHandler>(async () => success(relay));
    renderGame("relay", relay, "user-1", relayAction);
    fireEvent.change(screen.getByRole("textbox", { name: "릴레이 주제" }), {
      target: { value: "우주" },
    });
    fireEvent.click(screen.getByRole("button", { name: "릴레이 시작하기" }));
    await waitFor(() => expect(relayAction).toHaveBeenCalledTimes(1));
    expect(relayAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "relay-set-topic",
      { playId: relay.playId, topic: "우주" },
    ]);
    cleanup();

    const kaba = start("kaba");
    const kabaAction = vi.fn<RoomActionHandler>(async () => success(kaba));
    renderGame("kaba", kaba, "user-1", kabaAction);
    fireEvent.click(screen.getByRole("button", { name: "문장 준비하기" }));
    await waitFor(() => expect(kabaAction).toHaveBeenCalledTimes(1));
    expect(kabaAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "kaba-prepare",
      { playId: kaba.playId },
    ]);
  });

  it("낡은 상태 수정 명령과 클라이언트 무작위 굴리기를 쓰지 않는다", () => {
    const sources = ["RoomStoryDice", "RoomDice", "RoomRelay", "RoomKaba"]
      .map((name) => readFileSync(
        `src/app/(student)/student-question-play/games/${name}.tsx`,
        "utf8",
      ))
      .join("\n");
    expect(sources).toContain("useRoomCommandRequest");
    expect(sources).not.toMatch(/Math\.random/);
    expect(sources).not.toMatch(/"(?:set-state|update-state|set-topic|add-question|end)"/);
  });
});

describe("권위 상태 표시와 입력 가림", () => {
  it.each([
    ["story-dice", "토끼는 왜 책을 찾았나요?", "친구와 함께 읽으려고 찾았어요.", "0 / 1명 제출"],
    ["dice", "달은 왜 밝게 보이나요?", "", "1 / 2명 제출"],
    ["relay", "우주는 왜 넓어 보이나요?", "", "1 / 2명 제출"],
    ["kaba", "고양이가 자나요?", "맞음", "1 / 2명 제출"],
  ] as const)("%s 서버 기록과 제출 진행을 함께 보여 준다", (gameId, first, second, progress) => {
    renderGame(gameId, withRecord(gameId), "user-2");
    expect(screen.getByText(first)).toBeInTheDocument();
    if (second) expect(screen.getByText(second)).toBeInTheDocument();
    expect(screen.getByText(progress)).toBeInTheDocument();
  });

  it.each(["story-dice", "dice", "relay", "kaba"] as const)(
    "%s 실행 식별값이 잘못되면 입력을 숨긴다",
    (gameId) => {
      const room = prepared(gameId);
      const invalid = { ...room, playId: "잘못된 값" };
      renderGame(gameId, invalid, "user-1");
      expect(screen.getByRole("status")).toHaveTextContent("방 상태를 확인하는 중입니다");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    },
  );

  it("현재 차례가 아니면 제출 입력을 보이지 않는다", () => {
    let story = prepared("story-dice");
    story = run(story, "user-1", "story-roll");
    story = run(story, "user-1", "story-submit-story", {
      story: "토끼가 학교에서 책을 찾았다.",
    });
    renderGame("story-dice", story, "user-1");
    expect(screen.queryByPlaceholderText(/이야기에 이어질 질문/)).not.toBeInTheDocument();
    cleanup();

    renderGame("dice", start("dice"), "user-2");
    expect(screen.queryByRole("button", { name: "주사위 굴리기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    cleanup();

    renderGame("relay", prepared("relay"), "user-2");
    expect(screen.queryByPlaceholderText(/이어질 질문/)).not.toBeInTheDocument();
    cleanup();

    renderGame("kaba", prepared("kaba"), "user-2");
    expect(screen.queryByPlaceholderText(/질문으로 바꿔/)).not.toBeInTheDocument();
  });
});

describe("조기 마침과 결과 이유", () => {
  it("확인을 취소하면 보내지 않고 승인하면 조기 마침 명령을 보낸다", async () => {
    const room = afterOneRound("dice");
    const onAction = vi.fn<RoomActionHandler>(async () => success(room));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderGame("dice", room, "user-1", onAction);

    const button = screen.getByRole("button", { name: "놀이 일찍 마치기" });
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "end-game-early",
      { playId: room.playId, roundId: room.gameState.roundId },
    ]);
  });

  it("목표 달성, 방장 조기 마침, 참가자 부족 이유를 서로 다르게 알린다", () => {
    renderGame("dice", completedDiceRoom(), "user-1");
    expect(screen.getByRole("status")).toHaveTextContent("목표를 모두 마쳤어요");
    cleanup();

    const active = afterOneRound("dice");
    const hostEnded = run(active, "user-1", "end-game-early");
    renderGame("dice", hostEnded, "user-1");
    expect(screen.getByRole("status")).toHaveTextContent("방장이 놀이를 일찍 마쳤어요");
    cleanup();

    const playing = start("dice");
    const insufficient = changed(leaveQuestionGameRoom({
      room: playing,
      userId: "user-2",
      random: () => 0,
      randomUUID: () => uuid(),
    }));
    renderGame("dice", insufficient, "user-1");
    expect(screen.getByRole("status")).toHaveTextContent("참가자가 부족해 놀이를 마쳤어요");
  });
});
