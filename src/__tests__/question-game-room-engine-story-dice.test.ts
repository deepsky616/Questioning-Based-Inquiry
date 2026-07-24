import { describe, expect, it } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import {
  readStoryDicePublicState,
  readStoryDiceState,
  type StoryDiceRoomState,
} from "@/lib/question-game-room-engines/turn-games";

const PLAY_ID = "10000000-0000-4000-8000-000000000001";
const ROUND_1_ID = "10000000-0000-4000-8000-000000000002";
const ROUND_2_ID = "10000000-0000-4000-8000-000000000003";

function uuid(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function players(count: number): GameRoom["players"] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "host" : `guest-${index}`,
    name: index === 0 ? "방장" : `친구 ${index}`,
    isHost: index === 0,
    joinedAt: index + 1,
  }));
}

function waitingRoom(count = 3): GameRoom {
  return {
    code: "1234",
    gameId: "story-dice",
    hostId: "host",
    status: "waiting",
    players: players(count),
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  };
}

function changed(result: ReturnType<typeof applyQuestionGameRoomCommand>): GameRoom {
  expect(result.kind).toBe("changed");
  if (result.kind !== "changed") throw new Error("변경 결과가 필요합니다");
  return result.room;
}

function run(
  room: GameRoom,
  userId: string,
  action: string,
  index: number,
  extra: Record<string, unknown> = {},
  randomUUID = () => uuid(100 + index),
) {
  const user = room.players.find((player) => player.id === userId);
  return applyQuestionGameRoomCommand({
    room,
    userId,
    userName: user?.name ?? "요청 이름",
    action,
    body: {
      commandId: uuid(10 + index),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      ...(room.gameState.roundId ? { roundId: room.gameState.roundId } : {}),
      ...extra,
    },
    now: 100 + index,
    random: () => 0.25,
    randomUUID,
  });
}

function started(count = 3): GameRoom {
  return changed(applyQuestionGameRoomCommand({
    room: waitingRoom(count),
    userId: "host",
    userName: "방장",
    action: "start",
    body: {
      commandId: uuid(1),
      expectedCreatedAt: 10,
      expectedVersion: 1,
    },
    now: 20,
    random: () => 0,
    randomUUID: () => PLAY_ID,
  }));
}

function prepared(count = 3): GameRoom {
  const room = started(count);
  return changed(run(room, "host", "story-prepare", 2, {}, () => ROUND_1_ID));
}

function storyReady(count = 3): GameRoom {
  let room = prepared(count);
  room = changed(run(room, "host", "story-roll", 3));
  room = changed(run(room, "host", "story-submit-story", 4, {
    story: "로봇이 숲에서 비밀 지도를 찾았어요.",
  }));
  return room;
}

function completePair(
  room: GameRoom,
  questionerId: string,
  index: number,
  nextRoundId = uuid(200 + index),
): GameRoom {
  let current = changed(run(room, questionerId, "story-submit-question", index, {
    locale: "ko",
    question: `그 지도는 왜 숲에 있었을까요 ${index}?`,
  }));
  current = changed(run(current, (current.gameState as unknown as StoryDiceRoomState).taggerId,
    "story-submit-answer", index + 1, { answer: "오래전에 누군가 숨겨 두었어요." },
    () => nextRoundId));
  return current;
}

