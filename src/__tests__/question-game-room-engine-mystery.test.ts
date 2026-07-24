import { describe, expect, it } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import type { MysteryAnswerResolution } from "@/lib/mystery-box-rules";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
  restartQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import { toPublicGameRoom } from "@/lib/question-game-room-response";
import {
  readMysteryPublicState,
  readMysteryState,
  toPublicMysteryState,
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

function prepareLegacyRoom(waitingRoom = makeWaitingRoom()): GameRoom {
  const room = prepareRoom(waitingRoom);
  const gameState = {
    ...(room.gameState as unknown as MysteryRoomState),
    maxRounds: 20,
  } as Record<string, unknown>;
  delete gameState.playerCountAtStart;
  return { ...room, gameState };
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
    mysteryAnswerResolution?: MysteryAnswerResolution;
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
    ...(options.mysteryAnswerResolution === undefined
      ? {}
      : { mysteryAnswerResolution: options.mysteryAnswerResolution }),
  });
}

function askCurrentPlayer(
  room: GameRoom,
  commandIndex: number,
  nextRoundIndex: number,
  question = "먹을 수 있나요?",
): GameRoom {
  const state = room.gameState as unknown as MysteryRoomState;
  const userId = state.turnOrder[state.currentTurnIdx];
  const player = room.players.find(({ id }) => id === userId);
  if (!player) throw new Error("현재 참가자가 필요합니다");
  return changedRoom(applyMystery(
    room,
    "mystery-ask",
    { locale: "ko", question },
    {
      userId,
      userName: player.name,
      commandIndex,
      nextRoundId: commandId(nextRoundIndex),
    },
  ));
}

