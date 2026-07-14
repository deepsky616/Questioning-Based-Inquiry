import { describe, expect, it } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import { toPublicGameRoom } from "@/lib/question-game-room-response";
import {
  readMysteryPublicState,
  readMysteryState,
  type MysteryRoomState,
} from "@/lib/question-game-room-engines/mystery";

const START_COMMAND_ID = "11111111-1111-4111-8111-111111111111";
const PREPARE_COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const PLAY_ID = "33333333-3333-4333-8333-333333333333";
const ROUND_ID = "44444444-4444-4444-8444-444444444444";

function makeWaitingRoom(
  playerIds: string[] = ["host", "guest"],
): GameRoom {
  return {
    code: "1234",
    gameId: "mystery-box",
    hostId: "host",
    status: "waiting",
    players: playerIds.map((id, index) => ({
      id,
      name: id[0].toUpperCase() + id.slice(1),
      isHost: index === 0,
      joinedAt: index + 1,
    })),
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 100,
    updatedAt: 100,
  };
}

function changedRoom(
  result: ReturnType<typeof applyQuestionGameRoomCommand>,
): GameRoom {
  expect(result.kind).toBe("changed");
  if (result.kind !== "changed") throw new Error("changed 결과가 필요합니다");
  return result.room;
}

function startRoom(waitingRoom = makeWaitingRoom()): GameRoom {
  return changedRoom(applyQuestionGameRoomCommand({
    room: waitingRoom,
    userId: "host",
    userName: "Host",
    action: "start",
    body: {
      commandId: START_COMMAND_ID,
      expectedCreatedAt: 100,
      expectedVersion: 1,
    },
    now: 200,
    random: () => 0,
    randomUUID: () => PLAY_ID,
  }));
}

function prepareRoom(waitingRoom = makeWaitingRoom()): GameRoom {
  const started = startRoom(waitingRoom);
  return changedRoom(applyQuestionGameRoomCommand({
    room: started,
    userId: "host",
    userName: "Host",
    action: "mystery-start",
    body: {
      commandId: PREPARE_COMMAND_ID,
      expectedCreatedAt: started.createdAt,
      expectedVersion: started.version,
      playId: started.playId,
    },
    now: 300,
    random: () => 0,
    randomUUID: () => ROUND_ID,
  }));
}

function commandId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function applyMystery(
  room: GameRoom,
  action: "mystery-ask" | "mystery-guess",
  body: Record<string, unknown>,
  options: {
    userId?: string;
    userName?: string;
    commandIndex?: number;
    nextRoundId?: string;
  } = {},
) {
  return applyQuestionGameRoomCommand({
    room,
    userId: options.userId ?? "host",
    userName: options.userName ?? "Host",
    action,
    body: {
      commandId: commandId(options.commandIndex ?? 10),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      roundId: room.gameState.roundId,
      ...body,
    },
    now: 400,
    random: () => 0,
    randomUUID: () => options.nextRoundId ?? commandId(90),
  });
}