describe("이야기 주사위 방 판정기", () => {
  it("참가자가 세 명까지면 세 순환, 네 명부터면 두 순환으로 정한다", () => {
    expect(started(2).gameState.maxRounds).toBe(3);
    expect(started(3).gameState.maxRounds).toBe(3);
    expect(started(4).gameState.maxRounds).toBe(2);
    expect(started(8).gameState.maxRounds).toBe(2);
  });

  it("준비와 굴림 권한 및 서버 단어 주입 경계를 지킨다", () => {
    const room = started();
    expect(run(room, "guest-1", "story-prepare", 40).kind).toBe("forbidden");
    expect(run(room, "host", "story-prepare", 41, {
      words: { protagonist: ["client"] },
    }).kind).toBe("invalid");

    const ready = prepared();
    expect(run(ready, "guest-1", "story-roll", 42).kind).toBe("forbidden");
    expect(run(ready, "host", "story-roll", 43, { face: 6 }).kind).toBe("invalid");
    const words = readStoryDiceState(ready.gameState)!.words;
    expect(words.wordText[words.protagonist[0]]).toMatchObject({
      ko: words.protagonist[0],
      en: expect.any(String),
    });
  });

  it("질문만 제출해서는 쌍을 완료하지 않고 술래 답변 뒤 다음 질문자로 넘긴다", () => {
    const room = storyReady();
    const asked = changed(run(room, "guest-1", "story-submit-question", 5, {
      locale: "ko",
      question: "그 지도는 왜 숲에 있었을까요?",
    }));
    const state = readStoryDiceState(asked.gameState)!;

    expect(state.phase).toBe("answer");
    expect(state.pairs).toHaveLength(0);
    expect(state.pendingQuestion?.playerId).toBe("guest-1");

    const answered = changed(run(asked, "host", "story-submit-answer", 6, {
      answer: "오래전에 누군가 숨겨 두었어요.",
    }));
    const answeredState = readStoryDicePublicState(answered.gameState)!;
    expect(answeredState.pairs).toHaveLength(1);
    expect(answeredState.turnOrder[answeredState.currentTurnIdx]).toBe("guest-2");
  });

  it("세 명이면 모든 질문자가 공유 순환 세 번씩 마치면 끝낸다", () => {
    let room = storyReady();
    room = completePair(room, "guest-1", 10);
    room = completePair(room, "guest-2", 12, ROUND_2_ID);
    expect(room.gameState.round).toBe(2);
    expect(room.gameState.roundId).toBe(ROUND_2_ID);

    room = completePair(room, "guest-1", 14);
    room = completePair(room, "guest-2", 16);
    room = completePair(room, "guest-1", 18);
    room = completePair(room, "guest-2", 20);

    const state = readStoryDiceState(room.gameState)!;
    expect(room.status).toBe("ended");
    expect(state.phase).toBe("done");
    expect(state.endReason).toBe("completed");
    expect(state.pairs).toHaveLength(6);
  });

  it("완료 뒤 일부와 마지막 참가자가 나가도 기록을 보존한 변경 결과를 낸다", () => {
    let room = storyReady(2);
    room = completePair(room, "guest-1", 60, ROUND_2_ID);
    room = completePair(room, "guest-1", 62);
    room = completePair(room, "guest-1", 64);
    const completedState = structuredClone(room.gameState);

    const firstLeave = leaveQuestionGameRoom({ room, userId: "host" });
    room = changed(firstLeave);
    expect(room.players.map(({ id }) => id)).toEqual(["guest-1"]);
    expect(room.gameState).toEqual(completedState);

    const lastLeave = leaveQuestionGameRoom({
      room,
      userId: "guest-1",
      pointAwardSettled: true,
    });
    room = changed(lastLeave);
    expect(room.players).toEqual([]);
    expect(room.gameState).toEqual(completedState);
  });

  it("차례 위반, 예전 라운드, 같은 명령 재전송을 구분한다", () => {
    const room = storyReady();
    const wrongTurn = run(room, "guest-2", "story-submit-question", 20, {
      locale: "ko",
      question: "왜 그런 일이 일어났을까요?",
    });
    expect(wrongTurn.kind).toBe("forbidden");

    const firstInput = {
      locale: "ko",
      question: "왜 그런 일이 일어났을까요?",
    };
    const first = run(room, "guest-1", "story-submit-question", 21, firstInput);
    const asked = changed(first);
    const replay = run(asked, "guest-1", "story-submit-question", 21, firstInput);
    expect(replay.kind).toBe("replayed");

    const stale = run(asked, "host", "story-submit-answer", 22, {
      roundId: uuid(999),
      answer: "아주 오래된 일이기 때문이에요.",
    });
    expect(stale.kind).toBe("conflict");
  });

  it("첫 공유 순환 전에는 조기 종료를 막고 첫 순환 뒤에는 방장 종료를 허용한다", () => {
    let room = storyReady();
    expect(run(room, "host", "end-game-early", 50).kind).toBe("conflict");
    room = completePair(room, "guest-1", 51);
    room = completePair(room, "guest-2", 53, ROUND_2_ID);

    room = changed(run(room, "host", "end-game-early", 55));
    expect(room.status).toBe("ended");
    expect(readStoryDiceState(room.gameState)?.endReason).toBe("host");
  });

  it("술래가 나가면 미완성 질문만 버리고 완료 쌍은 보존한다", () => {
    let room = storyReady(4);
    room = completePair(room, "guest-1", 30);
    room = changed(run(room, "guest-2", "story-submit-question", 32, {
      locale: "ko",
      question: "그다음에는 무슨 일이 생겼을까요?",
    }));

    const left = leaveQuestionGameRoom({
      room,
      userId: "host",
      random: () => 0,
      randomUUID: () => uuid(400),
    });
    const nextRoom = changed(left);
    const state = readStoryDiceState(nextRoom.gameState)!;

    expect(state.taggerId).toBe("guest-1");
    expect(state.pendingQuestion).toBeNull();
    expect(state.pairs).toHaveLength(1);
    expect(state.phase).toBe("question");
  });

  it("준비 단계에서 한 명만 남으면 다음 단계보다 참가자 부족 종료를 먼저 적용한다", () => {
    const room = started(2);
    const left = leaveQuestionGameRoom({ room, userId: "guest-1" });
    const ended = changed(left);

    expect(ended.status).toBe("ended");
    expect(readStoryDiceState(ended.gameState)).toMatchObject({
      phase: "done",
      endReason: "insufficient-players",
      round: 0,
    });
  });

  it("공개 읽기는 도달 불가 상태와 이름 위조를 거절한다", () => {
    const room = storyReady();
    const state = room.gameState as unknown as StoryDiceRoomState;

    expect(readStoryDicePublicState({
      ...state,
      phase: "done",
      endReason: "completed",
    })).toBeNull();
    expect(readStoryDicePublicState({
      ...state,
      players: state.players.map((player, index) =>
        index === 0 ? { ...player, name: "다른 이름" } : player),
    })).toBeNull();
  });
});
