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

const threePlayers = [
  ...players,
  { id: "user-3", name: "지우", isHost: false, joinedAt: 3 },
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
    question: "개미가 걷나요?",
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
    question: "토끼가 뛰나요?",
  });
}

function storyAfterQuestionerLeaves(): GameRoom {
  let room = start("story-dice", threePlayers);
  room = run(room, "user-1", "story-prepare");
  room = run(room, "user-1", "story-roll");
  room = run(room, "user-1", "story-submit-story", {
    story: "토끼가 학교에서 책을 찾았다.",
  });
  room = run(room, "user-2", "story-submit-question", {
    locale: "ko",
    question: "토끼는 왜 책을 찾았나요?",
  });
  room = run(room, "user-1", "story-submit-answer", {
    answer: "친구와 읽으려고 찾았어요.",
  });
  room = run(room, "user-3", "story-submit-question", {
    locale: "ko",
    question: "토끼는 책을 어디에서 찾았나요?",
  });
  room = run(room, "user-1", "story-submit-answer", {
    answer: "학교에서 찾았어요.",
  });
  return changed(leaveQuestionGameRoom({
    room,
    userId: "user-3",
    random: () => 0,
    randomUUID: () => uuid(),
  }));
}

function completedStoryAfterQuestionerLeaves(): GameRoom {
  let room = storyAfterQuestionerLeaves();
  room = run(room, "user-2", "story-submit-question", {
    locale: "ko",
    question: "토끼는 찾은 책을 어떻게 읽었나요?",
  });
  return run(room, "user-1", "story-submit-answer", {
    answer: "친구와 함께 읽었어요.",
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
    renderGame("dice", dice, "user-1", diceAction);
    fireEvent.click(screen.getByRole("button", { name: "주사위 굴리기" }));
    await waitFor(() => expect(diceAction).toHaveBeenCalledTimes(1));
    expect(diceAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "dice-roll",
      { playId: dice.playId, roundId: dice.gameState.roundId },
    ]);
  });

  it.each([
    ["story-dice", "이야기 준비하기"],
    ["dice", "주사위 굴리기"],
    ["relay", "릴레이 시작하기"],
    ["kaba", "문장 준비하기"],
  ] as const)("%s 전역 요청 중에는 새 놀이 명령을 보내지 않는다", (gameId, buttonName) => {
    const room = start(gameId);
    const onAction = vi.fn<RoomActionHandler>(async () => success(room));
    renderGame(gameId, room, "user-1", onAction, true);
    if (gameId === "relay") {
      fireEvent.change(screen.getByRole("textbox", { name: "릴레이 주제" }), {
        target: { value: "우주" },
      });
    }

    const button = screen.getByRole("button", { name: buttonName });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it.each([
    ["story-dice", "세 단어로 이야기를 써 보세요...", "이야기 보내기"],
    ["dice", "주사위 면에 맞는 질문을 써 보세요...", "질문 보내기"],
    ["relay", "앞 질문에 이어질 질문을 써 보세요...", "질문 보내기"],
    ["kaba", "문장을 질문으로 바꿔 써 보세요...", "질문 보내기"],
  ] as const)("%s 전역 요청 중에는 입력을 제출하지 않는다", (gameId, placeholder, buttonName) => {
    let room = prepared(gameId);
    if (gameId === "story-dice") room = run(room, "user-1", "story-roll");
    if (gameId === "dice") room = run(room, "user-1", "dice-roll");
    const onAction = vi.fn<RoomActionHandler>(async () => success(room));
    renderGame(gameId, room, "user-1", onAction, true);

    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value: "왜 그런가요?" },
    });
    const button = screen.getByRole("button", { name: buttonName });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it.each(["story-dice", "dice", "relay", "kaba"] as const)(
    "%s 전역 요청 중에는 조기 종료를 보내지 않는다",
    (gameId) => {
      const room = afterOneRound(gameId);
      const onAction = vi.fn<RoomActionHandler>(async () => success(room));
      const confirm = vi.spyOn(window, "confirm");
      renderGame(gameId, room, "user-1", onAction, true);

      const button = screen.getByRole("button", { name: "놀이 일찍 마치기" });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(confirm).not.toHaveBeenCalled();
      expect(onAction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["story-dice", "이야기 준비하기"],
    ["dice", "주사위 굴리기"],
    ["relay", "릴레이 시작하기"],
    ["kaba", "문장 준비하기"],
  ] as const)("%s 명령을 처리하는 동안 나가기를 잠근다", async (gameId, buttonName) => {
    const room = start(gameId);
    let resolveRequest: ((result: RoomActionResult) => void) | undefined;
    const onAction = vi.fn<RoomActionHandler>(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    renderGame(gameId, room, "user-1", onAction);
    if (gameId === "relay") {
      fireEvent.change(screen.getByRole("textbox", { name: "릴레이 주제" }), {
        target: { value: "우주" },
      });
    }

    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "나가기" })).toBeDisabled();

    resolveRequest?.(success(room));
    await waitFor(() => expect(screen.getByRole("button", { name: "나가기" })).toBeEnabled());
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
    ["kaba", "개미가 걷나요?", "맞음", "1 / 2명 제출"],
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

  it("질문자가 나가도 시작할 때 정한 목표를 유지해 2 / 4로 표시한다", () => {
    renderGame("story-dice", storyAfterQuestionerLeaves(), "user-1");
    expect(screen.getByText("질문과 대답 2 / 4쌍")).toBeInTheDocument();
    expect(screen.queryByText("질문과 대답 2 / 3쌍")).not.toBeInTheDocument();
  });

  it("질문자가 나간 뒤 다음 순서를 마쳐도 시작할 때 정한 목표를 표시한다", () => {
    renderGame("story-dice", completedStoryAfterQuestionerLeaves(), "user-1");
    expect(screen.getByText("질문과 대답 3 / 4쌍")).toBeInTheDocument();
    expect(screen.queryByText("질문과 대답 3 / 3쌍")).not.toBeInTheDocument();
  });
});

