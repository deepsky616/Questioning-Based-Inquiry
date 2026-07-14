import { describe, expect, it } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import {
  applyMemoryCommand,
  createMemoryState,
  type MemoryRoomState,
} from "@/lib/question-game-room-engines/memory";

const COMMAND_ID = "11111111-1111-4111-8111-111111111111";
const PLAY_ID = "22222222-2222-4222-8222-222222222222";
const ROUND_ID = "33333333-3333-4333-8333-333333333333";

function makeWaitingRoom(): GameRoom {
  return {
    code: "1234",
    gameId: "memory",
    hostId: "host",
    status: "waiting",
    players: [
      { id: "host", name: "Host", isHost: true, joinedAt: 1 },
      { id: "guest", name: "Guest", isHost: false, joinedAt: 2 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 100,
    updatedAt: 100,
  };
}

function makePlayingRoom(
  state: MemoryRoomState = createMemoryState(),
  playerIds = ["host", "guest"],
): GameRoom {
  return {
    ...makeWaitingRoom(),
    status: "playing",
    players: playerIds.map((id, index) => ({
      id,
      name: id,
      isHost: index === 0,
      joinedAt: index + 1,
    })),
    gameState: state,
    playId: PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
  };
}

function makePairs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `client-${index}`,
    question: `질문 ${index + 1}?`,
    answer: `대답 ${index + 1}`,
  }));
}

