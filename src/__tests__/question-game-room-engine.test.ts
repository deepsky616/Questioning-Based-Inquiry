import { describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_QUESTION_GAME_IDS,
  QUESTION_GAME_LIMITS,
} from "@/lib/question-game-rules";
import type { GameRoom, RoomPlayer } from "@/lib/question-games-data";
import {
  appendRecentCommandId,
  applyQuestionGameRoomCommand,
  applyQuestionGameRoomCommandWithEngine,
  hasQuestionGameRoomEngine,
  isQuestionGameCommandId,
  leaveQuestionGameRoom,
  leaveQuestionGameRoomWithEngine,
  restartQuestionGameRoom,
  type EngineStateBase,
  type QuestionGameEngineResult,
  type QuestionGameRoomEngine,
  type QuestionGameRoomEngineApplyResult,
} from "@/lib/question-game-room-engine";

const COMMAND_ID = "11111111-1111-4111-8111-111111111111";
const PLAY_ID = "22222222-2222-4222-8222-222222222222";
const ROUND_ID = "33333333-3333-4333-8333-333333333333";

function makePlayer(
  id: string,
  isHost = false,
  joinedAt = 1,
): RoomPlayer {
  return { id, name: id.toUpperCase(), isHost, joinedAt };
}

function makeState(
  overrides: Partial<EngineStateBase> & Record<string, unknown> = {},
): EngineStateBase {
  return {
    stateVersion: 2,
    phase: "playing",
    recentCommandIds: [],
    roundId: ROUND_ID,
    round: 1,
    maxRounds: 3,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "a",
    status: "playing",
    players: [makePlayer("a", true), makePlayer("b")],
    topic: "topic",
    chain: [],
    turnIndex: 0,
    gameState: makeState(),
    version: 7,
    createdAt: 100,
    updatedAt: 200,
    playId: PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    ...overrides,
  };
}

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    commandId: COMMAND_ID,
    expectedCreatedAt: 100,
    expectedVersion: 7,
    playId: PLAY_ID,
    roundId: ROUND_ID,
    ...overrides,
  };
}

function apply(
  room: GameRoom,
  body: unknown = makeBody(),
  overrides: Partial<{
    userId: string;
    userName: string;
    action: string;
    now: number;
    random: () => number;
    randomUUID: () => string;
  }> = {},
) {
  return applyQuestionGameRoomCommand({
    room,
    userId: "a",
    userName: "A",
    action: "roll",
    body,
    now: 300,
    random: () => 0.5,
    randomUUID: () => "44444444-4444-4444-8444-444444444444",
    ...overrides,
  });
}

function makeEngine(
  overrides: Partial<QuestionGameRoomEngine> = {},
): QuestionGameRoomEngine {
  return {
    createInitialState: vi.fn(() =>
      makeState({ phase: "ready", roundId: undefined, round: 0 }),
    ),
    applyCommand: vi.fn(
      (context: Parameters<QuestionGameRoomEngine["applyCommand"]>[0]) => ({
        kind: "changed" as const,
        room: context.room,
      }),
    ),
    ...overrides,
  };
}

