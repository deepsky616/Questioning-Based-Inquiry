import { describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
  restartQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import {
  assignLadderTopics,
  generateLadderGrid,
} from "@/lib/question-ladder";
import {
  readLadderState,
  type LadderAssignment,
  type LadderQuestion,
  type LadderRoomState,
} from "@/lib/question-game-room-engines/ladder";

const START_COMMAND_ID = "11111111-1111-4111-8111-111111111111";
const PLAY_ID = "22222222-2222-4222-8222-222222222222";
const ROUND_1_ID = "33333333-3333-4333-8333-333333333333";
const ROUND_2_ID = "44444444-4444-4444-8444-444444444444";
const ROUND_3_ID = "55555555-5555-4555-8555-555555555555";

function makePlayers(count: number): GameRoom["players"] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "host" : `guest-${index}`,
    name: index === 0 ? "방장" : `친구 ${index}`,
    isHost: index === 0,
    joinedAt: index + 1,
  }));
}

function makeWaitingRoom(playerCount = 2): GameRoom {
  return {
    code: "1234",
    gameId: "ladder",
    hostId: "host",
    status: "waiting",
    players: makePlayers(playerCount),
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 100,
    updatedAt: 100,
  };
}

function commandId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function changedRoom(
  result: ReturnType<typeof applyQuestionGameRoomCommand>,
): GameRoom {
  expect(result.kind).toBe("changed");
  if (result.kind !== "changed") throw new Error("변경 결과가 필요합니다");
  return result.room;
}

function startRoom(playerCount = 2): GameRoom {
  const result = applyQuestionGameRoomCommand({
    room: makeWaitingRoom(playerCount),
    userId: "host",
    userName: "방장",
    action: "start",
    body: {
      commandId: START_COMMAND_ID,
      expectedCreatedAt: 100,
      expectedVersion: 1,
    },
    now: 200,
    random: () => 0,
    randomUUID: () => PLAY_ID,
  });
  return changedRoom(result);
}

function topics(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `주제 ${index + 1}`);
}

function prepareRoom(
  playerCount = 2,
  options: {
    random?: () => number;
    randomUUID?: () => string;
    body?: Record<string, unknown>;
  } = {},
): GameRoom {
  const room = startRoom(playerCount);
  return changedRoom(applyQuestionGameRoomCommand({
    room,
    userId: "host",
    userName: "바꾼 이름",
    action: "ladder-prepare",
    body: {
      commandId: commandId(1),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      topics: topics(playerCount),
      ...options.body,
    },
    now: 300,
    random: options.random ?? (() => 0.9),
    randomUUID: options.randomUUID ?? (() => ROUND_1_ID),
  }));
}

function applySubmit(
  room: GameRoom,
  playerId: string,
  index: number,
  options: {
    question?: string;
    locale?: string;
    random?: () => number;
    randomUUID?: () => string;
    body?: Record<string, unknown>;
  } = {},
) {
  const player = room.players.find(({ id }) => id === playerId);
  return applyQuestionGameRoomCommand({
    room,
    userId: playerId,
    userName: player?.name ?? "요청 이름",
    action: "ladder-submit-question",
    body: {
      commandId: commandId(index),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      roundId: room.gameState.roundId,
      locale: options.locale ?? "ko",
      question: options.question ?? "이 주제는 왜 중요할까요?",
      ...options.body,
    },
    now: 400 + index,
    random: options.random ?? (() => 0.9),
    randomUUID: options.randomUUID ?? (() => commandId(100 + index)),
  });
}

function submitRound(
  room: GameRoom,
  startIndex: number,
  nextRoundId: string,
): GameRoom {
  let current = room;
  const playerIds = (current.gameState as unknown as LadderRoomState)
    .roundTargetPlayerIds;
  playerIds.forEach((playerId, index) => {
    current = changedRoom(applySubmit(current, playerId, startIndex + index, {
      question: `주제 ${index + 1}은 왜 필요할까요?`,
      randomUUID: () => nextRoundId,
    }));
  });
  return current;
}