function uuidAt(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function uuidSequence(start = 1): () => string {
  let index = start;
  return () => uuidAt(index++);
}

function applyMemory(
  room: GameRoom,
  action: string,
  body: Record<string, unknown> = {},
  options: {
    userId?: string;
    now?: number;
    random?: () => number;
    randomUUID?: () => string;
  } = {},
) {
  return applyMemoryCommand({
    room,
    state: room.gameState as MemoryRoomState,
    userId: options.userId ?? "host",
    userName: options.userId ?? "host",
    action,
    body,
    now: options.now ?? 1_000,
    random: options.random ?? (() => 0),
    randomUUID: options.randomUUID ?? uuidSequence(),
  });
}

function changedRoom(result: ReturnType<typeof applyMemory>): GameRoom {
  expect(result.kind).toBe("changed");
  if (result.kind !== "changed") throw new Error("changed 결과가 필요합니다");
  return result.room;
}

function makePlayState(
  overrides: Partial<MemoryRoomState> = {},
): MemoryRoomState {
  const pairCount = 6;
  const pairs = Array.from({ length: pairCount }, (_, index) => ({
    id: `pair-${index}`,
    question: `질문 ${index + 1}?`,
    answer: `대답 ${index + 1}`,
  }));
  return {
    ...createMemoryState(),
    phase: "play",
    roundId: ROUND_ID,
    difficulty: "easy",
    pairs,
    qCards: pairs.map(({ id }, index) => ({
      id: `q-${index}`,
      pairId: id,
      type: "q",
    })),
    aCards: pairs.map(({ id }, index) => ({
      id: `a-${index}`,
      pairId: id,
      type: "a",
    })),
    diceRolls: { host: 6, guest: 5 },
    turnOrder: ["host", "guest"],
    currentTurnIdx: 0,
    scores: { host: 0, guest: 0 },
    attempts: 0,
    maxAttempts: 18,
    ...overrides,
  };
}

describe("질문-대답 짝 찾기 방 판정기", () => {
  it("새 방 시작은 서버가 버전 2 준비 상태를 만든다", () => {
    const result = applyQuestionGameRoomCommand({
      room: makeWaitingRoom(),
      userId: "host",
      userName: "Host",
      action: "start",
      body: {
        commandId: COMMAND_ID,
        expectedCreatedAt: 100,
        expectedVersion: 1,
      },
      now: 200,
      random: () => 0.5,
      randomUUID: () => PLAY_ID,
    });

    expect(result).toMatchObject({
      kind: "changed",
      room: {
        status: "playing",
        playId: PLAY_ID,
        gameState: {
          stateVersion: 2,
          game: "memory",
          phase: "setup",
          recentCommandIds: [COMMAND_ID],
        },
      },
    });
  });

  describe("카드 준비", () => {
    it.each([
      ["easy", 6, 18],
      ["normal", 10, 30],
      ["hard", 15, 45],
    ] as const)(
      "%s 난이도는 서버가 %i쌍과 최대 %i시도를 만든다",
      (difficulty, pairCount, maxAttempts) => {
        const room = makePlayingRoom();
        const pairs = makePairs(pairCount);
        const result = applyMemory(
          room,
          "memory-prepare",
          {
            difficulty,
            pairs,
            qCards: [{ id: "client-question-card" }],
            aCards: [{ id: "client-answer-card" }],
            diceRolls: { host: 6 },
            roundId: "client-round",
          },
          { random: () => 0, randomUUID: uuidSequence() },
        );

        const nextRoom = changedRoom(result);
        const state = nextRoom.gameState as MemoryRoomState;
        expect(state).toMatchObject({
          phase: "rolling",
          difficulty,
          attempts: 0,
          maxAttempts,
          diceRolls: {},
          turnOrder: [],
          scores: { host: 0, guest: 0 },
        });
        expect(state.pairs).toHaveLength(pairCount);
        expect(state.qCards).toHaveLength(pairCount);
        expect(state.aCards).toHaveLength(pairCount);
        expect(state.roundId).not.toBe("client-round");
        expect(state.qCards.map(({ id }) => id)).not.toContain(
          "client-question-card",
        );
        expect(state.aCards.map(({ id }) => id)).not.toContain(
          "client-answer-card",
        );
        expect(new Set([
          ...state.qCards.map(({ id }) => id),
          ...state.aCards.map(({ id }) => id),
        ]).size).toBe(pairCount * 2);
        expect(state.pairs.map(({ id }) => id)).not.toEqual(
          pairs.map(({ id }) => id),
        );
      },
    );

    it("방장이 아닌 참가자의 준비를 거절한다", () => {
      const result = applyMemory(
        makePlayingRoom(),
        "memory-prepare",
        { difficulty: "easy", pairs: makePairs(6) },
        { userId: "guest" },
      );

      expect(result).toMatchObject({ kind: "forbidden" });
    });

    it.each([
      ["쌍 수", { difficulty: "easy", pairs: makePairs(5) }],
      [
        "질문 길이",
        {
          difficulty: "easy",
          pairs: [
            { ...makePairs(6)[0], question: "가".repeat(201) },
            ...makePairs(6).slice(1),
          ],
        },
      ],
      [
        "대답 길이",
        {
          difficulty: "easy",
          pairs: [
            { ...makePairs(6)[0], answer: "가".repeat(501) },
            ...makePairs(6).slice(1),
          ],
        },
      ],
    ])("잘못된 %s를 거절한다", (_name, body) => {
      const room = makePlayingRoom();

      const result = applyMemory(room, "memory-prepare", body);

      expect(result).toMatchObject({ kind: "invalid", room });
    });
  });

  describe("주사위 차례", () => {
    it("클라이언트 눈을 무시하고 모든 참가자가 굴린 뒤 같은 눈 순서를 안정적으로 정한다", () => {
      let room = makePlayingRoom(
        createMemoryState(),
        ["host", "guest", "third"],
      );
      room = changedRoom(applyMemory(
        room,
        "memory-prepare",
        { difficulty: "easy", pairs: makePairs(6) },
        { randomUUID: uuidSequence() },
      ));

      const first = applyMemory(
        room,
        "memory-roll",
        { roll: 1 },
        { random: () => 0.7 },
      );
      expect(first).toMatchObject({
        kind: "changed",
        result: { roll: 5, replayed: false },
      });
      room = changedRoom(first);

      const second = applyMemory(
        room,
        "memory-roll",
        { roll: 1 },
        { userId: "guest", random: () => 0.7 },
      );
      room = changedRoom(second);
      const repeated = applyMemory(
        room,
        "memory-roll",
        { roll: 6 },
        { userId: "guest", random: () => 0 },
      );
      expect(repeated).toMatchObject({
        kind: "replayed",
        result: { roll: 5, replayed: true },
      });

      const last = applyMemory(
        room,
        "memory-roll",
        { roll: 6 },
        { userId: "third", random: () => 0 },
      );
      const finalState = changedRoom(last).gameState as MemoryRoomState;
      expect(finalState).toMatchObject({
        phase: "play",
        diceRolls: { host: 5, guest: 5, third: 1 },
        turnOrder: ["host", "guest", "third"],
        currentTurnIdx: 0,
      });
    });
  });

  describe("카드 차례와 짝 판정", () => {
    it("현재 참가자가 질문 카드 뒤에 대답 카드를 뒤집어야 한다", () => {
      const room = makePlayingRoom(makePlayState());

      expect(applyMemory(
        room,
        "memory-flip",
        { cardId: "q-0" },
        { userId: "guest" },
      )).toMatchObject({ kind: "forbidden", room });
      expect(applyMemory(
        room,
        "memory-flip",
        { cardId: "a-0" },
      )).toMatchObject({ kind: "invalid", room });

      const firstRoom = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "q-0" },
      ));
      expect(firstRoom.gameState).toMatchObject({ revealedIds: ["q-0"] });
      expect(applyMemory(
        firstRoom,
        "memory-flip",
        { cardId: "q-1" },
      )).toMatchObject({ kind: "invalid", room: firstRoom });
    });

    it("맞는 짝은 점수와 시도를 올리고 같은 참가자가 계속한다", () => {
      let room = makePlayingRoom(makePlayState());
      room = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "q-0" },
      ));
      room = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "a-0", revealId: "client-reveal" },
        { randomUUID: () => uuidAt(90) },
      ));

      expect(room.gameState).toMatchObject({
        attempts: 1,
        takenIds: ["q-0", "a-0"],
        revealedIds: [],
        scores: { host: 1, guest: 0 },
        currentTurnIdx: 0,
        lastReveal: {
          revealId: uuidAt(90),
          result: "match",
          turnPlayerId: "host",
        },
      });
      expect(room.gameState).not.toMatchObject({
        lastReveal: { revealId: "client-reveal" },
      });

      const extraTurn = applyMemory(
        room,
        "memory-flip",
        { cardId: "q-1" },
      );
      expect(extraTurn).toMatchObject({
        kind: "changed",
        room: { gameState: { revealedIds: ["q-1"] } },
      });
    });

    it("방장이 아닌 참가자가 마지막 짝을 맞혀도 즉시 끝낸다", () => {
      const takenIds = Array.from({ length: 5 }, (_, index) => [
        `q-${index}`,
        `a-${index}`,
      ]).flat();
      const state = makePlayState({
        turnOrder: ["guest", "host"],
        diceRolls: { guest: 6, host: 5 },
        takenIds,
        scores: { host: 5, guest: 0 },
      });
      let room = makePlayingRoom(state);
      room = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "q-5" },
        { userId: "guest" },
      ));
      const result = applyMemory(
        room,
        "memory-flip",
        { cardId: "a-5" },
        { userId: "guest", randomUUID: () => uuidAt(91) },
      );

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          status: "ended",
          gameState: {
            phase: "done",
            endReason: "completed",
            scores: { host: 5, guest: 1 },
            attempts: 1,
          },
        },
      });
    });
  });

  describe("실패 공개와 복원", () => {
    function missAtLastAttempt() {
      let room = makePlayingRoom(makePlayState({ attempts: 17 }));
      room = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "q-0" },
      ));
      const missed = applyMemory(
        room,
        "memory-flip",
        { cardId: "a-1", revealId: "client-reveal" },
        { now: 1_000, randomUUID: () => uuidAt(92) },
      );
      return changedRoom(missed);
    }

    it("틀린 짝은 서버 시각으로 이천오백 밀리초 동안 새 뒤집기를 막는다", () => {
      const missedRoom = missAtLastAttempt();

      expect(missedRoom).toMatchObject({
        status: "playing",
        gameState: {
          attempts: 18,
          revealedIds: ["q-0", "a-1"],
          lastReveal: {
            revealId: uuidAt(92),
            result: "miss",
            turnPlayerId: "host",
            resolveAt: 3_500,
          },
        },
      });
      expect(applyMemory(
        missedRoom,
        "memory-flip",
        { cardId: "q-1" },
      )).toMatchObject({ kind: "conflict", room: missedRoom });
    });

    it("마감 전 복원은 남은 시간을 돌려주고 방을 바꾸지 않는다", () => {
      const missedRoom = missAtLastAttempt();

      const result = applyMemory(
        missedRoom,
        "memory-resolve-miss",
        { revealId: uuidAt(92) },
        { userId: "guest", now: 1_100 },
      );

      expect(result).toMatchObject({
        kind: "replayed",
        room: missedRoom,
        result: { retryAfterMs: 2_400 },
      });
      expect(Number.isInteger(
        result.kind === "replayed" ? result.result?.retryAfterMs : undefined,
      )).toBe(true);
    });

    it("마지막 실패는 마감 뒤 남은 짝을 공개하고 완료하며 중복 복원은 재생한다", () => {
      const missedRoom = missAtLastAttempt();
      const resolved = applyMemory(
        missedRoom,
        "memory-resolve-miss",
        { revealId: uuidAt(92) },
        { userId: "guest", now: 3_500 },
      );
      const resolvedRoom = changedRoom(resolved);

      expect(resolvedRoom).toMatchObject({
        status: "ended",
        gameState: {
          phase: "done",
          endReason: "completed",
          lastReveal: null,
          lastResolvedRevealId: uuidAt(92),
        },
      });
      expect(
        (resolvedRoom.gameState as MemoryRoomState).revealedIds,
      ).toEqual([
        "q-0", "q-1", "q-2", "q-3", "q-4", "q-5",
        "a-0", "a-1", "a-2", "a-3", "a-4", "a-5",
      ]);
      expect(applyMemory(
        resolvedRoom,
        "memory-resolve-miss",
        { revealId: uuidAt(92) },
        { userId: "host", now: 3_600 },
      )).toMatchObject({ kind: "replayed", room: resolvedRoom });
    });

    it("일반 실패는 마감 뒤 정확히 한 번 다음 차례로 넘긴다", () => {
      let room = makePlayingRoom(makePlayState());
      room = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "q-0" },
      ));
      const missedRoom = changedRoom(applyMemory(
        room,
        "memory-flip",
        { cardId: "a-1" },
        { now: 10, randomUUID: () => uuidAt(93) },
      ));
      const resolvedRoom = changedRoom(applyMemory(
        missedRoom,
        "memory-resolve-miss",
        { revealId: uuidAt(93) },
        { userId: "guest", now: 2_510 },
      ));

      expect(resolvedRoom.gameState).toMatchObject({
        currentTurnIdx: 1,
        revealedIds: [],
        lastReveal: null,
        lastResolvedRevealId: uuidAt(93),
      });
      expect(applyMemory(
        resolvedRoom,
        "memory-resolve-miss",
        { revealId: uuidAt(93) },
        { userId: "host", now: 2_600 },
      )).toMatchObject({ kind: "replayed", room: resolvedRoom });
    });

    it("다음 실패 공개 뒤 도착한 이전 복원 요청도 재생 성공이다", () => {
      const state = makePlayState({
        revealedIds: ["q-0", "a-1"],
        lastResolvedRevealId: uuidAt(97),
        lastReveal: {
          revealId: uuidAt(98),
          result: "miss",
          turnPlayerId: "host",
          resolveAt: 4_000,
        },
      });
      const room = makePlayingRoom(state);

      expect(applyMemory(
        room,
        "memory-resolve-miss",
        { revealId: uuidAt(97) },
        { userId: "guest", now: 2_000 },
      )).toMatchObject({ kind: "replayed", room });
    });
  });

  describe("멱등 처리와 참가자 이탈", () => {
    it("같은 카드 명령 식별값은 공개 카드를 중복 반영하지 않는다", () => {
      const room = makePlayingRoom(makePlayState());
      const body = {
        commandId: COMMAND_ID,
        expectedCreatedAt: room.createdAt,
        expectedVersion: room.version,
        playId: PLAY_ID,
        roundId: ROUND_ID,
        cardId: "q-0",
      };

      const first = applyQuestionGameRoomCommand({
        room,
        userId: "host",
        userName: "host",
        action: "memory-flip",
        body,
        now: 1_000,
        random: () => 0,
        randomUUID: () => uuidAt(94),
      });
      expect(first.kind).toBe("changed");
      const firstRoom = first.room;
      const replayed = applyQuestionGameRoomCommand({
        room: firstRoom,
        userId: "host",
        userName: "host",
        action: "memory-flip",
        body,
        now: 1_100,
        random: () => 0,
        randomUUID: () => uuidAt(95),
      });

      expect(replayed).toMatchObject({
        kind: "replayed",
        room: { gameState: { revealedIds: ["q-0"] } },
      });
    });

    it("현재 참가자 이탈은 차례와 점수 및 주사위와 실패 공개를 함께 정리한다", () => {
      const revealId = uuidAt(96);
      const state = makePlayState({
        diceRolls: { host: 6, guest: 5, third: 4 },
        turnOrder: ["host", "guest", "third"],
        scores: { host: 1, guest: 0, third: 0 },
        attempts: 2,
        revealedIds: ["q-0", "a-1"],
        lastReveal: {
          revealId,
          result: "miss",
          turnPlayerId: "host",
          resolveAt: 3_500,
        },
      });
      const room = makePlayingRoom(state, ["host", "guest", "third"]);

      const result = leaveQuestionGameRoom({ room, userId: "host", now: 1_100 });

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          hostId: "guest",
          status: "playing",
          players: [
            { id: "guest", isHost: true },
            { id: "third", isHost: false },
          ],
          gameState: {
            phase: "play",
            turnOrder: ["guest", "third"],
            currentTurnIdx: 0,
            diceRolls: { guest: 5, third: 4 },
            scores: { guest: 0, third: 0 },
            revealedIds: ["q-0", "a-1"],
            lastReveal: { revealId, turnPlayerId: "host" },
          },
        },
      });
    });

    it("주사위 미참가자가 나가 남은 결과가 모두 모이면 놀이 단계로 간다", () => {
      const state = makePlayState({
        phase: "rolling",
        diceRolls: { host: 4, guest: 4 },
        turnOrder: [],
        scores: { host: 0, guest: 0, third: 0 },
      });
      const room = makePlayingRoom(state, ["host", "guest", "third"]);

      const result = leaveQuestionGameRoom({ room, userId: "third" });

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          status: "playing",
          gameState: {
            phase: "play",
            diceRolls: { host: 4, guest: 4 },
            turnOrder: ["host", "guest"],
            currentTurnIdx: 0,
            scores: { host: 0, guest: 0 },
          },
        },
      });
    });

    it("완료 뒤 공개한 남은 카드는 참가자 이탈에도 유지한다", () => {
      const revealedIds = ["q-0", "a-0"];
      const state = makePlayState({
        phase: "done",
        endReason: "completed",
        revealedIds,
        lastReveal: null,
        diceRolls: { host: 6, guest: 5, third: 4 },
        turnOrder: ["host", "guest", "third"],
        scores: { host: 0, guest: 0, third: 0 },
      });
      const room = makePlayingRoom(state, ["host", "guest", "third"]);
      room.status = "ended";

      const result = leaveQuestionGameRoom({ room, userId: "third" });

      expect(result).toMatchObject({
        kind: "changed",
        room: { gameState: { revealedIds } },
      });
    });

    it("마지막 실패의 주인이 나가도 마감 전에는 종료하지 않는다", () => {
      const revealId = uuidAt(99);
      const state = makePlayState({
        attempts: 18,
        diceRolls: { host: 6, guest: 5, third: 4 },
        turnOrder: ["host", "guest", "third"],
        scores: { host: 0, guest: 0, third: 0 },
        revealedIds: ["q-0", "a-1"],
        lastReveal: {
          revealId,
          result: "miss",
          turnPlayerId: "host",
          resolveAt: 3_500,
        },
      });
      const room = makePlayingRoom(state, ["host", "guest", "third"]);

      const result = leaveQuestionGameRoom({ room, userId: "host", now: 1_100 });

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          status: "playing",
          gameState: {
            phase: "play",
            currentTurnIdx: 0,
            revealedIds: ["q-0", "a-1"],
            lastReveal: { revealId, resolveAt: 3_500 },
          },
        },
      });
    });

    it("한 명 부족 종료에는 처리되지 않은 실패 공개를 남기지 않는다", () => {
      const state = makePlayState({
        revealedIds: ["q-0", "a-1"],
        lastReveal: {
          revealId: uuidAt(100),
          result: "miss",
          turnPlayerId: "host",
          resolveAt: 3_500,
        },
      });
      const room = makePlayingRoom(state);

      const result = leaveQuestionGameRoom({ room, userId: "guest", now: 1_100 });

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          status: "ended",
          gameState: {
            phase: "done",
            endReason: "insufficient-players",
            revealedIds: [],
            lastReveal: null,
          },
        },
      });
    });
  });
});