describe("미스터리 박스 방 판정기", () => {
  it("일반 시작은 비밀 없는 버전 2 준비 상태를 만든다", () => {
    const room = startRoom();

    expect(room).toMatchObject({
      status: "playing",
      playId: PLAY_ID,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        stateVersion: 2,
        game: "mystery-box",
        phase: "setup",
        round: 0,
        maxRounds: 20,
        turnOrder: [],
        currentTurnIdx: 0,
        history: [],
        scores: {},
        recentCommandIds: [START_COMMAND_ID],
      },
    });
    expect(room.gameState).not.toHaveProperty("private");
    expect(room.gameState).not.toHaveProperty("roundId");
  });

  it("방장 준비는 서버 물건과 첫 라운드 및 차례를 저장한다", () => {
    const room = prepareRoom();
    const state = room.gameState as unknown as MysteryRoomState;

    expect(state).toMatchObject({
      phase: "play",
      roundId: ROUND_ID,
      round: 1,
      maxRounds: 20,
      turnOrder: ["host", "guest"],
      currentTurnIdx: 0,
      history: [],
      scores: { host: 0, guest: 0 },
      private: { itemId: "apple" },
      recentCommandIds: [START_COMMAND_ID, PREPARE_COMMAND_ID],
    });
    expect(state).not.toHaveProperty("answer");
    expect(JSON.stringify(state)).not.toContain("사과");
  });

  it("비방장은 미스터리 물건을 준비할 수 없다", () => {
    const started = startRoom();
    const result = applyQuestionGameRoomCommand({
      room: started,
      userId: "guest",
      userName: "Guest",
      action: "mystery-start",
      body: {
        commandId: commandId(5),
        expectedCreatedAt: started.createdAt,
        expectedVersion: started.version,
        playId: started.playId,
      },
      now: 300,
      random: () => 0,
      randomUUID: () => ROUND_ID,
    });

    expect(result).toMatchObject({ kind: "forbidden", room: started });
  });

  it.each(["mystery-ask", "mystery-guess"] as const)(
    "차례 밖 %s 명령을 거절한다",
    (action) => {
      const room = prepareRoom();
      const result = applyMystery(
        room,
        action,
        action === "mystery-ask"
          ? { locale: "ko", question: "먹을 수 있나요?" }
          : { locale: "ko", guess: "사과" },
        { userId: "guest", userName: "Guest", commandIndex: 6 },
      );

      expect(result).toMatchObject({ kind: "forbidden", room });
    },
  );

  it("질문은 기록과 질문자 점수만 바꾸고 차례와 활동은 유지한다", () => {
    const room = prepareRoom();
    const result = applyMystery(room, "mystery-ask", {
      locale: "ko",
      question: "먹을 수 있나요?",
    });
    const nextRoom = changedRoom(result);
    const state = nextRoom.gameState as unknown as MysteryRoomState;

    expect(state.history).toEqual([{
      kind: "question",
      playerId: "host",
      playerName: "Host",
      question: "먹을 수 있나요?",
      answer: "yes",
    }]);
    expect(state.scores).toEqual({ host: 1, guest: 0 });
    expect(state.currentTurnIdx).toBe(0);
    expect(state.round).toBe(1);
    expect(state.roundId).toBe(ROUND_ID);
    expect(state.private).toEqual({ itemId: "apple" });
  });

  it("틀린 추측은 한 활동을 기록하고 다음 라운드와 차례로 이동한다", () => {
    const room = prepareRoom();
    const nextRoundId = commandId(91);
    const result = applyMystery(
      room,
      "mystery-guess",
      { locale: "en", guess: "book" },
      { nextRoundId },
    );
    const nextRoom = changedRoom(result);
    const state = nextRoom.gameState as unknown as MysteryRoomState;

    expect(nextRoom.status).toBe("playing");
    expect(state).toMatchObject({
      phase: "play",
      round: 2,
      roundId: nextRoundId,
      currentTurnIdx: 1,
      scores: { host: 0, guest: 0 },
      private: { itemId: "apple" },
    });
    expect(state.history).toEqual([{
      kind: "guess",
      playerId: "host",
      playerName: "Host",
      guess: "book",
      correct: false,
    }]);
    expect(state).not.toHaveProperty("winnerId");
    expect(state).not.toHaveProperty("answer");
    expect(state).not.toHaveProperty("endReason");
  });

  it("방장이 아닌 현재 참가자의 정답은 즉시 공개하고 방을 끝낸다", () => {
    const started = prepareRoom();
    const secondRoundId = commandId(91);
    const afterMiss = changedRoom(applyMystery(
      started,
      "mystery-guess",
      { locale: "en", guess: "book" },
      { nextRoundId: secondRoundId },
    ));
    const result = applyMystery(
      afterMiss,
      "mystery-guess",
      { locale: "ko", guess: "  사과  " },
      { userId: "guest", userName: "Guest", commandIndex: 11 },
    );
    const room = changedRoom(result);
    const state = room.gameState as unknown as MysteryRoomState;

    expect(room.status).toBe("ended");
    expect(state).toMatchObject({
      phase: "done",
      endReason: "completed",
      round: 2,
      roundId: secondRoundId,
      currentTurnIdx: 1,
      winnerId: "guest",
      answer: { ko: "사과", en: "apple" },
      private: { itemId: "apple" },
      scores: { host: 0, guest: 0 },
    });
    expect(state.history.at(-1)).toEqual({
      kind: "guess",
      playerId: "guest",
      playerName: "Guest",
      guess: "사과",
      correct: true,
    });
  });

  it("스무 번째 오답은 승자 없이 정답을 공개하고 즉시 끝낸다", () => {
    let room = prepareRoom();
    for (let index = 0; index < 19; index += 1) {
      const state = room.gameState as unknown as MysteryRoomState;
      const userId = state.turnOrder[state.currentTurnIdx];
      room = changedRoom(applyMystery(
        room,
        "mystery-guess",
        { locale: "en", guess: "book" },
        {
          userId,
          userName: userId === "host" ? "Host" : "Guest",
          commandIndex: 20 + index,
          nextRoundId: commandId(100 + index),
        },
      ));
    }
    const beforeLast = room.gameState as unknown as MysteryRoomState;
    expect(beforeLast).toMatchObject({
      phase: "play",
      round: 20,
      currentTurnIdx: 1,
    });
    expect(beforeLast.history.filter(({ kind }) => kind === "guess")).toHaveLength(19);

    const userId = beforeLast.turnOrder[beforeLast.currentTurnIdx];
    const result = applyMystery(
      room,
      "mystery-guess",
      { locale: "en", guess: "book" },
      { userId, userName: "Guest", commandIndex: 50 },
    );
    const ended = changedRoom(result);
    const state = ended.gameState as unknown as MysteryRoomState;

    expect(ended.status).toBe("ended");
    expect(state).toMatchObject({
      phase: "done",
      endReason: "completed",
      round: 20,
      currentTurnIdx: 0,
      answer: { ko: "사과", en: "apple" },
      private: { itemId: "apple" },
    });
    expect(state).not.toHaveProperty("winnerId");
    expect(state.history.filter(({ kind }) => kind === "guess")).toHaveLength(20);
    expect(state.history.at(-1)).toMatchObject({
      kind: "guess",
      playerId: "guest",
      guess: "book",
      correct: false,
    });
  });

  it("같은 오답 명령 재생은 기록과 라운드를 다시 늘리지 않는다", () => {
    const room = prepareRoom();
    const body = {
      commandId: commandId(60),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      roundId: room.gameState.roundId,
      locale: "en",
      guess: "book",
    };
    const input = {
      userId: "host",
      userName: "Host",
      action: "mystery-guess",
      body,
      now: 400,
      random: () => 0,
      randomUUID: () => commandId(120),
    };
    const changed = changedRoom(applyQuestionGameRoomCommand({ room, ...input }));
    const replay = applyQuestionGameRoomCommand({ room: changed, ...input });

    expect(replay).toMatchObject({ kind: "replayed", room: changed });
    const state = replay.room.gameState as unknown as MysteryRoomState;
    expect(state.round).toBe(2);
    expect(state.history).toHaveLength(1);
    expect(state.recentCommandIds.filter((id) => id === body.commandId)).toHaveLength(1);
  });

  it("저장 상태를 다시 읽어도 서버 물건과 라운드는 바뀌지 않는다", () => {
    const room = prepareRoom();
    const stored = structuredClone(room.gameState);

    expect(readMysteryState(stored)).toEqual(room.gameState);
    expect(stored).toMatchObject({
      roundId: ROUND_ID,
      round: 1,
      private: { itemId: "apple" },
    });
  });

  it.each([
    ["비공개 물건 누락", (state: MysteryRoomState) => {
      const { private: _private, ...withoutPrivate } = state;
      return withoutPrivate;
    }],
    ["활동 수와 다른 라운드", (state: MysteryRoomState) => ({
      ...state,
      round: 2,
    })],
    ["차례 범위를 벗어난 위치", (state: MysteryRoomState) => ({
      ...state,
      currentTurnIdx: state.turnOrder.length,
    })],
    ["질문 기록과 다른 점수", (state: MysteryRoomState) => ({
      ...state,
      scores: { host: 1, guest: 0 },
    })],
    ["진행 중 공개 정답", (state: MysteryRoomState) => ({
      ...state,
      answer: { ko: "사과", en: "apple" },
    })],
    ["알 수 없는 비공개 물건", (state: MysteryRoomState) => ({
      ...state,
      private: { itemId: "missing" },
    })],
  ] as const)("%s 상태를 거절한다", (_name, makeInvalid) => {
    const state = prepareRoom().gameState as unknown as MysteryRoomState;

    expect(readMysteryState(makeInvalid(state))).toBeNull();
  });

  it("현재 참가자 이탈은 다음 활성 참가자와 점수만 남긴다", () => {
    const room = prepareRoom(makeWaitingRoom(["host", "guest", "third"]));
    const result = leaveQuestionGameRoom({ room, userId: "host" });
    const left = changedRoom(result);
    const state = left.gameState as unknown as MysteryRoomState;

    expect(left).toMatchObject({
      hostId: "guest",
      status: "playing",
      players: [
        { id: "guest", isHost: true },
        { id: "third", isHost: false },
      ],
    });
    expect(state).toMatchObject({
      phase: "play",
      turnOrder: ["guest", "third"],
      currentTurnIdx: 0,
      private: { itemId: "apple" },
    });
    expect(state.scores).toEqual({ guest: 0, third: 0 });
  });

  it("한 명만 남으면 승자 없이 끝내고 정답을 공개한다", () => {
    const room = prepareRoom();
    const result = leaveQuestionGameRoom({ room, userId: "guest" });
    const left = changedRoom(result);
    const state = left.gameState as unknown as MysteryRoomState;

    expect(left.status).toBe("ended");
    expect(state).toMatchObject({
      phase: "done",
      endReason: "insufficient-players",
      turnOrder: ["host"],
      currentTurnIdx: 0,
      answer: { ko: "사과", en: "apple" },
      private: { itemId: "apple" },
    });
    expect(state.scores).toEqual({ host: 0 });
    expect(state).not.toHaveProperty("winnerId");
  });

  it("물건 준비 전 한 명만 남은 종료 상태도 안전하게 다시 읽는다", () => {
    const room = startRoom();
    const result = leaveQuestionGameRoom({ room, userId: "guest" });
    const left = changedRoom(result);

    expect(left.status).toBe("ended");
    expect(left.gameState).toMatchObject({
      phase: "done",
      endReason: "insufficient-players",
      round: 0,
      turnOrder: [],
      scores: {},
    });
    expect(left.gameState).not.toHaveProperty("roundId");
    expect(left.gameState).not.toHaveProperty("private");
    expect(left.gameState).not.toHaveProperty("answer");
    expect(readMysteryState(left.gameState)).toEqual(left.gameState);
  });

  it("공개 상태는 원본을 바꾸지 않고 비공개 식별값만 제거한다", () => {
    const room = prepareRoom();
    const publicRoom = toPublicGameRoom(room);

    expect(publicRoom.gameState).not.toHaveProperty("private");
    expect(publicRoom.gameState).not.toHaveProperty("answer");
    expect(room.gameState).toHaveProperty("private.itemId", "apple");
    expect(readMysteryState(room.gameState)).not.toBeNull();
    expect(readMysteryState(publicRoom.gameState)).toBeNull();
    expect(readMysteryPublicState(publicRoom.gameState)).toEqual(
      publicRoom.gameState,
    );
    expect(readMysteryPublicState(room.gameState)).toBeNull();
  });
});