function makeComposeState(
  playerCount = 2,
  overrides: Partial<LadderRoomState> = {},
): LadderRoomState {
  const playerList = makePlayers(playerCount);
  const roundTopics = topics(playerCount);
  const grid = generateLadderGrid(playerCount, () => 0.9);
  const topicAssignments = assignLadderTopics(roundTopics, grid);
  const assignments: LadderAssignment[] = topicAssignments.map(
    (assignment, index) => ({
      playerId: playerList[index].id,
      playerName: playerList[index].name,
      ...assignment,
    }),
  );
  return {
    stateVersion: 2,
    game: "ladder",
    phase: "compose",
    recentCommandIds: [],
    roundId: ROUND_1_ID,
    round: 1,
    maxRounds: 3,
    topicPool: [...roundTopics],
    roundTopics,
    grid,
    roundPlayerIds: playerList.map(({ id }) => id),
    roundTargetPlayerIds: playerList.map(({ id }) => id),
    assignments,
    questions: [],
    ...overrides,
  };
}

describe("질문 사다리 방 판정기", () => {
  it("일반 시작은 비어 있는 버전 2 준비 상태를 만든다", () => {
    const room = startRoom();

    expect(room.gameState).toEqual({
      stateVersion: 2,
      game: "ladder",
      phase: "setup",
      recentCommandIds: [START_COMMAND_ID],
      round: 0,
      maxRounds: 3,
      topicPool: [],
      roundTopics: [],
      grid: [],
      roundPlayerIds: [],
      roundTargetPlayerIds: [],
      assignments: [],
      questions: [],
    });
    expect(readLadderState(room.gameState)).toEqual(
      room.gameState as unknown as LadderRoomState,
    );
  });

  describe("엄격한 상태 판독", () => {
    it("준비, 진행, 완료와 인원 부족 상태만 정확한 키로 받는다", () => {
      const setup = startRoom().gameState;
      const compose = makeComposeState();
      const completedBase = makeComposeState(2, {
        phase: "done",
        round: 3,
        roundId: ROUND_3_ID,
        endReason: "completed",
      });
      const completed: LadderRoomState = {
        ...completedBase,
        questions: [ROUND_1_ID, ROUND_2_ID, ROUND_3_ID].flatMap(
          (roundId, round) => completedBase.assignments.map((assignment) => ({
            roundId,
            round: round + 1,
            playerId: assignment.playerId,
            playerName: assignment.playerName,
            topic: round === 2 ? assignment.topic : `지난 주제 ${round + 1}`,
            question: `라운드 ${round + 1} 질문은 무엇인가요?`,
            locale: "ko" as const,
          })),
        ),
      };
      const insufficientBeforePrepare: LadderRoomState = {
        ...(setup as unknown as LadderRoomState),
        phase: "done",
        endReason: "insufficient-players",
      };
      const insufficientDuringRound = makeComposeState(2, {
        phase: "done",
        endReason: "insufficient-players",
        roundTargetPlayerIds: ["host"],
      });

      expect(readLadderState(setup)).not.toBeNull();
      expect(readLadderState(compose)).not.toBeNull();
      expect(readLadderState(completed)).not.toBeNull();
      expect(readLadderState(insufficientBeforePrepare)).not.toBeNull();
      expect(readLadderState(insufficientDuringRound)).not.toBeNull();
      expect(readLadderState({ ...compose, extra: true })).toBeNull();
      expect(readLadderState({ ...compose, phase: "setup" })).toBeNull();
      expect(readLadderState({ ...compose, phase: "done" })).toBeNull();
      expect(readLadderState({ ...completed, round: 2 })).toBeNull();
      expect(readLadderState({ ...completed, questions: [] })).toBeNull();
      expect(readLadderState({
        ...completed,
        questions: completed.questions.filter((question) =>
          question.round !== 3 || question.playerId !== "guest-1"
        ),
      })).toBeNull();
      expect(readLadderState({
        ...insufficientDuringRound,
        roundTargetPlayerIds: ["host", "guest-1"],
      })).toBeNull();
    });

    it("대상은 중복 없는 라운드 참가자 부분집합이어야 한다", () => {
      const state = makeComposeState(3);

      expect(readLadderState({
        ...state,
        roundTargetPlayerIds: ["host", "host"],
      })).toBeNull();
      expect(readLadderState({
        ...state,
        roundTargetPlayerIds: ["host", "outside"],
      })).toBeNull();
      expect(readLadderState({
        ...state,
        roundTargetPlayerIds: ["host"],
      })).toBeNull();
    });

    it("대상 전원이 제출된 진행 상태는 정지 상태로 받지 않는다", () => {
      const state = makeComposeState();
      const questions: LadderQuestion[] = state.assignments.map(
        (assignment) => ({
          roundId: ROUND_1_ID,
          round: 1,
          playerId: assignment.playerId,
          playerName: assignment.playerName,
          topic: assignment.topic,
          question: `${assignment.topic}은 왜 중요할까요?`,
          locale: "ko",
        }),
      );

      expect(readLadderState({ ...state, questions })).toBeNull();
    });

    it("배정과 질문도 정확한 키만 받는다", () => {
      const state = makeComposeState();
      const question: LadderQuestion = {
        roundId: ROUND_1_ID,
        round: 1,
        playerId: "host",
        playerName: "방장",
        topic: "주제 1",
        question: "주제 1은 왜 중요할까요?",
        locale: "ko",
      };

      expect(readLadderState({ ...state, questions: [question] })).not.toBeNull();
      expect(readLadderState({
        ...state,
        assignments: [{ ...state.assignments[0], extra: true }, state.assignments[1]],
      })).toBeNull();
      expect(readLadderState({
        ...state,
        questions: [{ ...question, classification: "good" }],
      })).toBeNull();
    });

    it("그리드, 열 순열, 도착 주제와 참가자 순서 관계를 검사한다", () => {
      const state = makeComposeState(3);

      expect(readLadderState({
        ...state,
        grid: state.grid.slice(0, 9),
      })).toBeNull();
      expect(readLadderState({
        ...state,
        assignments: state.assignments.map((assignment, index) =>
          index === 1 ? { ...assignment, startColumn: 0 } : assignment
        ),
      })).toBeNull();
      expect(readLadderState({
        ...state,
        assignments: state.assignments.map((assignment, index) =>
          index === 0 ? { ...assignment, destinationColumn: 1 } : assignment
        ),
      })).toBeNull();
      expect(readLadderState({
        ...state,
        assignments: state.assignments.map((assignment, index) =>
          index === 0 ? { ...assignment, topic: "다른 주제" } : assignment
        ),
      })).toBeNull();
      expect(readLadderState({
        ...state,
        roundPlayerIds: ["guest-1", "host", "guest-2"],
      })).toBeNull();
      expect(readLadderState({
        ...state,
        roundTopics: state.roundTopics.slice(1),
      })).toBeNull();
    });

    it("질문 중복, 현재 배정 불일치와 질문 수 상한을 거절한다", () => {
      const state = makeComposeState(8, {
        phase: "done",
        round: 3,
        roundId: ROUND_3_ID,
        endReason: "completed",
      });
      const roundIds = [ROUND_1_ID, ROUND_2_ID, ROUND_3_ID];
      const questions: LadderQuestion[] = roundIds.flatMap((roundId, round) =>
        state.assignments.map((assignment) => ({
          roundId,
          round: round + 1,
          playerId: assignment.playerId,
          playerName: assignment.playerName,
          topic: round === 2 ? assignment.topic : `지난 주제 ${round + 1}`,
          question: `라운드 ${round + 1} 질문은 무엇인가요?`,
          locale: "ko" as const,
        }))
      );

      expect(readLadderState({ ...state, questions })).not.toBeNull();
      expect(readLadderState({ ...state, questions: [...questions, questions[0]] }))
        .toBeNull();
      expect(readLadderState({
        ...state,
        questions: questions.map((question, index) =>
          index === 16 ? { ...question, topic: "잘못된 주제" } : question
        ),
      })).toBeNull();
      expect(readLadderState({
        ...state,
        questions: [questions[0], { ...questions[0], roundId: commandId(91) }],
      })).toBeNull();
    });

    it("지난 한 라운드의 서로 다른 아홉 질문을 거절한다", () => {
      const state = makeComposeState(2, {
        round: 2,
        roundId: ROUND_2_ID,
      });
      const questions: LadderQuestion[] = Array.from(
        { length: 9 },
        (_, index) => ({
          roundId: ROUND_1_ID,
          round: 1,
          playerId: `past-${index}`,
          playerName: `지난 참가자 ${index}`,
          topic: "지난 주제",
          question: `지난 질문 ${index}은 무엇인가요?`,
          locale: "ko",
        }),
      );

      expect(readLadderState({ ...state, questions })).toBeNull();
    });

    it.each([
      ["배정", { assignments: Array(2) }],
      ["질문", { questions: Array(2) }],
      ["바깥 발판", { grid: Array(10) }],
      [
        "안쪽 발판",
        {
          grid: Array.from(
            { length: 10 },
            (_, index) => index === 4 ? Array(1) : [false],
          ),
        },
      ],
      ["라운드 참가자", { roundPlayerIds: Array(2) }],
      ["라운드 대상", { roundTargetPlayerIds: Array(2) }],
    ] as const)("희소 %s 배열은 예외 없이 거절한다", (_name, override) => {
      const candidate = { ...makeComposeState(), ...override };

      expect(() => readLadderState(candidate)).not.toThrow();
      expect(readLadderState(candidate)).toBeNull();
    });
  });

  describe("주제 준비", () => {
    it.each([2, 8])("%i명 주제를 다듬고 서버 발판과 배정을 만든다", (count) => {
      const room = startRoom(count);
      const random = vi.fn(() => 0.9);
      const result = applyQuestionGameRoomCommand({
        room,
        userId: "host",
        userName: "클라이언트 이름",
        action: "ladder-prepare",
        body: {
          commandId: commandId(2),
          expectedCreatedAt: room.createdAt,
          expectedVersion: room.version,
          playId: room.playId,
          topics: topics(count).map((topic) => `  ${topic}  `),
        },
        now: 300,
        random,
        randomUUID: () => ROUND_1_ID,
      });
      const prepared = changedRoom(result);
      const state = prepared.gameState as unknown as LadderRoomState;

      expect(state).toMatchObject({
        phase: "compose",
        round: 1,
        roundId: ROUND_1_ID,
        topicPool: topics(count),
        roundTopics: topics(count),
        roundPlayerIds: room.players.map(({ id }) => id),
        roundTargetPlayerIds: room.players.map(({ id }) => id),
      });
      expect(state.grid).toHaveLength(10);
      expect(state.grid.every((row) => row.length === count - 1)).toBe(true);
      expect(state.assignments).toEqual(room.players.map((player, index) => ({
        playerId: player.id,
        playerName: player.name,
        startColumn: index,
        destinationColumn: index,
        topic: topics(count)[index],
      })));
      expect(random).toHaveBeenCalledTimes(10 * (count - 1));
      expect(readLadderState(state)).not.toBeNull();
    });

    it("방에 저장된 참가자 이름을 다듬거나 줄이지 않고 배정에 보존한다", () => {
      const waiting = makeWaitingRoom();
      waiting.players[1].name = `  ${"긴이름".repeat(30)}  `;
      const started = changedRoom(applyQuestionGameRoomCommand({
        room: waiting,
        userId: "host",
        userName: "방장",
        action: "start",
        body: {
          commandId: commandId(43),
          expectedCreatedAt: waiting.createdAt,
          expectedVersion: waiting.version,
        },
        now: 200,
        random: () => 0.9,
        randomUUID: () => PLAY_ID,
      }));
      const prepared = changedRoom(applyQuestionGameRoomCommand({
        room: started,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(44),
          expectedCreatedAt: started.createdAt,
          expectedVersion: started.version,
          playId: started.playId,
          topics: topics(2),
        },
        now: 300,
        random: () => 0.9,
        randomUUID: () => ROUND_1_ID,
      }));

      expect(prepared.gameState).toHaveProperty(
        "assignments.1.playerName",
        waiting.players[1].name,
      );
    });

    it("방장이 아니거나 준비 단계가 아니면 거절한다", () => {
      const started = startRoom();
      const nonHost = applyQuestionGameRoomCommand({
        room: started,
        userId: "guest-1",
        userName: "친구 1",
        action: "ladder-prepare",
        body: {
          commandId: commandId(3),
          expectedCreatedAt: started.createdAt,
          expectedVersion: started.version,
          playId: started.playId,
          topics: topics(2),
        },
        now: 300,
        random: () => 0.9,
        randomUUID: () => ROUND_1_ID,
      });
      const prepared = prepareRoom();
      const repeated = applyQuestionGameRoomCommand({
        room: prepared,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(4),
          expectedCreatedAt: prepared.createdAt,
          expectedVersion: prepared.version,
          playId: prepared.playId,
          roundId: prepared.gameState.roundId,
          topics: topics(2),
        },
        now: 300,
        random: () => 0.9,
        randomUUID: () => ROUND_2_ID,
      });

      expect(nonHost).toMatchObject({ kind: "forbidden", room: started });
      expect(repeated).toMatchObject({ kind: "conflict", room: prepared });
    });

    it("끝난 방의 준비 상태를 다시 진행 상태로 바꾸지 않는다", () => {
      const started = startRoom();
      const ended = { ...started, status: "ended" as const };
      const result = applyQuestionGameRoomCommand({
        room: ended,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(45),
          expectedCreatedAt: ended.createdAt,
          expectedVersion: ended.version,
          playId: ended.playId,
          topics: topics(2),
        },
        now: 300,
        random: () => 0.9,
        randomUUID: () => ROUND_1_ID,
      });

      expect(result).toMatchObject({ kind: "corrupt", room: ended });
    });

    it.each([
      { name: "주제 수 부족", value: ["하나"] },
      { name: "빈 주제", value: ["하나", "   "] },
      { name: "긴 주제", value: ["하나", "가".repeat(81)] },
      { name: "희소 주제", value: Array(2) },
    ])("$name 입력을 거절한다", ({ value }) => {
      const room = startRoom();
      const result = applyQuestionGameRoomCommand({
        room,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(5),
          expectedCreatedAt: room.createdAt,
          expectedVersion: room.version,
          playId: room.playId,
          topics: value,
        },
        now: 300,
        random: () => 0.9,
        randomUUID: () => ROUND_1_ID,
      });

      expect(result).toMatchObject({ kind: "invalid", room });
    });

    it("클라이언트 발판과 배정 자료를 함께 보내면 거절한다", () => {
      const room = startRoom();
      const result = applyQuestionGameRoomCommand({
        room,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(6),
          expectedCreatedAt: room.createdAt,
          expectedVersion: room.version,
          playId: room.playId,
          topics: topics(2),
          grid: [[true]],
          assignments: [],
          roundId: ROUND_3_ID,
        },
        now: 300,
        random: () => 0.9,
        randomUUID: () => ROUND_1_ID,
      });

      expect(result).toMatchObject({ kind: "invalid", room });
    });

    it.each([
      ["잘못된 난수", (): number => 1, (): string => ROUND_1_ID],
      ["잘못된 식별값", (): number => 0.9, (): string => "bad-id"],
    ] as const)("%s는 손상 결과로 거절한다", (_name, random, randomUUID) => {
      const room = startRoom();
      const result = applyQuestionGameRoomCommand({
        room,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(7),
          expectedCreatedAt: room.createdAt,
          expectedVersion: room.version,
          playId: room.playId,
          topics: topics(2),
        },
        now: 300,
        random,
        randomUUID,
      });

      expect(result).toMatchObject({ kind: "corrupt", room });
    });
  });

  describe("질문 제출과 라운드 전이", () => {
    it("서버 배정의 이름과 주제로 다듬은 질문만 저장한다", () => {
      const room = prepareRoom();
      const result = applySubmit(room, "host", 10, {
        question: "  이 주제는 왜 중요할까요?  ",
      });
      const next = changedRoom(result);
      const state = next.gameState as unknown as LadderRoomState;

      expect(state.questions).toEqual([{
        roundId: ROUND_1_ID,
        round: 1,
        playerId: "host",
        playerName: "방장",
        topic: "주제 1",
        question: "이 주제는 왜 중요할까요?",
        locale: "ko",
      }]);
      expect(state.phase).toBe("compose");
      expect(state.round).toBe(1);
      expect(state.roundTargetPlayerIds).toEqual(["host", "guest-1"]);
    });

    it.each([
      ["언어", { locale: "fr", question: "Why is it useful?" }],
      ["빈 질문", { question: "   " }],
      ["질문 모양", { question: "중요한 주제입니다" }],
      ["길이", { question: `${"가".repeat(200)}?` }],
      ["비속어", { question: "왜 시발이라고 말하나요?" }],
    ] as const)("잘못된 %s을 거절한다", (_name, options) => {
      const room = prepareRoom();
      const result = applySubmit(room, "host", 11, options);

      expect(result).toMatchObject({ kind: "invalid", room });
    });

    it("클라이언트 배정과 분류 자료를 보내면 거절한다", () => {
      const room = prepareRoom();
      const result = applySubmit(room, "host", 12, {
        body: {
          topic: "바꾼 주제",
          playerName: "바꾼 이름",
          startColumn: 7,
          classification: "good",
        },
      });

      expect(result).toMatchObject({ kind: "invalid", room });
    });

    it("같은 명령은 재생하고 다른 명령의 같은 라운드 중복은 거절한다", () => {
      const room = prepareRoom();
      const submitted = changedRoom(applySubmit(room, "host", 13));
      const replayed = applySubmit(submitted, "host", 13, {
        body: { expectedVersion: room.version - 1 },
      });
      const duplicate = applySubmit(submitted, "host", 14);

      expect(replayed).toMatchObject({ kind: "replayed", room: submitted });
      expect(duplicate).toMatchObject({ kind: "conflict", room: submitted });
      expect((submitted.gameState as unknown as LadderRoomState).questions)
        .toHaveLength(1);
    });

    it("마지막 활성 제출은 질문을 보존하고 새 라운드 자료를 함께 만든다", () => {
      const room = prepareRoom();
      const first = changedRoom(applySubmit(room, "host", 15));
      const random = vi.fn(() => 0.9);
      const second = changedRoom(applySubmit(first, "guest-1", 16, {
        random,
        randomUUID: () => ROUND_2_ID,
      }));
      const state = second.gameState as unknown as LadderRoomState;

      expect(state).toMatchObject({
        phase: "compose",
        round: 2,
        roundId: ROUND_2_ID,
        roundPlayerIds: ["host", "guest-1"],
        roundTargetPlayerIds: ["host", "guest-1"],
      });
      expect(state.questions).toHaveLength(2);
      expect(state.questions.every(({ round, roundId }) =>
        round === 1 && roundId === ROUND_1_ID
      )).toBe(true);
      expect(state.grid).toHaveLength(10);
      expect(random).toHaveBeenCalledTimes(10);
    });

    it("세 번째 라운드의 비방장 마지막 제출이 같은 변경에서 놀이를 끝낸다", () => {
      let room = prepareRoom();
      room = submitRound(room, 20, ROUND_2_ID);
      room = submitRound(room, 30, ROUND_3_ID);
      room = changedRoom(applySubmit(room, "host", 40));
      const randomUUID = vi.fn(() => commandId(200));
      room = changedRoom(applySubmit(room, "guest-1", 41, { randomUUID }));
      const state = room.gameState as unknown as LadderRoomState;

      expect(room.status).toBe("ended");
      expect(state).toMatchObject({
        phase: "done",
        endReason: "completed",
        round: 3,
        roundId: ROUND_3_ID,
      });
      expect(state.questions).toHaveLength(6);
      expect(randomUUID).not.toHaveBeenCalled();
      expect(readLadderState(state)).not.toBeNull();
    });

    it("저장 대상과 현재 방 참가자 집합이 다르면 제출을 거절한다", () => {
      const room = prepareRoom(3);
      const mismatched: GameRoom = {
        ...room,
        players: room.players.slice(0, 2),
      };
      const result = applySubmit(mismatched, "host", 46);
      const repeatedPrepare = applyQuestionGameRoomCommand({
        room: mismatched,
        userId: "host",
        userName: "방장",
        action: "ladder-prepare",
        body: {
          commandId: commandId(47),
          expectedCreatedAt: mismatched.createdAt,
          expectedVersion: mismatched.version,
          playId: mismatched.playId,
          roundId: mismatched.gameState.roundId,
          topics: topics(2),
        },
        now: 500,
        random: () => 0.9,
        randomUUID: () => ROUND_2_ID,
      });

      expect(result).toMatchObject({ kind: "corrupt", room: mismatched });
      expect(repeatedPrepare).toMatchObject({
        kind: "corrupt",
        room: mismatched,
      });
    });

    it.each([
      ["실행", { playId: commandId(250) }],
      ["라운드", { roundId: commandId(251) }],
      ["기대 판본", { expectedVersion: 999 }],
    ])("이전 %s 식별값을 거절한다", (_name, body) => {
      const room = prepareRoom();
      const result = applySubmit(room, "host", 42, { body });

      expect(result).toMatchObject({ kind: "conflict", room });
    });
  });

  describe("이탈과 다시 시작", () => {
    it("마지막 미제출 대상 이탈은 둘 이상 남으면 다음 라운드로 이동한다", () => {
      let room = prepareRoom(3);
      room = changedRoom(applySubmit(room, "host", 50));
      room = changedRoom(applySubmit(room, "guest-1", 51));
      const random = vi.fn(() => 0.9);
      const result = leaveQuestionGameRoom({
        room,
        userId: "guest-2",
        random,
        randomUUID: () => ROUND_2_ID,
      });

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") throw new Error("이탈 결과가 필요합니다");
      const state = result.room.gameState as unknown as LadderRoomState;
      expect(result.room.players.map(({ id }) => id)).toEqual(["host", "guest-1"]);
      expect(state).toMatchObject({
        phase: "compose",
        round: 2,
        roundId: ROUND_2_ID,
        topicPool: topics(3),
        roundTopics: topics(2),
        roundPlayerIds: ["host", "guest-1"],
        roundTargetPlayerIds: ["host", "guest-1"],
      });
      expect(state.questions).toHaveLength(2);
      expect(random).toHaveBeenCalledTimes(10);
    });

    it("이탈 뒤 미제출 대상이 남으면 줄어든 대상만 같은 라운드에 저장한다", () => {
      let room = prepareRoom(3);
      room = changedRoom(applySubmit(room, "host", 53));
      const result = leaveQuestionGameRoom({
        room,
        userId: "guest-2",
        random: () => 0.9,
        randomUUID: () => ROUND_2_ID,
      });

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") throw new Error("이탈 결과가 필요합니다");
      expect(result.room.gameState).toMatchObject({
        phase: "compose",
        round: 1,
        roundPlayerIds: ["host", "guest-1", "guest-2"],
        roundTargetPlayerIds: ["host", "guest-1"],
      });
    });

    it("한 명만 남으면 완료로 덮지 않고 인원 부족 종료를 유지한다", () => {
      let room = prepareRoom();
      room = changedRoom(applySubmit(room, "host", 52));
      const random = vi.fn(() => 0.9);
      const randomUUID = vi.fn(() => ROUND_2_ID);
      const result = leaveQuestionGameRoom({
        room,
        userId: "guest-1",
        random,
        randomUUID,
      });

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") throw new Error("이탈 결과가 필요합니다");
      expect(result.room.status).toBe("ended");
      expect(result.room.gameState).toMatchObject({
        phase: "done",
        endReason: "insufficient-players",
        round: 1,
        roundId: ROUND_1_ID,
        roundTargetPlayerIds: ["host"],
      });
      expect(random).not.toHaveBeenCalled();
      expect(randomUUID).not.toHaveBeenCalled();
    });

    it("세 번째 라운드의 마지막 미제출 대상 이탈은 누적 질문을 보존하고 끝낸다", () => {
      let room = prepareRoom(3);
      room = submitRound(room, 60, ROUND_2_ID);
      room = submitRound(room, 70, ROUND_3_ID);
      room = changedRoom(applySubmit(room, "host", 80));
      room = changedRoom(applySubmit(room, "guest-1", 81));
      const result = leaveQuestionGameRoom({
        room,
        userId: "guest-2",
        random: () => 0.9,
        randomUUID: () => commandId(280),
      });

      expect(result.kind).toBe("changed");
      if (result.kind !== "changed") throw new Error("이탈 결과가 필요합니다");
      const state = result.room.gameState as unknown as LadderRoomState;
      expect(result.room.status).toBe("ended");
      expect(state).toMatchObject({
        phase: "done",
        endReason: "completed",
        round: 3,
      });
      expect(state.questions).toHaveLength(8);
    });

    it("여덟 명 시작 뒤 실제 이탈로 두 대상이 남아도 세 라운드를 정상 완료한다", () => {
      let room = prepareRoom(8);
      for (const playerId of [
        "guest-7",
        "guest-6",
        "guest-5",
        "guest-4",
        "guest-3",
        "guest-2",
      ]) {
        const left = leaveQuestionGameRoom({
          room,
          userId: playerId,
          random: () => 0.9,
          randomUUID: () => commandId(290),
        });
        expect(left.kind).toBe("changed");
        if (left.kind !== "changed") throw new Error("이탈 결과가 필요합니다");
        room = left.room;
      }

      expect(room.players.map(({ id }) => id)).toEqual(["host", "guest-1"]);
      expect(room.gameState).toMatchObject({
        round: 1,
        roundPlayerIds: makePlayers(8).map(({ id }) => id),
        roundTargetPlayerIds: ["host", "guest-1"],
      });

      room = submitRound(room, 130, ROUND_2_ID);
      room = submitRound(room, 140, ROUND_3_ID);
      room = changedRoom(applySubmit(room, "host", 150));
      room = changedRoom(applySubmit(room, "guest-1", 151));

      expect(room.status).toBe("ended");
      expect(room.gameState).toMatchObject({
        phase: "done",
        endReason: "completed",
        round: 3,
        roundTargetPlayerIds: ["host", "guest-1"],
      });
      expect((room.gameState as unknown as LadderRoomState).questions)
        .toHaveLength(6);
    });

    it.each([
      ["난수 없음", undefined, (): string => ROUND_2_ID],
      ["식별값 없음", (): number => 0.9, undefined],
      ["잘못된 난수", (): number => Number.NaN, (): string => ROUND_2_ID],
      ["잘못된 식별값", (): number => 0.9, (): string => "bad-id"],
    ] as const)("전환에 필요한 %s은 손상 결과가 된다", (_name, random, randomUUID) => {
      let room = prepareRoom(3);
      room = changedRoom(applySubmit(room, "host", 82));
      room = changedRoom(applySubmit(room, "guest-1", 83));
      const result = leaveQuestionGameRoom({
        room,
        userId: "guest-2",
        ...(random ? { random } : {}),
        ...(randomUUID ? { randomUUID } : {}),
      });

      expect(result).toMatchObject({ kind: "corrupt", room });
    });

    it("완료 뒤 이탈은 완료 질문을 보존하고 다시 시작하면 새 준비 상태가 된다", () => {
      let room = prepareRoom();
      room = submitRound(room, 90, ROUND_2_ID);
      room = submitRound(room, 100, ROUND_3_ID);
      room = changedRoom(applySubmit(room, "host", 110));
      room = changedRoom(applySubmit(room, "guest-1", 111));
      const left = leaveQuestionGameRoom({ room, userId: "guest-1" });
      expect(left.kind).toBe("changed");
      if (left.kind !== "changed") throw new Error("이탈 결과가 필요합니다");
      expect(left.room.gameState).toMatchObject({
        phase: "done",
        endReason: "completed",
        questions: expect.arrayContaining([
          expect.objectContaining({ playerId: "guest-1", round: 3 }),
        ]),
      });

      const restarted = restartQuestionGameRoom(left.room);
      expect(restarted.kind).toBe("changed");
      if (restarted.kind !== "changed") throw new Error("다시 시작 결과가 필요합니다");
      const started = applyQuestionGameRoomCommand({
        room: restarted.room,
        userId: "host",
        userName: "방장",
        action: "start",
        body: {
          commandId: commandId(120),
          expectedCreatedAt: restarted.room.createdAt,
          expectedVersion: restarted.room.version,
        },
        now: 900,
        random: () => 0.9,
        randomUUID: () => commandId(121),
      });
      const startedRoom = changedRoom(started);
      expect(startedRoom.gameState).toMatchObject({
        phase: "setup",
        round: 0,
        questions: [],
      });
    });
  });
});