function applyWithEngine(
  room: GameRoom,
  engine: QuestionGameRoomEngine,
  body: unknown = makeBody(),
  overrides: Partial<{
    userId: string;
    userName: string;
    action: string;
    now: number;
    random: () => number;
    randomUUID: () => string;
  }> = {},
) {
  return applyQuestionGameRoomCommandWithEngine(
    {
      room,
      userId: "a",
      userName: "A",
      action: "roll",
      body,
      now: 300,
      random: () => 0.5,
      randomUUID: () => "44444444-4444-4444-8444-444444444444",
      ...overrides,
    },
    engine,
  );
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function padRecordToBytes<T extends Record<string, unknown>>(
  value: T,
  targetBytes: number,
): T & { padding: string } {
  const withKoreanText = { ...value, padding: "가" };
  const remaining = targetBytes - serializedBytes(withKoreanText);
  if (remaining < 0) throw new Error("target is smaller than the value");
  const result = { ...withKoreanText, padding: `가${"x".repeat(remaining)}` };
  expect(serializedBytes(result)).toBe(targetBytes);
  return result;
}

function indexedCommandId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

describe("질문놀이 방 판정기", () => {
  it("놀이 결과와 끝 사유의 공개 자료형을 고정한다", () => {
    const result: QuestionGameEngineResult = {
      kind: "changed",
      room: makeRoom(),
      result: { roll: 4, replayed: false },
    };
    const acceptedEndReasons: NonNullable<EngineStateBase["endReason"]>[] = [
      "completed",
      "host",
      "insufficient-players",
    ];
    // @ts-expect-error 정해진 세 값 밖의 끝 사유는 허용하지 않는다.
    const rejectedEndReason: NonNullable<EngineStateBase["endReason"]> = "other";

    expect(result.result).toEqual({ roll: 4, replayed: false });
    expect(acceptedEndReasons).toHaveLength(3);
    expect(rejectedEndReason).toBe("other");
  });

  it("오류 결과는 방과 메시지가 필수이고 명령 결과를 가질 수 없다", () => {
    const room = makeRoom();
    const failure = {
      kind: "invalid",
      room,
      message: "잘못된 명령입니다",
    } satisfies QuestionGameEngineResult;
    const engineFailure = {
      kind: "corrupt",
      room,
      message: "놀이 상태가 손상되었습니다",
    } satisfies QuestionGameRoomEngineApplyResult;
    type Failure = Extract<QuestionGameEngineResult, { kind: "invalid" }>;
    type EngineFailure = Extract<
      QuestionGameRoomEngineApplyResult,
      { kind: "corrupt" }
    >;
    const failureHasNoResult: "result" extends keyof Failure ? never : true = true;
    const engineFailureHasNoResult:
      "result" extends keyof EngineFailure ? never : true = true;
    // @ts-expect-error 오류 결과에는 메시지가 반드시 있어야 한다.
    const missingMessage: QuestionGameEngineResult = { kind: "invalid", room };
    const resultOnFailure: QuestionGameEngineResult = {
      kind: "invalid",
      room,
      message: "잘못된 명령입니다",
      // @ts-expect-error 오류 결과에는 명령 결과를 넣을 수 없다.
      result: { roll: 1 },
    };

    expect(failure.message).toBe("잘못된 명령입니다");
    expect(engineFailure.message).toBe("놀이 상태가 손상되었습니다");
    expect(failureHasNoResult).toBe(true);
    expect(engineFailureHasNoResult).toBe(true);
    expect(missingMessage.kind).toBe("invalid");
    expect(resultOnFailure.kind).toBe("invalid");
  });

  it("정적 등록부는 짝 찾기 판정기만 등록한다", () => {
    expect(hasQuestionGameRoomEngine("memory")).toBe(true);
    expect(
      BUILT_IN_QUESTION_GAME_IDS
        .filter((gameId) => gameId !== "memory")
        .every((gameId) => !hasQuestionGameRoomEngine(gameId)),
    ).toBe(true);
    expect(hasQuestionGameRoomEngine("unknown")).toBe(false);
  });

  describe("명령 식별값", () => {
    it.each([
      COMMAND_ID,
      "00000000-0000-4000-8000-000000000000",
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    ])("소문자 버전 4 식별값 %s를 받는다", (value) => {
      expect(isQuestionGameCommandId(value)).toBe(true);
    });

    it.each([
      "",
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "11111111-1111-3111-8111-111111111111",
      "11111111-1111-4111-7111-111111111111",
      "11111111111141118111111111111111",
    ])("잘못된 식별값 %s를 거절한다", (value) => {
      expect(isQuestionGameCommandId(value)).toBe(false);
    });

    it("잘못된 명령 식별값은 입력 방을 유지한 invalid다", () => {
      const room = makeRoom();

      const result = apply(room, makeBody({ commandId: "" }));

      expect(result).toMatchObject({
        kind: "invalid",
        room,
        message: "명령 식별값이 올바르지 않습니다",
      });
      expect(result.room).toBe(room);
    });
  });

  describe("최근 명령 순환", () => {
    it("예순세 개 뒤에 새 식별값을 붙이고 입력 배열을 바꾸지 않는다", () => {
      const commandIds = Object.freeze(
        Array.from({ length: 63 }, (_, index) => indexedCommandId(index)),
      );
      const before = [...commandIds];

      const result = appendRecentCommandId(commandIds, indexedCommandId(63));

      expect(result).toEqual([...before, indexedCommandId(63)]);
      expect(result).toHaveLength(64);
      expect(commandIds).toEqual(before);
      expect(result).not.toBe(commandIds);
    });

    it("예순네 개가 있으면 가장 오래된 값을 버리고 입력 배열을 바꾸지 않는다", () => {
      const commandIds = Object.freeze(
        Array.from({ length: 64 }, (_, index) => indexedCommandId(index)),
      );
      const before = [...commandIds];

      const result = appendRecentCommandId(commandIds, indexedCommandId(64));

      expect(result).toEqual([...before.slice(1), indexedCommandId(64)]);
      expect(result).toHaveLength(64);
      expect(commandIds).toEqual(before);
    });
  });

  describe("공통 판정 순서", () => {
    it("참가자가 아니면 재생 명령이어도 먼저 forbidden을 반환한다", () => {
      const room = makeRoom({
        gameState: makeState({ recentCommandIds: [COMMAND_ID] }),
      });

      const result = apply(room, makeBody(), { userId: "outsider" });

      expect(result).toMatchObject({
        kind: "forbidden",
        message: "참가자가 아닙니다",
      });
      expect(result.room).toBe(room);
    });

    it("생성 시각 불일치는 재생 명령보다 먼저 conflict다", () => {
      const room = makeRoom({
        gameState: makeState({ recentCommandIds: [COMMAND_ID] }),
      });

      const result = apply(room, makeBody({ expectedCreatedAt: 99 }));

      expect(result).toMatchObject({
        kind: "conflict",
        message: "방 생성 시각이 다릅니다",
      });
      expect(result.room).toBe(room);
    });

    it("같은 명령은 실행과 라운드가 같으면 낡은 버전에도 방 참조를 유지한 replayed다", () => {
      const room = makeRoom({
        gameState: makeState({ recentCommandIds: [COMMAND_ID] }),
      });
      const before = structuredClone(room);
      const random = vi.fn(() => 0.5);
      const randomUUID = vi.fn(() => indexedCommandId(90));

      const result = apply(
        room,
        makeBody({
          expectedVersion: 1,
        }),
        { random, randomUUID },
      );

      expect(result).toEqual({ kind: "replayed", room });
      expect(result.room).toBe(room);
      expect(random).not.toHaveBeenCalled();
      expect(randomUUID).not.toHaveBeenCalled();
      expect(room).toEqual(before);
    });

    it("같은 명령도 다른 실행 식별값은 재생하지 않는다", () => {
      const room = makeRoom({
        gameState: makeState({ recentCommandIds: [COMMAND_ID] }),
      });

      expect(apply(room, makeBody({
        expectedVersion: 1,
        playId: indexedCommandId(91),
      }))).toMatchObject({
        kind: "conflict",
        message: "실행 식별값이 다릅니다",
      });
    });

    it("같은 실행의 기록된 명령은 현재 라운드가 달라도 재생한다", () => {
      const room = makeRoom({
        gameState: makeState({ recentCommandIds: [COMMAND_ID] }),
      });

      expect(apply(room, makeBody({
        expectedVersion: 1,
        roundId: indexedCommandId(92),
      }))).toEqual({ kind: "replayed", room });
    });

    it("새 명령은 실행, 라운드, 낡은 버전 차례로 불일치를 판정한다", () => {
      const room = makeRoom();

      expect(
        apply(
          room,
          makeBody({
            expectedVersion: 1,
            playId: indexedCommandId(91),
            roundId: indexedCommandId(92),
          }),
        ),
      ).toMatchObject({
        kind: "conflict",
        message: "실행 식별값이 다릅니다",
      });
      expect(
        apply(
          room,
          makeBody({ playId: indexedCommandId(91), roundId: indexedCommandId(92) }),
        ),
      ).toMatchObject({
        kind: "conflict",
        message: "실행 식별값이 다릅니다",
      });
      expect(
        apply(room, makeBody({ roundId: indexedCommandId(92) })),
      ).toMatchObject({
        kind: "conflict",
        message: "라운드 식별값이 다릅니다",
      });
    });

    it("낡은 버전에서 판정기가 만든 변경 결과는 버린다", () => {
      const room = makeRoom();
      const engine = makeEngine();

      const result = applyWithEngine(
        room,
        engine,
        makeBody({
          commandId: indexedCommandId(93),
          expectedVersion: 1,
        }),
      );

      expect(result).toMatchObject({
        kind: "conflict",
        room,
        message: "기대 버전이 다릅니다",
      });
      expect(engine.applyCommand).toHaveBeenCalledOnce();
    });

    it("낡은 버전에서도 판정기의 의미상 재생은 성공한다", () => {
      const room = makeRoom();
      const engine = makeEngine({
        applyCommand: vi.fn(() => ({
          kind: "replayed" as const,
          room,
          result: { retryAfterMs: 200 },
        })),
      });

      const result = applyWithEngine(
        room,
        engine,
        makeBody({
          commandId: indexedCommandId(94),
          expectedVersion: 1,
        }),
      );

      expect(result).toEqual({
        kind: "replayed",
        room,
        result: { retryAfterMs: 200 },
      });
    });

    it("진행 방에 실행 식별값이 없으면 놀이를 부르지 않고 corrupt다", () => {
      const room = makeRoom({ playId: undefined });
      const engine = makeEngine();

      const result = applyWithEngine(room, engine);

      expect(result).toMatchObject({
        kind: "corrupt",
        message: "실행 식별값이 없습니다",
      });
      expect(result.room).toBe(room);
      expect(engine.applyCommand).not.toHaveBeenCalled();
    });

    it("진행 방의 실행 및 라운드 식별값 불일치는 놀이를 부르지 않고 conflict다", () => {
      const room = makeRoom();
      const engine = makeEngine();

      expect(
        applyWithEngine(
          room,
          engine,
          makeBody({ playId: indexedCommandId(91) }),
        ),
      ).toMatchObject({
        kind: "conflict",
        message: "실행 식별값이 다릅니다",
      });
      expect(
        applyWithEngine(
          room,
          engine,
          makeBody({ roundId: indexedCommandId(92) }),
        ),
      ).toMatchObject({
        kind: "conflict",
        message: "라운드 식별값이 다릅니다",
      });
      expect(engine.applyCommand).not.toHaveBeenCalled();
    });

    it("등록 엔진의 시작은 초기 상태와 서버 실행 식별값을 만들고 명령을 기록한다", () => {
      const room = makeRoom({
        status: "waiting",
        gameState: {},
        playId: undefined,
        pointAwardKeyVersion: undefined,
        pointEvidenceVersion: undefined,
      });
      const before = structuredClone(room);
      const createInitialState = vi.fn(() =>
        makeState({
          phase: "ready",
          recentCommandIds: [indexedCommandId(60)],
          roundId: undefined,
          round: 0,
        }),
      );
      const engine = makeEngine({ createInitialState });
      const serverPlayId = indexedCommandId(61);
      const randomUUID = vi.fn(() => serverPlayId);

      const result = applyWithEngine(room, engine, makeBody(), {
        action: "start",
        randomUUID,
      });

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          status: "playing",
          playId: serverPlayId,
          pointAwardKeyVersion: 2,
          pointEvidenceVersion: 2,
          version: room.version,
          updatedAt: room.updatedAt,
          gameState: {
            stateVersion: 2,
            phase: "ready",
            recentCommandIds: [indexedCommandId(60), COMMAND_ID],
          },
        },
      });
      expect(result.room).not.toBe(room);
      expect(createInitialState).toHaveBeenCalledOnce();
      expect(engine.applyCommand).not.toHaveBeenCalled();
      expect(randomUUID).toHaveBeenCalledOnce();
      expect(room).toEqual(before);
    });

    it("등록 엔진 시작 때 서버 식별값이 잘못되면 입력 방의 corrupt다", () => {
      const room = makeRoom({
        status: "waiting",
        gameState: {},
        playId: undefined,
      });
      const engine = makeEngine();

      const result = applyWithEngine(room, engine, makeBody(), {
        action: "start",
        randomUUID: () => "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      });

      expect(result).toMatchObject({
        kind: "corrupt",
        message: "서버 식별값이 올바르지 않습니다",
      });
      expect(result.room).toBe(room);
      expect(engine.createInitialState).not.toHaveBeenCalled();
      expect(engine.applyCommand).not.toHaveBeenCalled();
    });

    it("일반 변경 명령은 기록과 명령 결과를 새 방에 더하고 입력을 바꾸지 않는다", () => {
      const room = makeRoom();
      const before = structuredClone(room);
      const candidate = {
        ...structuredClone(room),
        topic: "next topic",
        gameState: makeState({
          recentCommandIds: [indexedCommandId(62)],
          roundId: ROUND_ID,
        }),
      };
      const candidateBefore = structuredClone(candidate);
      const applyCommand = vi.fn(
        (_context: Parameters<QuestionGameRoomEngine["applyCommand"]>[0]) => ({
          kind: "changed" as const,
          room: candidate,
          result: { roll: 6, replayed: false },
        }),
      );
      const engine = makeEngine({ applyCommand });

      const result = applyWithEngine(room, engine);

      expect(result).toMatchObject({
        kind: "changed",
        result: { roll: 6, replayed: false },
        room: {
          topic: "next topic",
          version: room.version,
          updatedAt: room.updatedAt,
          gameState: {
            recentCommandIds: [indexedCommandId(62), COMMAND_ID],
          },
        },
      });
      expect(result.room).not.toBe(room);
      expect(applyCommand).toHaveBeenCalledOnce();
      expect(applyCommand.mock.calls[0][0].room).not.toBe(room);
      expect(room).toEqual(before);
      expect(candidate).toEqual(candidateBefore);
    });

    it("일반 변경 명령의 상태와 방 출력 상한 초과는 결과 없이 invalid다", () => {
      const room = makeRoom();
      const overLimitState = padRecordToBytes(
        makeState(),
        QUESTION_GAME_LIMITS.gameStateBytes + 1,
      );
      const stateEngine = makeEngine({
        applyCommand: vi.fn(() => ({
          kind: "changed" as const,
          room: { ...structuredClone(room), gameState: overLimitState },
          result: { roll: 2 },
        })),
      });

      const stateResult = applyWithEngine(room, stateEngine);

      expect(stateResult).toEqual({
        kind: "invalid",
        room,
        message: "놀이 상태가 너무 큽니다",
      });
      expect(stateResult).not.toHaveProperty("result");

      const overLimitRoom = padRecordToBytes(
        makeRoom() as GameRoom & Record<string, unknown>,
        QUESTION_GAME_LIMITS.roomBytes + 1,
      );
      const roomEngine = makeEngine({
        applyCommand: vi.fn(() => ({
          kind: "changed" as const,
          room: overLimitRoom,
          result: { roll: 3 },
        })),
      });

      const roomResult = applyWithEngine(room, roomEngine);

      expect(roomResult).toEqual({
        kind: "invalid",
        room,
        message: "방 자료가 너무 큽니다",
      });
      expect(roomResult).not.toHaveProperty("result");
    });

    it("등록된 놀이가 없으면 입력 방을 유지한 corrupt다", () => {
      const room = makeRoom();

      const result = apply(room);

      expect(result).toMatchObject({
        kind: "corrupt",
        message: "등록된 놀이 판정기가 없습니다",
      });
      expect(result.room).toBe(room);
    });

    it("상태 버전이 2가 아니면 입력 방을 유지한 corrupt다", () => {
      const room = makeRoom({
        gameState: { ...makeState(), stateVersion: 1 },
      });

      const result = apply(room);

      expect(result).toMatchObject({
        kind: "corrupt",
        message: "놀이 상태가 손상되었습니다",
      });
      expect(result.room).toBe(room);
    });
  });

  describe("유티에프 팔 바이트 상한", () => {
    it("본문은 경계까지 받고 한 바이트 초과를 invalid로 거절한다", () => {
      const room = makeRoom();
      const atLimit = padRecordToBytes(
        makeBody(),
        QUESTION_GAME_LIMITS.commandBodyBytes,
      );
      const overLimit = { ...atLimit, padding: `${atLimit.padding}x` };

      expect(apply(room, atLimit)).toMatchObject({
        kind: "corrupt",
        message: "등록된 놀이 판정기가 없습니다",
      });
      const result = apply(room, overLimit);
      expect(result).toMatchObject({
        kind: "invalid",
        message: "명령 본문이 너무 큽니다",
      });
      expect(result.room).toBe(room);
    });

    it("놀이 상태는 경계까지 받고 한 바이트 초과를 invalid로 거절한다", () => {
      const atLimitState = padRecordToBytes(
        makeState({ recentCommandIds: [COMMAND_ID] }),
        QUESTION_GAME_LIMITS.gameStateBytes,
      );
      const atLimitRoom = makeRoom({ gameState: atLimitState });
      const overLimitRoom = makeRoom({
        gameState: {
          ...atLimitState,
          padding: `${atLimitState.padding}x`,
        },
      });

      expect(apply(atLimitRoom)).toMatchObject({ kind: "replayed" });
      const result = apply(overLimitRoom);
      expect(result).toMatchObject({
        kind: "invalid",
        message: "놀이 상태가 너무 큽니다",
      });
      expect(result.room).toBe(overLimitRoom);
    });

    it("방은 경계까지 받고 한 바이트 초과를 invalid로 거절한다", () => {
      const atLimitRoom = padRecordToBytes(
        makeRoom({ gameState: makeState({ recentCommandIds: [COMMAND_ID] }) }) as
          GameRoom & Record<string, unknown>,
        QUESTION_GAME_LIMITS.roomBytes,
      );
      const overLimitRoom = {
        ...atLimitRoom,
        padding: `${atLimitRoom.padding}x`,
      };

      expect(apply(atLimitRoom)).toMatchObject({ kind: "replayed" });
      const result = apply(overLimitRoom);
      expect(result).toMatchObject({
        kind: "invalid",
        message: "방 자료가 너무 큽니다",
      });
      expect(result.room).toBe(overLimitRoom);
    });
  });

  describe("참가자 이탈", () => {
    const players = [
      makePlayer("a", true),
      makePlayer("b"),
      makePlayer("c"),
      makePlayer("d"),
    ];

    function turnRoom(currentTurnIdx: number): GameRoom {
      return makeRoom({
        players,
        gameState: makeState({
          turnOrder: players.map(({ id }) => id),
          currentTurnIdx,
        }),
      });
    }

    it("현재 차례 앞 참가자가 나가면 같은 참가자를 가리키도록 차례를 당긴다", () => {
      const room = turnRoom(1);
      const before = structuredClone(room);

      const result = leaveQuestionGameRoom({ room, userId: "a" });

      expect(result.kind).toBe("changed");
      expect(result.room).not.toBe(room);
      expect(result.room.gameState).toMatchObject({
        turnOrder: ["b", "c", "d"],
        currentTurnIdx: 0,
      });
      expect(result.room.hostId).toBe("b");
      expect(result.room.players.map(({ id, isHost }) => [id, isHost])).toEqual([
        ["b", true],
        ["c", false],
        ["d", false],
      ]);
      expect(room).toEqual(before);
    });

    it("현재 참가자가 나가면 그 뒤 참가자가 같은 차례 칸을 이어받는다", () => {
      const room = turnRoom(1);

      const result = leaveQuestionGameRoom({ room, userId: "b" });

      expect(result.room.gameState).toMatchObject({
        turnOrder: ["a", "c", "d"],
        currentTurnIdx: 1,
      });
      expect(result.room.hostId).toBe("a");
      expect(result.room.players.filter(({ isHost }) => isHost)).toHaveLength(1);
    });

    it("현재 차례 뒤 참가자가 나가면 차례 칸을 유지한다", () => {
      const room = turnRoom(1);

      const result = leaveQuestionGameRoom({ room, userId: "c" });

      expect(result.room.gameState).toMatchObject({
        turnOrder: ["a", "b", "d"],
        currentTurnIdx: 1,
      });
    });

    it("마지막 차례 참가자가 나가면 첫 차례로 감싼다", () => {
      const room = turnRoom(3);

      const result = leaveQuestionGameRoom({ room, userId: "d" });

      expect(result.room.gameState).toMatchObject({
        turnOrder: ["a", "b", "c"],
        currentTurnIdx: 0,
      });
    });

    it("마지막 참가자가 나가면 빈 참가자와 빈 차례를 반환한다", () => {
      const room = makeRoom({
        hostId: "a",
        players: [makePlayer("a", true)],
        gameState: makeState({ turnOrder: ["a"], currentTurnIdx: 0 }),
      });

      const result = leaveQuestionGameRoom({ room, userId: "a" });

      expect(result).toMatchObject({
        kind: "changed",
        room: {
          hostId: "",
          players: [],
          gameState: { turnOrder: [], currentTurnIdx: 0 },
        },
      });
    });

    it("진행 중 두 명 방에서 한 명이 남으면 부족 인원으로 끝낸다", () => {
      const room = makeRoom({
        players: [makePlayer("a", true), makePlayer("b")],
        gameState: makeState({
          turnOrder: ["a", "b"],
          currentTurnIdx: 0,
        }),
      });

      const result = leaveQuestionGameRoom({ room, userId: "a" });

      expect(result.room).toMatchObject({
        status: "ended",
        hostId: "b",
        gameState: {
          phase: "done",
          endReason: "insufficient-players",
          turnOrder: ["b"],
          currentTurnIdx: 0,
        },
      });
      expect(result.room.version).toBe(room.version);
      expect(result.room.updatedAt).toBe(room.updatedAt);
    });

    it("이탈 훅 뒤에도 한 명 방의 참가자와 방장 및 부족 종료를 다시 고정한다", () => {
      const room = makeRoom({
        players: [makePlayer("a", true), makePlayer("b")],
        gameState: makeState({
          turnOrder: ["a", "b"],
          currentTurnIdx: 0,
        }),
      });
      const onPlayerLeave = vi.fn(({ room: candidate }) => ({
        ...candidate,
        status: "playing" as const,
        playId: indexedCommandId(96),
        pointAwardKeyVersion: 1 as const,
        pointEvidenceVersion: 1 as const,
        hostId: "a",
        players: [makePlayer("a", true), makePlayer("b", true)],
        gameState: {
          ...candidate.gameState,
          phase: "playing",
          endReason: "host",
          turnOrder: ["a", "b"],
          currentTurnIdx: 9,
          hookValue: "kept",
        },
      }));
      const engine = makeEngine({ onPlayerLeave });

      const result = leaveQuestionGameRoomWithEngine(
        { room, userId: "a" },
        engine,
      );

      expect(onPlayerLeave).toHaveBeenCalledOnce();
      expect(result.room).toMatchObject({
        status: "ended",
        playId: PLAY_ID,
        pointAwardKeyVersion: 2,
        pointEvidenceVersion: 2,
        hostId: "b",
        players: [{ id: "b", isHost: true }],
        gameState: {
          phase: "done",
          endReason: "insufficient-players",
          turnOrder: ["b"],
          currentTurnIdx: 0,
          hookValue: "kept",
        },
      });
    });

    it("두 명 이상 남으면 훅의 놀이 상태와 종료 결정을 보존하고 공통 값만 고정한다", () => {
      const room = makeRoom({
        players: [makePlayer("a", true), makePlayer("b"), makePlayer("c")],
        gameState: makeState({
          turnOrder: ["a", "b", "c"],
          currentTurnIdx: 0,
        }),
      });
      const onPlayerLeave = vi.fn(({ room: candidate }) => ({
        ...candidate,
        status: "ended" as const,
        hostId: "a",
        players: [makePlayer("a", true)],
        gameState: {
          ...candidate.gameState,
          phase: "done",
          endReason: "host",
          turnOrder: ["a"],
          currentTurnIdx: 8,
          hookValue: "kept",
        },
      }));
      const engine = makeEngine({ onPlayerLeave });

      const result = leaveQuestionGameRoomWithEngine(
        { room, userId: "a" },
        engine,
      );

      expect(result.room).toMatchObject({
        status: "ended",
        hostId: "b",
        players: [
          { id: "b", isHost: true },
          { id: "c", isHost: false },
        ],
        gameState: {
          phase: "done",
          endReason: "host",
          turnOrder: ["b", "c"],
          currentTurnIdx: 0,
          hookValue: "kept",
        },
      });
    });
  });

  describe("다시 시작", () => {
    it("코드와 참가자를 유지하며 빈 대기 방으로 되돌리고 저장 값은 올리지 않는다", () => {
      const room = makeRoom({
        status: "ended",
        topic: "old topic",
        chain: [{ question: "old", playerId: "a", playerName: "A" }],
        turnIndex: 1,
        gameState: makeState({ phase: "done", endReason: "completed" }),
      });
      const before = structuredClone(room);

      const result = restartQuestionGameRoom(room);

      expect(result.kind).toBe("changed");
      expect(result.room).not.toBe(room);
      expect(result.room).toEqual({
        code: room.code,
        gameId: room.gameId,
        hostId: room.hostId,
        status: "waiting",
        players: room.players,
        topic: "",
        chain: [],
        turnIndex: 0,
        gameState: {},
        version: room.version,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      });
      expect(room).toEqual(before);
    });

    it("이미 빈 대기 방이면 같은 방 참조의 replayed다", () => {
      const room = makeRoom({
        status: "waiting",
        topic: "",
        chain: [],
        turnIndex: 0,
        gameState: {},
        playId: undefined,
        pointAwardKeyVersion: undefined,
        pointEvidenceVersion: undefined,
      });

      const result = restartQuestionGameRoom(room);

      expect(result).toEqual({ kind: "replayed", room });
      expect(result.room).toBe(room);
    });
  });
});