describe("차례 화면 접근성과 좁은 화면 본문", () => {
  it.each([
    ["story-dice", "세 단어로 이야기를 써 보세요."],
    ["dice", "주사위 유형에 맞는 질문"],
    ["relay", "앞 질문에 이어질 질문"],
    ["kaba", "문장을 바꾼 질문"],
  ] as const)("%s 입력은 보이는 라벨과 연결된다", (gameId, label) => {
    let room = prepared(gameId);
    if (gameId === "story-dice") room = run(room, "user-1", "story-roll");
    if (gameId === "dice") room = run(room, "user-1", "dice-roll");
    renderGame(gameId, room, "user-1");

    const input = screen.getByRole("textbox", { name: label });
    expect(input).toHaveAttribute("id");
    expect(document.querySelector(`label[for="${input.id}"]`)).toHaveTextContent(label);
  });

  it.each(["story-dice", "dice", "relay", "kaba"] as const)(
    "%s 차례와 제출 진행을 같은 실시간 알림 영역에서 알린다",
    (gameId) => {
      const room = prepared(gameId);
      renderGame(gameId, room, "user-1");

      const liveRegion = screen.getByText("서연의 차례").closest('[aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
      expect(liveRegion).toContainElement(screen.getByText(/라운드 ·/));
      expect(liveRegion).toContainElement(screen.getByText(/명 제출$/));
    },
  );

  it("공백 없는 이백 자 본문과 주제 및 문장을 줄바꿈한다", () => {
    const longQuestion = `${"q".repeat(199)}?`;
    const longStory = "s".repeat(200);
    const longAnswer = "a".repeat(200);
    const longTopic = "t".repeat(80);

    let story = prepared("story-dice");
    story = run(story, "user-1", "story-roll");
    story = run(story, "user-1", "story-submit-story", { story: longStory });
    story = run(story, "user-2", "story-submit-question", {
      locale: "ko",
      question: longQuestion,
    });
    story = run(story, "user-1", "story-submit-answer", { answer: longAnswer });
    renderGame("story-dice", story, "user-1");
    expect(screen.getByText(longStory)).toHaveClass("break-words");
    expect(screen.getByText(longQuestion)).toHaveClass("break-words");
    expect(screen.getByText(longAnswer)).toHaveClass("break-words");
    cleanup();

    let dice = start("dice");
    dice = run(dice, "user-1", "dice-roll");
    dice = run(dice, "user-1", "dice-submit-question", {
      locale: "ko",
      question: longQuestion,
    });
    renderGame("dice", dice, "user-2");
    expect(screen.getByText(longQuestion)).toHaveClass("break-words");
    cleanup();

    let relay = start("relay");
    relay = run(relay, "user-1", "relay-set-topic", { topic: longTopic });
    relay = run(relay, "user-1", "relay-submit-question", {
      locale: "ko",
      question: longQuestion,
    });
    renderGame("relay", relay, "user-2");
    expect(screen.getByText(longTopic)).toHaveClass("break-words");
    expect(screen.getByText(longQuestion)).toHaveClass("break-words");
    cleanup();

    let kaba = prepared("kaba");
    kaba = run(kaba, "user-1", "kaba-submit-question", {
      locale: "ko",
      question: longQuestion,
    });
    const kabaState = kaba.gameState as {
      attempts: Array<{ sentence: { ko: string } }>;
      sentencePlan: Array<{ text: { ko: string } }>;
    };
    renderGame("kaba", kaba, "user-2");
    expect(screen.getByText(
      kabaState.sentencePlan[kabaState.attempts.length].text.ko,
    )).toHaveClass("break-words");
    expect(screen.getByText(longQuestion)).toHaveClass("break-words");
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