describe("미스터리 박스 방 판정기", () => {
  it("일반 시작은 비밀 없는 최신 판정 준비 상태를 만든다", () => {
    const room = startRoom();

    expect(room).toMatchObject({
      status: "playing",
      playId: PLAY_ID,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        stateVersion: 2,
        knowledgeVersion: 5,
        game: "mystery-box",
        phase: "setup",
        round: 0,
        maxRounds: 12,
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

  it("이전 방 상태는 판정 버전 1로 읽어 기존 질문 의미를 유지한다", () => {
    const room = prepareRoom();
    const legacyState = {
      ...(room.gameState as unknown as MysteryRoomState),
      private: { itemId: "sunflower" },
    } as Record<string, unknown>;
    delete legacyState.knowledgeVersion;
    const legacyRoom = { ...room, gameState: legacyState };

    expect(readMysteryState(legacyState)).toMatchObject({ knowledgeVersion: 1 });
    const result = applyMystery(
      legacyRoom,
      "mystery-ask",
      { locale: "ko", question: "나무인가요?" },
    );

    expect(result.kind).toBe("changed");
    if (result.kind !== "changed") return;
    expect(result.room.gameState).toMatchObject({
      knowledgeVersion: 1,
      history: [{ kind: "question", answer: "yes" }],
    });
  });

  it("새 방은 세분화된 사실표로 나무와 풀을 구분한다", () => {
    const room = prepareRoom();
    const currentRoom = {
      ...room,
      gameState: {
        ...(room.gameState as unknown as MysteryRoomState),
        private: { itemId: "sunflower" },
      },
    };
    const result = applyMystery(
      currentRoom,
      "mystery-ask",
      { locale: "ko", question: "나무인가요?" },
    );

    expect(result.kind).toBe("changed");
    if (result.kind !== "changed") return;
    expect(result.room.gameState).toMatchObject({
      knowledgeVersion: 5,
      history: [{ kind: "question", answer: "no" }],
    });
  });

  it("방장 준비는 서버 물건과 첫 라운드 및 차례를 저장한다", () => {
    const room = prepareRoom();
    const state = room.gameState as unknown as MysteryRoomState;

    expect(state).toMatchObject({
      phase: "play",
      roundId: ROUND_ID,
      round: 1,
      maxRounds: 12,
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

  it("같은 방을 다시 시작하면 이미 나온 정답을 새 순환 전까지 제외한다", () => {
    const first = prepareRoom();
    const firstState = first.gameState as unknown as MysteryRoomState;
    expect(firstState.private?.itemId).toBe("apple");

    const restarted = restartQuestionGameRoom(first);
    const waiting = changedRoom(restarted);
    const started = changedRoom(applyQuestionGameRoomCommand({
      room: waiting,
      userId: "host",
      userName: "Host",
      action: "start",
      body: {
        commandId: commandId(70),
        expectedCreatedAt: waiting.createdAt,
        expectedVersion: waiting.version,
      },
      now: 500,
      random: () => 0,
      randomUUID: () => commandId(71),
    }));
    const second = changedRoom(applyQuestionGameRoomCommand({
      room: started,
      userId: "host",
      userName: "Host",
      action: "mystery-start",
      body: {
        commandId: commandId(72),
        expectedCreatedAt: started.createdAt,
        expectedVersion: started.version,
        playId: started.playId,
      },
      now: 600,
      random: () => 0,
      randomUUID: () => commandId(73),
    }));

    expect((second.gameState as unknown as MysteryRoomState).private?.itemId)
      .not.toBe(firstState.private?.itemId);
  });

  it("참가 인원에 따라 최대 활동 횟수를 시작 시점에 고정한다", () => {
    expect(
      (startRoom(makeWaitingRoom(["host", "guest"])).gameState as unknown as MysteryRoomState)
        .maxRounds,
    ).toBe(12);
    expect(
      (startRoom(makeWaitingRoom([
        "host",
        "guest",
        "third",
        "fourth",
        "fifth",
        "sixth",
        "seventh",
        "eighth",
      ])).gameState as unknown as MysteryRoomState).maxRounds,
    ).toBe(24);
  });

  it("모든 참가자가 질문하고 질문이 세 개 쌓이기 전에는 추측을 막는다", () => {
    let room = prepareRoom();
    const early = applyMystery(
      room,
      "mystery-guess",
      { locale: "ko", guess: "사과" },
    );
    expect(early).toMatchObject({
      kind: "conflict",
      message: "모든 참가자가 질문하고 질문이 세 개 쌓인 뒤 추측할 수 있습니다",
    });

    room = askCurrentPlayer(room, 30, 31);
    room = askCurrentPlayer(room, 32, 33);
    room = askCurrentPlayer(room, 34, 35);
    const state = room.gameState as unknown as MysteryRoomState;
    const userId = state.turnOrder[state.currentTurnIdx];
    const player = room.players.find(({ id }) => id === userId)!;
    const allowed = applyMystery(
      room,
      "mystery-guess",
      { locale: "ko", guess: "사과" },
      { userId, userName: player.name, commandIndex: 36 },
    );

    expect(allowed.kind).toBe("changed");
  });

  it("틀린 추측을 한 참가자는 새 질문을 한 뒤에만 다시 추측한다", () => {
    let room = prepareRoom();
    room = askCurrentPlayer(room, 40, 41);
    room = askCurrentPlayer(room, 42, 43);
    room = askCurrentPlayer(room, 44, 45);

    let state = room.gameState as unknown as MysteryRoomState;
    const guesserId = state.turnOrder[state.currentTurnIdx];
    const guesser = room.players.find(({ id }) => id === guesserId)!;
    room = changedRoom(applyMystery(
      room,
      "mystery-guess",
      { locale: "ko", guess: "강아지" },
      { userId: guesserId, userName: guesser.name, commandIndex: 46 },
    ));
    room = askCurrentPlayer(room, 47, 48);

    state = room.gameState as unknown as MysteryRoomState;
    expect(state.turnOrder[state.currentTurnIdx]).toBe(guesserId);
    const blocked = applyMystery(
      room,
      "mystery-guess",
      { locale: "ko", guess: "책" },
      { userId: guesserId, userName: guesser.name, commandIndex: 49 },
    );
    expect(blocked).toMatchObject({
      kind: "conflict",
      message: "틀린 추측 뒤에는 새 질문을 한 번 써야 다시 추측할 수 있습니다",
    });
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

  it("질문은 한 활동을 쓰고 다음 라운드와 차례로 이동한다", () => {
    const room = prepareRoom();
    const nextRoundId = commandId(91);
    const result = applyMystery(room, "mystery-ask", {
      locale: "ko",
      question: "먹을 수 있나요?",
    }, { nextRoundId });
    const nextRoom = changedRoom(result);
    const state = nextRoom.gameState as unknown as MysteryRoomState;

    expect(state.history).toEqual([{
      kind: "question",
      playerId: "host",
      playerName: "Host",
      locale: "ko",
      question: "먹을 수 있나요?",
      answer: "yes",
    }]);
    expect(state.scores).toEqual({ host: 1, guest: 0 });
    expect(state.currentTurnIdx).toBe(1);
    expect(state.round).toBe(2);
    expect(state.roundId).toBe(nextRoundId);
    expect(state.private).toEqual({ itemId: "apple" });
  });

  it("친구 방에서 사과는 동물 질문에 아니오로 답한다", () => {
    const result = applyMystery(
      prepareRoom(),
      "mystery-ask",
      { locale: "ko", question: "동물인가요?" },
      { nextRoundId: commandId(191) },
    );
    const state = changedRoom(result).gameState as unknown as MysteryRoomState;

    expect(state.private).toEqual({ itemId: "apple" });
    expect(state.history).toEqual([expect.objectContaining({
      question: "동물인가요?",
      answer: "no",
    })]);
  });

  it.each(["작나요?", "크기가 작나요?", "크키가 작나요?", "큰가요?"])(
    "크기 질문 %s은 인공지능 판정 없이 활동으로 기록한다",
    (question) => {
      const result = applyMystery(
        prepareRoom(),
        "mystery-ask",
        { locale: "ko", question },
        { nextRoundId: commandId(192) },
      );

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") return;
      expect(result.room.gameState).toMatchObject({
        currentTurnIdx: 1,
        scores: { host: 1, guest: 0 },
        history: [{ question, answer: question === "큰가요?" ? "no" : "yes" }],
      });
    },
  );

  it("규칙이 모르는 질문은 상태를 바꾸지 않고 해결값을 요청한다", () => {
    const room = prepareRoom();
    const result = applyMystery(
      room,
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      { nextRoundId: commandId(92) },
    );

    expect(result).toMatchObject({
      kind: "resolution-required",
      room,
      resolution: {
        itemId: "apple",
        playerId: "host",
        locale: "ko",
        question: "무슨 소리가 나나요?",
        knowledgeVersion: 5,
      },
    });
    expect(result.room).toBe(room);
    expect(room.gameState).toMatchObject({
      round: 1,
      roundId: ROUND_ID,
      currentTurnIdx: 0,
      history: [],
      scores: { host: 0, guest: 0 },
    });
  });

  it("묶인 해결값은 에이아이 출처와 함께 질문을 한 번 기록한다", () => {
    const room = prepareRoom();
    const nextRoundId = commandId(92);
    const asked = changedRoom(applyMystery(
      room,
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      {
        nextRoundId,
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "무슨 소리가 나나요?",
          knowledgeVersion: 5,
          answer: "no",
          evidence: {
            kind: "dynamic",
            question: "무슨 소리가 나나요?",
            predicate: "내는 소리의 종류",
            answer: "no",
            confidence: "high",
            verification: "independent-agreement",
          },
        },
      },
    ));
    const state = asked.gameState as unknown as MysteryRoomState;

    expect(state).toMatchObject({
      round: 2,
      roundId: nextRoundId,
      currentTurnIdx: 1,
      scores: { host: 1, guest: 0 },
    });
    expect(state.history).toEqual([{
      kind: "question",
      playerId: "host",
      playerName: "Host",
      locale: "ko",
      question: "무슨 소리가 나나요?",
      answer: "no",
      answerSource: "ai",
      answerEvidence: {
        kind: "dynamic",
        question: "무슨 소리가 나나요?",
        predicate: "내는 소리의 종류",
        answer: "no",
        confidence: "high",
        verification: "independent-agreement",
      },
    }]);
    expect(toPublicMysteryState(state)).toHaveProperty(
      "history.0.answerEvidence.kind",
      "dynamic",
    );

    const repeated = applyMystery(
      asked,
      "mystery-guess",
      { locale: "ko", guess: "사과" },
      { commandIndex: 12, nextRoundId: commandId(93) },
    );
    expect(repeated).toMatchObject({ kind: "forbidden", room: asked });
  });

  it("버전 2 방의 기존 인공지능 해결값은 근거 항목 없이도 계속 읽고 적용한다", () => {
    const prepared = prepareRoom();
    const room = {
      ...prepared,
      gameState: {
        ...(prepared.gameState as unknown as MysteryRoomState),
        knowledgeVersion: 2 as const,
      },
    };
    const result = applyMystery(
      room,
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      {
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "무슨 소리가 나나요?",
          knowledgeVersion: 2,
          answer: "yes",
        },
      },
    );

    expect(result.kind).toBe("changed");
  });

  it("인공지능을 사용할 수 없으면 임시 답변 출처와 질문 점수를 저장한다", () => {
    const room = prepareRoom();
    const nextRoundId = commandId(91);
    const asked = changedRoom(applyMystery(
      room,
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      {
        nextRoundId,
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "무슨 소리가 나나요?",
          knowledgeVersion: 5,
          answer: "unknown",
          source: "fallback",
        },
      },
    ));
    const state = asked.gameState as unknown as MysteryRoomState;

    expect(state.history).toEqual([{
      kind: "question",
      playerId: "host",
      playerName: "Host",
      locale: "ko",
      question: "무슨 소리가 나나요?",
      answer: "unknown",
      answerSource: "fallback",
    }]);
    expect(state.scores).toEqual({ host: 1, guest: 0 });
    expect(toPublicMysteryState(state)).toMatchObject({
      history: [{ answerSource: "fallback" }],
    });
  });

  it.each([
    ["물건", { itemId: "book" }],
    ["참가자", { playerId: "guest" }],
    ["언어", { locale: "en" }],
    ["질문", { question: "다른 질문인가요?" }],
    ["답", { answer: "maybe" }],
  ] as const)("%s이 다른 해결값을 사용하지 않는다", (_name, changedBinding) => {
    const room = prepareRoom();
    const result = applyMystery(
      room,
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      {
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "무슨 소리가 나나요?",
          knowledgeVersion: 5,
          answer: "yes",
          evidence: {
            kind: "dynamic",
            question: "무슨 소리가 나나요?",
            predicate: "내는 소리의 종류",
            answer: "yes",
            confidence: "high",
            verification: "independent-agreement",
          },
          ...changedBinding,
        } as unknown as MysteryAnswerResolution,
      },
    );

    expect(result).toMatchObject({ kind: "resolution-required", room });
    expect(result.room).toBe(room);
  });

  it("클라이언트 본문의 답과 출처는 해결값으로 사용하지 않는다", () => {
    const room = prepareRoom();
    const result = applyMystery(room, "mystery-ask", {
      locale: "ko",
      question: "무슨 소리가 나나요?",
      answer: "yes",
      answerSource: "ai",
      mysteryAnswerResolution: {
        itemId: "apple",
        playerId: "host",
        locale: "ko",
        question: "무슨 소리가 나나요?",
        answer: "yes",
      },
    });

    expect(result).toMatchObject({ kind: "resolution-required", room });
  });

  it("규칙이 판정한 질문에는 에이아이 해결값을 적용하지 않는다", () => {
    const room = prepareRoom();
    const nextRoom = changedRoom(applyMystery(
      room,
      "mystery-ask",
      { locale: "ko", question: "먹을 수 있나요?" },
      {
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "먹을 수 있나요?",
          knowledgeVersion: 5,
          answer: "no",
        },
      },
    ));
    const state = nextRoom.gameState as unknown as MysteryRoomState;

    expect(state.history).toEqual([{
      kind: "question",
      playerId: "host",
      playerName: "Host",
      locale: "ko",
      question: "먹을 수 있나요?",
      answer: "yes",
    }]);
  });

  it("질문과 추측을 섞어도 활동마다 라운드와 차례를 한 번만 넘긴다", () => {
    let room = askCurrentPlayer(prepareLegacyRoom(), 70, 170);
    let state = room.gameState as unknown as MysteryRoomState;
    const guest = state.turnOrder[state.currentTurnIdx];
    room = changedRoom(applyMystery(
      room,
      "mystery-guess",
      { locale: "en", guess: "book" },
      {
        userId: guest,
        userName: "Guest",
        commandIndex: 71,
        nextRoundId: commandId(171),
      },
    ));
    room = askCurrentPlayer(room, 72, 172);
    state = room.gameState as unknown as MysteryRoomState;

    expect(state).toMatchObject({
      phase: "play",
      round: 4,
      roundId: commandId(172),
      currentTurnIdx: 1,
      scores: { host: 2, guest: 0 },
    });
    expect(state.history.map(({ kind }) => kind)).toEqual([
      "question",
      "guess",
      "question",
    ]);
  });

  it("틀린 추측은 한 활동을 기록하고 다음 라운드와 차례로 이동한다", () => {
    const room = prepareLegacyRoom();
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
      locale: "en",
      guess: "book",
      correct: false,
    }]);
    expect(state).not.toHaveProperty("winnerId");
    expect(state).not.toHaveProperty("answer");
    expect(state).not.toHaveProperty("endReason");
  });

  it("방장이 아닌 현재 참가자의 정답은 즉시 공개하고 방을 끝낸다", () => {
    const started = prepareLegacyRoom();
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
      locale: "ko",
      guess: "사과",
      correct: true,
    });
  });

  it("스무 번째 오답은 승자 없이 정답을 공개하고 즉시 끝낸다", () => {
    let room = prepareLegacyRoom();
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
      locale: "en",
      guess: "book",
      correct: false,
    });
  });

  it("방장이 아닌 참가자의 스무 번째 질문은 정답을 공개하고 끝낸다", () => {
    let room = prepareLegacyRoom();
    for (let index = 0; index < 19; index += 1) {
      room = askCurrentPlayer(room, 200 + index, 300 + index);
    }
    const beforeLast = room.gameState as unknown as MysteryRoomState;
    expect(beforeLast).toMatchObject({
      phase: "play",
      round: 20,
      currentTurnIdx: 1,
    });
    expect(beforeLast.history).toHaveLength(19);

    const ended = askCurrentPlayer(room, 219, 319);
    const state = ended.gameState as unknown as MysteryRoomState;

    expect(ended.status).toBe("ended");
    expect(state).toMatchObject({
      phase: "done",
      endReason: "completed",
      round: 20,
      currentTurnIdx: 0,
      answer: { ko: "사과", en: "apple" },
    });
    expect(state).not.toHaveProperty("winnerId");
    expect(state.history).toHaveLength(20);
    expect(state.history.at(-1)).toMatchObject({
      kind: "question",
      playerId: "guest",
    });
  });

  it("열아홉 질문 뒤 오답은 스무 번째 활동으로 정답을 공개하고 끝낸다", () => {
    let room = prepareLegacyRoom();
    for (let index = 0; index < 19; index += 1) {
      room = askCurrentPlayer(room, 240 + index, 340 + index);
    }
    const stateBeforeGuess = room.gameState as unknown as MysteryRoomState;
    const userId = stateBeforeGuess.turnOrder[stateBeforeGuess.currentTurnIdx];
    const ended = changedRoom(applyMystery(
      room,
      "mystery-guess",
      { locale: "en", guess: "book" },
      {
        userId,
        userName: "Guest",
        commandIndex: 259,
        nextRoundId: commandId(359),
      },
    ));
    const state = ended.gameState as unknown as MysteryRoomState;

    expect(ended.status).toBe("ended");
    expect(state).toMatchObject({
      phase: "done",
      endReason: "completed",
      round: 20,
      currentTurnIdx: 0,
      answer: { ko: "사과", en: "apple" },
    });
    expect(state.history).toHaveLength(20);
    expect(state.history.at(-1)).toMatchObject({
      kind: "guess",
      playerId: "guest",
      correct: false,
    });
  });

  it("같은 오답 명령 재생은 기록과 라운드를 다시 늘리지 않는다", () => {
    const room = prepareLegacyRoom();
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

  it("같은 질문 명령 재생은 점수와 라운드를 다시 늘리지 않는다", () => {
    const room = prepareRoom();
    const body = {
      commandId: commandId(61),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      roundId: room.gameState.roundId,
      locale: "ko",
      question: "먹을 수 있나요?",
    };
    const input = {
      userId: "host",
      userName: "Host",
      action: "mystery-ask",
      body,
      now: 400,
      random: () => 0,
      randomUUID: () => commandId(121),
    };
    const changed = changedRoom(applyQuestionGameRoomCommand({ room, ...input }));
    const replay = applyQuestionGameRoomCommand({ room: changed, ...input });

    expect(replay).toMatchObject({ kind: "replayed", room: changed });
    const state = replay.room.gameState as unknown as MysteryRoomState;
    expect(state).toMatchObject({
      round: 2,
      currentTurnIdx: 1,
      scores: { host: 1, guest: 0 },
    });
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

  it("상태와 비공개 값 및 기록의 알 수 없는 키를 거절한다", () => {
    const playState = prepareRoom().gameState as unknown as MysteryRoomState;
    const askedRoom = changedRoom(applyMystery(
      prepareLegacyRoom(),
      "mystery-ask",
      { locale: "ko", question: "먹을 수 있나요?" },
      { commandIndex: 61 },
    ));
    const askedState = askedRoom.gameState as unknown as MysteryRoomState;
    const doneRoom = changedRoom(applyMystery(
      prepareLegacyRoom(),
      "mystery-guess",
      { locale: "ko", guess: "사과" },
      { commandIndex: 62 },
    ));
    const doneState = doneRoom.gameState as unknown as MysteryRoomState;

    expect(readMysteryState({ ...playState, itemId: "apple" })).toBeNull();
    expect(readMysteryState({
      ...playState,
      private: { itemId: "apple", copied: "apple" },
    })).toBeNull();
    expect(readMysteryState({
      ...askedState,
      history: [{ ...askedState.history[0], itemId: "apple" }],
    })).toBeNull();
    expect(readMysteryState({
      ...doneState,
      history: [{ ...doneState.history[0], itemId: "apple" }],
    })).toBeNull();
    expect(readMysteryState({
      ...doneState,
      answer: { ...doneState.answer, itemId: "apple" },
    })).toBeNull();
  });

  it("저장 질문의 언어와 판정 결과가 비밀 물건과 맞아야 한다", () => {
    const room = changedRoom(applyMystery(
      prepareLegacyRoom(),
      "mystery-ask",
      { locale: "ko", question: "먹을 수 있나요?" },
      { commandIndex: 63 },
    ));
    const state = room.gameState as unknown as MysteryRoomState;
    const question = state.history[0];

    expect(readMysteryState({
      ...state,
      history: [{ ...question, answer: "no" }],
    })).toBeNull();
    expect(readMysteryState({
      ...state,
      history: [{ ...question, locale: "en" }],
    })).toBeNull();
    expect(readMysteryState(state)).toEqual(state);
  });

  it("기존 출처 없는 기록과 새 에이아이 출처 기록을 함께 읽는다", () => {
    const room = changedRoom(applyMystery(
      prepareRoom(),
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      {
        commandIndex: 67,
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "무슨 소리가 나나요?",
          knowledgeVersion: 5,
          answer: "yes",
          evidence: {
            kind: "dynamic",
            question: "무슨 소리가 나나요?",
            predicate: "내는 소리의 종류",
            answer: "yes",
            confidence: "high",
            verification: "independent-agreement",
          },
        },
      },
    ));
    const state = room.gameState as unknown as MysteryRoomState;
    const aiQuestion = state.history[0];
    const {
      answerSource: _answerSource,
      answerEvidence: _answerEvidence,
      ...legacyQuestion
    } = aiQuestion as typeof aiQuestion & {
      answerSource?: "ai";
      answerEvidence?: unknown;
    };
    const legacyState = {
      ...state,
      history: [{ ...legacyQuestion, answer: "unknown" }],
    };
    const publicRoom = toPublicGameRoom(room);

    expect(readMysteryState(state)).toEqual(state);
    expect(readMysteryState(legacyState)).toEqual(legacyState);
    expect(publicRoom.gameState).toHaveProperty("history.0.answerSource", "ai");
    expect(readMysteryPublicState(publicRoom.gameState)).toEqual(
      publicRoom.gameState,
    );
  });

  it("에이아이 출처는 허용된 값만 읽는다", () => {
    const room = changedRoom(applyMystery(
      prepareRoom(),
      "mystery-ask",
      { locale: "ko", question: "무슨 소리가 나나요?" },
      {
        commandIndex: 68,
        mysteryAnswerResolution: {
          itemId: "apple",
          playerId: "host",
          locale: "ko",
          question: "무슨 소리가 나나요?",
          knowledgeVersion: 5,
          answer: "no",
          evidence: {
            kind: "dynamic",
            question: "무슨 소리가 나나요?",
            predicate: "내는 소리의 종류",
            answer: "no",
            confidence: "high",
            verification: "independent-agreement",
          },
        },
      },
    ));
    const state = room.gameState as unknown as MysteryRoomState;
    const question = state.history[0];

    expect(readMysteryState({
      ...state,
      history: [{ ...question, answerSource: "model" }],
    })).toBeNull();
  });

  it("저장 추측의 언어와 정오가 비밀 물건과 맞아야 한다", () => {
    const wrongRoom = changedRoom(applyMystery(
      prepareLegacyRoom(),
      "mystery-guess",
      { locale: "en", guess: "book" },
      { commandIndex: 64, nextRoundId: commandId(130) },
    ));
    const wrongState = wrongRoom.gameState as unknown as MysteryRoomState;
    const wrongGuess = wrongState.history[0];
    const correctRoom = changedRoom(applyMystery(
      prepareLegacyRoom(),
      "mystery-guess",
      { locale: "ko", guess: "사과" },
      { commandIndex: 65 },
    ));
    const correctState = correctRoom.gameState as unknown as MysteryRoomState;
    const correctGuess = correctState.history[0];

    expect(readMysteryState({
      ...wrongState,
      history: [{ ...wrongGuess, guess: "apple" }],
    })).toBeNull();
    expect(readMysteryState({
      ...correctState,
      history: [{ ...correctGuess, guess: "책" }],
    })).toBeNull();
  });

  it("정답 추측 뒤에 질문 기록을 붙인 상태를 거절한다", () => {
    const room = changedRoom(applyMystery(
      prepareLegacyRoom(),
      "mystery-guess",
      { locale: "ko", guess: "사과" },
      { commandIndex: 66 },
    ));
    const state = room.gameState as unknown as MysteryRoomState;

    expect(readMysteryState({
      ...state,
      history: [
        ...state.history,
        {
          kind: "question",
          playerId: "host",
          playerName: "Host",
          locale: "ko",
          question: "날 수 있나요?",
          answer: "no",
        },
      ],
      scores: { host: 1, guest: 0 },
    })).toBeNull();
  });

  it.each([
    ["점수 키 누락", { host: 0 }],
    ["점수 키 추가", { host: 0, guest: 0, copied: 0 }],
  ])("%s 상태를 거절한다", (_name, scores) => {
    const state = prepareRoom().gameState as unknown as MysteryRoomState;

    expect(readMysteryState({ ...state, scores })).toBeNull();
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

  it.each([
    ["빠진 참가자", ["guest", "third"], { guest: 0, third: 0 }],
    [
      "차례에만 빠진 참가자",
      ["guest", "third"],
      { host: 0, guest: 0, third: 0 },
    ],
    [
      "중복 차례",
      ["host", "guest", "guest"],
      { host: 0, guest: 0, third: 0 },
    ],
    [
      "차례에 중복된 이탈자",
      ["host", "host", "guest", "third"],
      { host: 0, guest: 0, third: 0 },
    ],
  ] as const)("%s 상태를 이탈 중에 복원하지 않는다", (_name, turnOrder, scores) => {
    const room = prepareRoom(makeWaitingRoom(["host", "guest", "third"]));
    const corruptRoom: GameRoom = {
      ...room,
      gameState: {
        ...room.gameState,
        turnOrder: [...turnOrder],
        currentTurnIdx: 0,
        scores: { ...scores },
      },
    };

    const result = leaveQuestionGameRoom({ room: corruptRoom, userId: "host" });

    expect(result).toMatchObject({ kind: "corrupt", room: corruptRoom });
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
