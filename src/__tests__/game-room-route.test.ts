// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomCompatibilityNotice from "@/app/(student)/student-question-play/games/RoomCompatibilityNotice";
import { BUILT_IN_GAMES, type GameRoom } from "@/lib/question-games-data";
import { createMemoryState } from "@/lib/question-game-room-engines/memory";
import {
  createMysteryState,
  type MysteryRoomState,
} from "@/lib/question-game-room-engines/mystery";
import {
  createLadderState,
  type LadderRoomState,
} from "@/lib/question-game-room-engines/ladder";
import {
  applyQuestionGameRoomCommand,
  hasQuestionGameRoomEngine,
} from "@/lib/question-game-room-engine";
import { readRelayPublicState } from "@/lib/question-game-room-engines/turn-games";
import { assignLadderTopics, generateLadderGrid } from "@/lib/question-ladder";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    gameRoom: {},
    gameRoomCreateAttempt: {},
  };
  return {
    tx,
    transaction: vi.fn(),
    auth: vi.fn(),
    loadGameRoom: vi.fn(),
    saveGameRoom: vi.fn(),
    deleteGameRoom: vi.fn(),
    createGameRoom: vi.fn(),
    consumeCreateLimit: vi.fn(),
    cleanupIfDue: vi.fn(),
    checkRateLimit: vi.fn((): Response | null => null),
    recordMemoryRoll: vi.fn(),
    settleMemoryRollingRoom: vi.fn((room: GameRoom) => room),
    loadVerifiedGameAwardResult: vi.fn(),
    deleteGameRoomPresence: vi.fn(),
    generateMysteryAiAnswer: vi.fn(),
    ensureQuestionGameRoomPoints: vi.fn(),
    settlementFindUnique: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/game-room-create-rate-limit", () => ({
  consumeGameRoomCreateLimit: mocks.consumeCreateLimit,
}));
vi.mock("@/lib/game-room-cleanup-service", () => ({
  cleanupExpiredGameRoomsIfDue: mocks.cleanupIfDue,
}));
vi.mock("@/lib/game-room-store", () => ({
  loadGameRoom: mocks.loadGameRoom,
  loadLockedGameRoom: mocks.loadGameRoom,
  saveGameRoom: mocks.saveGameRoom,
  deleteGameRoom: mocks.deleteGameRoom,
  deleteGameRoomPresence: mocks.deleteGameRoomPresence,
  createGameRoom: mocks.createGameRoom,
  isStaleRoomAction: (room: GameRoom, expected: unknown) =>
    typeof expected === "number" && expected !== room.version,
}));
vi.mock("@/lib/memory-room-roll", () => ({
  recordMemoryRoll: mocks.recordMemoryRoll,
  settleMemoryRollingRoom: mocks.settleMemoryRollingRoom,
}));
vi.mock("@/lib/mystery-box-ai-answer", () => ({
  findMysteryAiAnswerRequest: (
    result: {
      kind?: unknown;
      resolution?: { playerId?: unknown } & Record<string, unknown>;
    },
    userId: string,
  ) => result.kind === "resolution-required" &&
      result.resolution?.playerId === userId
    ? { ...result.resolution }
    : null,
  generateMysteryAiAnswer: mocks.generateMysteryAiAnswer,
}));
vi.mock("@/lib/question-game-award-publish-service", () => ({
  loadVerifiedGameAwardResult: mocks.loadVerifiedGameAwardResult,
}));
vi.mock("@/lib/point-award-service", () => ({
  ensureQuestionGameRoomPoints: mocks.ensureQuestionGameRoomPoints,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    gameRoomSettlement: { findUnique: mocks.settlementFindUnique },
  },
}));
import { POST } from "@/app/api/question-games/rooms/route";
import { GET, PATCH } from "@/app/api/question-games/rooms/[code]/route";

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "user-1",
    status: "waiting",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makePlayers(count: number): GameRoom["players"] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "user-1" : `user-${index + 1}`,
    name: `학생 ${index + 1}`,
    isHost: index === 0,
    joinedAt: index + 1,
  }));
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/question-games/rooms/1234", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

function get() {
  return GET(
    new Request("http://localhost/api/question-games/rooms/1234") as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

function create(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/question-games/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  mocks.transaction.mockReset().mockImplementation(
    (callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx),
  );
  mocks.tx.$queryRaw.mockReset().mockResolvedValue([{ lock: "" }]);
  mocks.tx.user.findUnique.mockReset().mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      name: where.id === "user-1" ? "학생" : where.id,
      role: "STUDENT",
    }),
  );
  mocks.auth.mockReset().mockResolvedValue({
    user: { id: "user-1", name: "학생" },
  });
  mocks.loadGameRoom.mockReset();
  mocks.saveGameRoom.mockReset();
  mocks.deleteGameRoom.mockReset();
  mocks.createGameRoom.mockReset();
  mocks.checkRateLimit.mockReset().mockReturnValue(null);
  mocks.recordMemoryRoll.mockReset();
  mocks.loadVerifiedGameAwardResult.mockReset();
  mocks.deleteGameRoomPresence.mockReset().mockResolvedValue(undefined);
  mocks.generateMysteryAiAnswer.mockReset();
  mocks.ensureQuestionGameRoomPoints.mockReset().mockResolvedValue(null);
  mocks.settlementFindUnique.mockReset().mockResolvedValue({ outcome: "AWARDED" });
  mocks.consumeCreateLimit.mockReset().mockResolvedValue(true);
  mocks.cleanupIfDue.mockReset().mockResolvedValue(null);
  mocks.settleMemoryRollingRoom
    .mockReset()
    .mockImplementation((room: GameRoom) => room);
});

describe("방 판정기 등록 경계", () => {
  it("기본 제공 놀이 일곱 개가 모두 서버 판정기에 등록되어 있다", () => {
    expect(BUILT_IN_GAMES.map(({ id }) => [id, hasQuestionGameRoomEngine(id)]))
      .toEqual(BUILT_IN_GAMES.map(({ id }) => [id, true]));
  });
});

describe("질문 릴레이 실제 저장소 반환 경계", () => {
  const playId = "11111111-1111-4111-8111-111111111111";
  const roundId = "22222222-2222-4222-8222-222222222222";
  const startCommandId = "33333333-3333-4333-8333-333333333333";
  const topicCommandId = "44444444-4444-4444-8444-444444444444";
  const firstCommandId = "55555555-5555-4555-8555-555555555555";
  const secondCommandId = "66666666-6666-4666-8666-666666666666";

  function changedRelayRoom(
    room: GameRoom,
    userId: string,
    action: string,
    body: Record<string, unknown>,
    randomUUID: () => string,
  ): GameRoom {
    const user = room.players.find(({ id }) => id === userId)!;
    const result = applyQuestionGameRoomCommand({
      room,
      userId,
      userName: user.name,
      action,
      body,
      now: 10,
      random: () => 0,
      randomUUID,
    });
    expect(result.kind).toBe("changed");
    if (result.kind !== "changed") throw new Error("질문 릴레이 변경 결과가 필요합니다");
    return result.room;
  }

  function storedRelayRoom(): GameRoom {
    let room = makeRoom({
      gameId: "relay",
      players: makePlayers(2),
    });
    room = changedRelayRoom(room, "user-1", "start", {
      commandId: startCommandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
    }, () => playId);
    room = changedRelayRoom(room, "user-1", "relay-set-topic", {
      commandId: topicCommandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
      topic: "우주",
    }, () => roundId);
    room = changedRelayRoom(room, "user-1", "relay-submit-question", {
      commandId: firstCommandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
      roundId,
      locale: "ko",
      question: "우주에는 왜 별이 많을까요?",
    }, () => "77777777-7777-4777-8777-777777777777");
    return {
      ...room,
      chain: room.chain.map((item) => ({
        round: item.round,
        roundId: item.roundId,
        playerId: item.playerId,
        question: item.question,
        playerName: item.playerName,
      })),
    };
  }

  it("자료 저장소에서 속성 순서가 바뀐 첫 질문 뒤 친구의 둘째 질문을 저장한다", async () => {
    const room = storedRelayRoom();
    const state = readRelayPublicState(room.gameState)!;
    mocks.auth.mockResolvedValue({
      user: { id: "user-2", name: "학생 2" },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved" as const,
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "relay-submit-question",
      commandId: secondCommandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
      roundId: state.roundId,
      locale: "ko",
      question: "별빛은 지구까지 얼마나 걸려서 올까요?",
    });

    expect(response.status).toBe(200);
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      chain: expect.arrayContaining([
        expect.objectContaining({
          playerId: "user-2",
          question: "별빛은 지구까지 얼마나 걸려서 올까요?",
        }),
      ]),
    }));
  });
});

afterEach(cleanup);

describe("공개 방 응답", () => {
  it("방 생성 성공 응답에서 비공개 상태를 제거한다", async () => {
    const room = makeRoom({
      gameState: { phase: "waiting", private: { answer: "사과" } },
    });
    mocks.createGameRoom.mockResolvedValue(room);

    const response = await create({ gameId: "dice" });

    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "waiting" });
    expect(room.gameState.private).toEqual({ answer: "사과" });
  });

  it("조회 응답에서 비공개 상태를 제거한다", async () => {
    const room = makeRoom({
      gameState: { phase: "play", private: { answer: "사과" } },
    });
    mocks.loadGameRoom.mockResolvedValue(room);

    const response = await get();

    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "play" });
    expect(room.gameState.private).toEqual({ answer: "사과" });
  });

  it("정상 완료 방 조회는 빠진 포인트 지급과 결과 저장을 다시 시도한다", async () => {
    const awardResult = {
      awards: [{
        studentId: "user-1",
        bonusType: "PARTICIPATION",
        points: 1,
        reason: "게임 참여",
      }],
    };
    const room = makeRoom({
      status: "ended",
      playId: "11111111-1111-4111-8111-111111111111",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
      },
    });
    const settled = { ...room, version: room.version + 1, awardResult };
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.ensureQuestionGameRoomPoints.mockResolvedValue(awardResult);
    mocks.saveGameRoom.mockResolvedValue({ kind: "saved", room: settled });

    const response = await get();

    expect(response.status).toBe(200);
    expect(mocks.ensureQuestionGameRoomPoints).toHaveBeenCalledWith(room);
    expect(mocks.saveGameRoom).toHaveBeenCalledWith({ ...room, awardResult });
    await expect(response.json()).resolves.toMatchObject({
      room: { awardResult },
    });
  });

  it("정상 완료 방의 첫 지급 실패 뒤 다음 조회에서 다시 지급한다", async () => {
    const awardResult = {
      awards: [{
        studentId: "user-1",
        bonusType: "COMPLETION",
        points: 5,
        reason: "게임 완료",
      }],
    };
    const room = makeRoom({
      status: "ended",
      playId: "11111111-1111-4111-8111-111111111111",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.ensureQuestionGameRoomPoints
      .mockRejectedValueOnce(new Error("일시 오류"))
      .mockResolvedValueOnce(awardResult);
    mocks.saveGameRoom.mockResolvedValue({
      kind: "saved",
      room: { ...room, version: 2, awardResult },
    });

    const first = await get();
    const second = await get();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.ensureQuestionGameRoomPoints).toHaveBeenCalledTimes(2);
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
    await expect(second.json()).resolves.toMatchObject({
      room: { awardResult },
    });
  });

  it("점수 결과 저장 충돌에 같은 실행의 최신 방을 반환한다", async () => {
    const awardResult = {
      awards: [{
        studentId: "user-1",
        bonusType: "COMPLETION",
        points: 5,
        reason: "게임 완료",
      }],
    };
    const room = makeRoom({
      status: "ended",
      playId: "11111111-1111-4111-8111-111111111111",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
      },
    });
    const latest = { ...room, version: 2, awardResult };
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.ensureQuestionGameRoomPoints.mockResolvedValue(awardResult);
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      room: { version: 2, awardResult },
    });
  });

  it("검증된 점수 결과가 이미 있는 완료 방 조회는 지급을 다시 확인하지 않는다", async () => {
    const awardResult = {
      awards: [{
        studentId: "user-1",
        bonusType: "COMPLETION",
        points: 5,
        reason: "게임 완료",
      }],
    };
    const room = makeRoom({
      status: "ended",
      playId: "11111111-1111-4111-8111-111111111111",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      awardResult,
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);

    const response = await get();

    expect(response.status).toBe(200);
    expect(mocks.ensureQuestionGameRoomPoints).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("참가 응답에서 비공개 상태를 제거한다", async () => {
    const room = makeRoom({
      hostId: "host",
      players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
      gameState: { phase: "play", private: { answer: "사과" } },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({ action: "join" });

    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "play" });
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      gameState: { phase: "play", private: { answer: "사과" } },
    }), mocks.tx);
  });

  it("충돌 응답에서 비공개 상태를 제거한다", async () => {
    const room = makeRoom({
      version: 2,
      gameState: { phase: "play", private: { answer: "사과" } },
    });
    mocks.loadGameRoom.mockResolvedValue(room);

    const response = await patch({ action: "start", expectedVersion: 1 });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "play" });
    expect(room.gameState.private).toEqual({ answer: "사과" });
  });

  it("나가기 응답에서 비공개 상태를 제거하고 저장 자료는 유지한다", async () => {
    const room = makeRoom({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
      ],
      gameState: { phase: "play", private: { answer: "사과" } },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({ action: "leave" });

    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "play" });
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      gameState: { phase: "play", private: { answer: "사과" } },
    }));
    expect(mocks.deleteGameRoomPresence).toHaveBeenCalledWith({
      roomCode: "1234",
      roomCreatedAt: 1,
      userId: "user-1",
    });
  });

  it("일반 성공 응답에서만 비공개 상태를 제거한다", async () => {
    const room = makeRoom({
      gameId: "custom-game",
      gameState: { phase: "play" },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "update-state",
      expectedVersion: 1,
      patch: { private: { answer: "사과" } },
    });

    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "play" });
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      gameState: { phase: "play", private: { answer: "사과" } },
    }));
  });

  it("다시 시작 성공 응답에서 비공개 상태를 제거한다", async () => {
    const room = makeRoom({ status: "ended" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: {
        ...candidate,
        version: candidate.version + 1,
        gameState: { phase: "waiting", private: { answer: "사과" } },
      },
    }));

    const response = await patch({
      action: "restart",
      commandId: "11111111-1111-4111-8111-111111111111",
      expectedCreatedAt: 1,
      expectedVersion: 1,
    });

    const body = await response.json();
    expect(body.room.gameState).toEqual({ phase: "waiting" });
  });

  it("새 내장 놀이를 시작할 때 서버 상태와 점수 버전 2를 저장한다", async () => {
    const room = makeRoom({ players: makePlayers(2) });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "start",
      commandId: "11111111-1111-4111-8111-111111111111",
      expectedCreatedAt: 1,
      expectedVersion: 1,
    });

    expect(response.status).toBe(200);
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: expect.objectContaining({
        stateVersion: 2,
        game: "dice",
        phase: "roll",
      }),
    }));
  });
});

describe("방 조회 version 단축 응답", () => {
  function getWithVersion(version: unknown) {
    return GET(
      new Request(
        `http://localhost/api/question-games/rooms/1234?version=${String(version)}`,
      ) as never,
      { params: Promise.resolve({ code: "1234" }) },
    );
  }

  it("클라이언트가 아는 version과 같으면 본문 없이 304를 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ version: 3 }));

    const response = await getWithVersion(3);

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("version이 다르면 전체 방을 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ version: 5 }));

    const response = await getWithVersion(3);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.room.version).toBe(5);
  });

  it("version 값이 숫자가 아니면 무시하고 전체 방을 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ version: 3 }));

    const response = await getWithVersion("abc");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.room.version).toBe(3);
  });

  it("비참가자는 version이 같아도 403을 받는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-9", name: "외부인" } });
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ version: 3 }));

    const response = await getWithVersion(3);

    expect(response.status).toBe(403);
  });

  it("완료 방 포인트 지급으로 방이 갱신되면 같은 version 요청에도 갱신된 방을 반환한다", async () => {
    const awardResult = {
      awards: [{
        studentId: "user-1",
        bonusType: "PARTICIPATION",
        points: 1,
        reason: "게임 참여",
      }],
    };
    const room = makeRoom({
      status: "ended",
      version: 3,
      playId: "11111111-1111-4111-8111-111111111111",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.ensureQuestionGameRoomPoints.mockResolvedValue(awardResult);
    mocks.saveGameRoom.mockImplementation(async (next: GameRoom) => ({
      kind: "saved" as const,
      room: { ...next, version: next.version + 1 },
    }));

    const response = await getWithVersion(3);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.room.version).toBe(4);
    expect(body.room.awardResult).toEqual(awardResult);
  });
});

describe("미스터리 박스 실제 공개 응답", () => {
  const playId = "11111111-1111-4111-8111-111111111111";
  const roundId = "22222222-2222-4222-8222-222222222222";
  const commandId = "33333333-3333-4333-8333-333333333333";

  function makeMysteryRoom(
    state: MysteryRoomState = createMysteryState(),
    overrides: Partial<GameRoom> = {},
  ): GameRoom {
    return makeRoom({
      gameId: "mystery-box",
      status: "playing",
      players: makePlayers(2),
      playId,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: state,
      ...overrides,
    });
  }

  function makeMysteryPlayState(
    overrides: Partial<MysteryRoomState> = {},
  ): MysteryRoomState {
    return {
      ...createMysteryState(),
      phase: "play",
      roundId,
      round: 1,
      turnOrder: ["user-1", "user-2"],
      scores: { "user-1": 0, "user-2": 0 },
      private: { itemId: "apple" },
      ...overrides,
    };
  }

  it("준비 성공은 저장 후보에만 서버 물건을 둔다", async () => {
    const room = makeMysteryRoom();
    let savedCandidate: GameRoom | null = null;
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => {
      savedCandidate = structuredClone(candidate);
      return {
        kind: "saved" as const,
        room: { ...candidate, version: candidate.version + 1 },
      };
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const response = await patch({
        action: "mystery-start",
        commandId,
        expectedCreatedAt: room.createdAt,
        expectedVersion: room.version,
        playId,
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(savedCandidate).not.toBeNull();
      expect(savedCandidate!.gameState).toHaveProperty("private.itemId", "apple");
      expect(body.room.gameState).not.toHaveProperty("private");
      expect(body.room.gameState).not.toHaveProperty("answer");
      expect(room.gameState).not.toHaveProperty("private");
    } finally {
      random.mockRestore();
    }
  });

  it("미등록 질문은 서버 에이아이 답과 출처를 한 번 저장하고 클라이언트 해결값을 무시한다", async () => {
    const question = "비가 오면 잘 자라나요?";
    const state = makeMysteryPlayState();
    const room = makeMysteryRoom(state);
    let savedCandidate: GameRoom | null = null;
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.generateMysteryAiAnswer.mockImplementation(
      async (_userId: string, request: Record<string, unknown>) => ({
        ...request,
        answer: "yes",
      }),
    );
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => {
      savedCandidate = structuredClone(candidate);
      return {
        kind: "saved" as const,
        room: { ...candidate, version: candidate.version + 1 },
      };
    });

    const response = await patch({
      action: "mystery-ask",
      commandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
      roundId,
      locale: "ko",
      question,
      answer: "no",
      answerSource: "client",
      itemId: "book",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateMysteryAiAnswer).toHaveBeenCalledWith("user-1", {
      itemId: "apple",
      playerId: "user-1",
      locale: "ko",
      question,
      knowledgeVersion: 2,
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "game-room-mystery-ai:user-1",
      20,
    );
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
    expect(savedCandidate!.gameState).toMatchObject({
      scores: { "user-1": 1, "user-2": 0 },
      history: [{
        kind: "question",
        playerId: "user-1",
        locale: "ko",
        question,
        answer: "yes",
        answerSource: "ai",
      }],
      private: { itemId: "apple" },
    });
    expect(body.room.gameState.history[0]).toMatchObject({
      question,
      answer: "yes",
      answerSource: "ai",
    });
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(JSON.stringify(body)).not.toContain("apple");
  });

  it("등록된 규칙 질문은 에이아이 없이 기존 답을 저장한다", async () => {
    const question = "먹을 수 있나요?";
    const state = makeMysteryPlayState();
    const room = makeMysteryRoom(state);
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved" as const,
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "mystery-ask",
      commandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
      roundId,
      locale: "ko",
      question,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.room.gameState.history[0]).toMatchObject({
      question,
      answer: "yes",
    });
    expect(body.room.gameState.history[0]).not.toHaveProperty("answerSource");
    expect(mocks.generateMysteryAiAnswer).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalledWith(
      "game-room-mystery-ai:user-1",
      20,
    );
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });

  it("미등록 질문의 에이아이 실패는 임시 답변으로 질문과 점수 및 다음 차례를 저장한다", async () => {
    const question = "비가 오면 잘 자라나요?";
    const state = makeMysteryPlayState();
    const room = makeMysteryRoom(state);
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.generateMysteryAiAnswer.mockRejectedValue(
      new Error(`raw apple ${question}`),
    );
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved" as const,
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "mystery-ask",
      commandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
      roundId,
      locale: "ko",
      question,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.room.gameState).toMatchObject({
      currentTurnIdx: 1,
      scores: { "user-1": 1, "user-2": 0 },
      history: [{
        question,
        answer: "unknown",
        answerSource: "fallback",
      }],
    });
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
    expect(state.history).toEqual([]);
    expect(state.scores).toEqual({ "user-1": 0, "user-2": 0 });
    expect(state.currentTurnIdx).toBe(0);
  });

  it("조회와 같은 명령 재생 응답은 저장 상태를 바꾸지 않고 비밀을 뺀다", async () => {
    const state = makeMysteryPlayState({ recentCommandIds: [commandId] });
    const room = makeMysteryRoom(state);
    mocks.loadGameRoom.mockResolvedValue(room);

    const pollResponse = await get();
    const replayResponse = await patch({
      action: "mystery-start",
      commandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version - 1,
      playId,
    });
    const [pollBody, replayBody] = await Promise.all([
      pollResponse.json(),
      replayResponse.json(),
    ]);

    expect([pollResponse.status, replayResponse.status]).toEqual([200, 200]);
    expect(pollBody.room.gameState).not.toHaveProperty("private");
    expect(replayBody.room.gameState).not.toHaveProperty("private");
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    expect(state.private).toEqual({ itemId: "apple" });
  });

  it("조회 응답은 중첩된 미스터리 비공개 복사본도 제거한다", async () => {
    const marker = "copied-secret";
    const state = {
      ...makeMysteryPlayState({ scores: { "user-1": 1, "user-2": 0 } }),
      history: [{
        kind: "question",
        playerId: "user-1",
        playerName: "학생 1",
        locale: "ko",
        question: "먹을 수 있나요?",
        answer: "yes",
        private: { itemId: marker },
      }],
      private: { itemId: "apple", copied: { itemId: marker } },
      answer: { ko: marker, en: marker, itemId: marker },
      itemId: marker,
      copied: { itemId: marker },
    } as unknown as MysteryRoomState;
    const room = makeMysteryRoom(state);
    mocks.loadGameRoom.mockResolvedValue(room);

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body.room.gameState)).not.toContain(marker);
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(body.room.gameState).not.toHaveProperty("answer");
    expect(body.room.gameState.history[0]).toEqual({
      kind: "question",
      playerId: "user-1",
      playerName: "학생 1",
      locale: "ko",
      question: "먹을 수 있나요?",
      answer: "yes",
    });
    expect(JSON.stringify(state)).toContain(marker);
  });

  it("저장 충돌 응답은 최신 방의 비밀을 제거하고 원본은 유지한다", async () => {
    const initial = makeMysteryRoom();
    const latestState = makeMysteryPlayState();
    const latest = makeMysteryRoom(latestState, { version: 2 });
    mocks.loadGameRoom.mockResolvedValue(initial);
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch({
      action: "mystery-start",
      commandId,
      expectedCreatedAt: initial.createdAt,
      expectedVersion: initial.version,
      playId,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(latestState.private).toEqual({ itemId: "apple" });
  });

  it("나가기 응답은 저장할 비밀과 공개 정답을 분리한다", async () => {
    const state = makeMysteryPlayState();
    const room = makeMysteryRoom(state);
    let savedCandidate: GameRoom | null = null;
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => {
      savedCandidate = structuredClone(candidate);
      return {
        kind: "saved" as const,
        room: { ...candidate, version: candidate.version + 1 },
      };
    });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(savedCandidate!.gameState).toHaveProperty("private.itemId", "apple");
    expect(savedCandidate!.gameState).toHaveProperty("answer.ko", "사과");
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(body.room.gameState).toHaveProperty("answer.ko", "사과");
    expect(state.private).toEqual({ itemId: "apple" });
  });

  it("다시 시작 응답은 끝난 저장 상태의 비밀을 내보내지 않는다", async () => {
    const state = makeMysteryPlayState({
      phase: "done",
      round: 1,
      history: [{
        kind: "guess",
        playerId: "user-1",
        playerName: "학생 1",
        locale: "ko",
        guess: "사과",
        correct: true,
      }],
      winnerId: "user-1",
      answer: { ko: "사과", en: "apple" },
      endReason: "completed",
    });
    const room = makeMysteryRoom(state, { status: "ended" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved" as const,
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "restart",
      commandId,
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(body.room.gameState).toEqual({});
    expect(state.private).toEqual({ itemId: "apple" });
  });

  it.each([
    ["정답 완료", "completed"],
    ["인원 부족 종료", "insufficient-players"],
  ] as const)("마지막 참가자는 %s 방을 안전하게 삭제한다", async (_name, endReason) => {
    const completed = endReason === "completed";
    const state = makeMysteryPlayState({
      phase: "done",
      round: 1,
      turnOrder: ["user-1"],
      currentTurnIdx: 0,
      history: completed
        ? [{
            kind: "guess",
            playerId: "user-1",
            playerName: "학생 1",
            locale: "ko",
            guess: "사과",
            correct: true,
          }]
        : [],
      scores: { "user-1": 0 },
      ...(completed ? { winnerId: "user-1" } : {}),
      answer: { ko: "사과", en: "apple" },
      endReason,
    });
    const room = makeMysteryRoom(state, {
      status: "ended",
      players: makePlayers(1),
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.deleteGameRoom.mockResolvedValue({ kind: "deleted", room: null });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      room: null,
      deleted: true,
    });
    expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(1);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });
});

describe("질문 사다리 실제 명령 경로", () => {
  const playId = "11111111-1111-4111-8111-111111111111";
  const roundId = "22222222-2222-4222-8222-222222222222";
  const hostCommandId = "33333333-3333-4333-8333-333333333333";
  const guestCommandId = "44444444-4444-4444-8444-444444444444";

  function makeLadderState(
    overrides: Partial<LadderRoomState> = {},
  ): LadderRoomState {
    const players = makePlayers(2);
    const roundTopics = ["물", "빛"];
    const grid = generateLadderGrid(2, () => 0.9);
    const assignments = assignLadderTopics(roundTopics, grid).map(
      (assignment, index) => ({
        playerId: players[index].id,
        playerName: players[index].name,
        ...assignment,
      }),
    );
    return {
      ...createLadderState(),
      phase: "compose",
      roundId,
      round: 1,
      topicPool: [...roundTopics],
      roundTopics,
      grid,
      roundPlayerIds: players.map(({ id }) => id),
      roundTargetPlayerIds: players.map(({ id }) => id),
      assignments,
      ...overrides,
    };
  }

  function makeLadderRoom(
    state: LadderRoomState,
    version: number,
  ): GameRoom {
    return makeRoom({
      gameId: "ladder",
      status: "playing",
      players: makePlayers(2),
      playId,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: state,
      version,
    });
  }

  it("다른 참가자 저장 경합 뒤 최신 판본 재시도에 두 질문을 모두 보존한다", async () => {
    const initial = makeLadderRoom(makeLadderState(), 1);
    const guestQuestion = {
      roundId,
      round: 1,
      playerId: "user-2",
      playerName: "학생 2",
      topic: "빛",
      question: "빛은 왜 필요할까요?",
      locale: "ko" as const,
    };
    const latestState = makeLadderState({
      recentCommandIds: [guestCommandId],
      questions: [guestQuestion],
    });
    const latest = makeLadderRoom(latestState, 2);
    mocks.loadGameRoom.mockResolvedValueOnce(initial).mockResolvedValueOnce(latest);
    mocks.saveGameRoom
      .mockResolvedValueOnce({ kind: "conflict", room: latest })
      .mockImplementationOnce(async (candidate: GameRoom) => ({
        kind: "saved" as const,
        room: { ...candidate, version: candidate.version + 1 },
      }));

    const firstResponse = await patch({
      action: "ladder-submit-question",
      commandId: hostCommandId,
      expectedCreatedAt: initial.createdAt,
      expectedVersion: initial.version,
      playId,
      roundId,
      locale: "ko",
      question: "물은 왜 중요할까요?",
    });
    expect(firstResponse.status).toBe(409);

    const retryResponse = await patch({
      action: "ladder-submit-question",
      commandId: hostCommandId,
      expectedCreatedAt: latest.createdAt,
      expectedVersion: latest.version,
      playId,
      roundId,
      locale: "ko",
      question: "물은 왜 중요할까요?",
    });
    const body = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(body.room.gameState.questions).toEqual([
      guestQuestion,
      expect.objectContaining({
        playerId: "user-1",
        playerName: "학생 1",
        topic: "물",
        question: "물은 왜 중요할까요?",
      }),
    ]);
    expect(latestState.questions).toEqual([guestQuestion]);
  });
});

describe("버전 2 짝 찾기 명령 응답", () => {
  it("서로 다른 복원 명령의 저장 경쟁 패자도 최신 방에서 재생 성공한다", async () => {
    const playId = "11111111-1111-4111-8111-111111111111";
    const roundId = "22222222-2222-4222-8222-222222222222";
    const revealId = "33333333-3333-4333-8333-333333333333";
    const pairs = Array.from({ length: 6 }, (_, index) => ({
      id: `pair-${index}`,
      question: `질문 ${index + 1}?`,
      answer: `대답 ${index + 1}`,
    }));
    const room = makeRoom({
      gameId: "memory",
      status: "playing",
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "user-2", name: "친구", isHost: false, joinedAt: 2 },
      ],
      playId,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        ...createMemoryState(),
        phase: "play",
        roundId,
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
        diceRolls: { "user-1": 6, "user-2": 5 },
        turnOrder: ["user-1", "user-2"],
        scores: { "user-1": 0, "user-2": 0 },
        revealedIds: ["q-0", "a-1"],
        attempts: 1,
        maxAttempts: 18,
        lastReveal: {
          revealId,
          result: "miss",
          turnPlayerId: "user-1",
          resolveAt: 3_500,
        },
      },
    });
    let latest: GameRoom | null = null;
    mocks.auth
      .mockResolvedValueOnce({ user: { id: "user-1", name: "학생" } })
      .mockResolvedValueOnce({ user: { id: "user-2", name: "친구" } });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => {
      if (latest === null) {
        latest = { ...candidate, version: 2, updatedAt: 4_000 };
        return { kind: "saved" as const, room: latest };
      }
      return { kind: "conflict" as const, room: latest };
    });
    const now = vi.spyOn(Date, "now").mockReturnValue(4_000);

    try {
      const [first, second] = await Promise.all([
        patch({
          action: "memory-resolve-miss",
          commandId: "44444444-4444-4444-8444-444444444444",
          expectedCreatedAt: room.createdAt,
          expectedVersion: room.version,
          playId,
          roundId,
          revealId,
        }),
        patch({
          action: "memory-resolve-miss",
          commandId: "55555555-5555-4555-8555-555555555555",
          expectedCreatedAt: room.createdAt,
          expectedVersion: room.version,
          playId,
          roundId,
          revealId,
        }),
      ]);

      expect([first.status, second.status]).toEqual([200, 200]);
      await expect(first.json()).resolves.toMatchObject({
        room: { version: 2 },
      });
      await expect(second.json()).resolves.toMatchObject({
        room: {
          version: 2,
          gameState: { lastResolvedRevealId: revealId },
        },
      });
      expect(mocks.saveGameRoom).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it("등록 판정기의 복원 대기 결과를 응답까지 그대로 전달한다", async () => {
    const playId = "11111111-1111-4111-8111-111111111111";
    const roundId = "22222222-2222-4222-8222-222222222222";
    const revealId = "33333333-3333-4333-8333-333333333333";
    const pairs = Array.from({ length: 6 }, (_, index) => ({
      id: `pair-${index}`,
      question: `질문 ${index + 1}?`,
      answer: `대답 ${index + 1}`,
    }));
    const room = makeRoom({
      gameId: "memory",
      status: "playing",
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
      ],
      playId,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
      gameState: {
        ...createMemoryState(),
        phase: "play",
        roundId,
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
        diceRolls: { "user-1": 6, other: 5 },
        turnOrder: ["user-1", "other"],
        scores: { "user-1": 0, other: 0 },
        revealedIds: ["q-0", "a-1"],
        attempts: 1,
        maxAttempts: 18,
        lastReveal: {
          revealId,
          result: "miss",
          turnPlayerId: "user-1",
          resolveAt: 3_500,
        },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_100);

    try {
      const response = await patch({
        action: "memory-resolve-miss",
        commandId: "44444444-4444-4444-8444-444444444444",
        expectedCreatedAt: room.createdAt,
        expectedVersion: room.version,
        playId,
        roundId,
        revealId,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        room: { code: room.code, version: room.version },
        result: { retryAfterMs: 2_400 },
      });
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });
});

describe("방 생성 시각 경계", () => {
  it.each([
    ["start", {}],
    ["leave", {}],
    ["memory-roll", { roll: 5, rollRoundId: "round-1" }],
  ])(
    "%s의 다른 expectedCreatedAt은 저장 전에 409를 반환한다",
    async (action, extra) => {
      const room = makeRoom({ createdAt: 2, updatedAt: 2 });
      mocks.loadGameRoom.mockResolvedValue(room);

      const response = await patch({
        action,
        expectedCreatedAt: 1,
        expectedVersion: 1,
        ...extra,
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ room });
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
      expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
      expect(mocks.recordMemoryRoll).not.toHaveBeenCalled();
    },
  );
});

describe("일반 게임 동작 충돌", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["update-state", { patch: { score: 1 } }],
    ["set-state", { state: { score: 1 } }],
    ["next-turn", {}],
    ["set-topic", { topic: "물" }],
    ["end", {}],
    ["restart", {}],
  ];

  it.each(cases)(
    "%s 저장 충돌은 최신 방과 409를 반환한다",
    async (action, extra) => {
      const current = makeRoom({
        gameId: "custom-game",
        status: "playing",
      });
      const latest = makeRoom({
        gameId: "custom-game",
        status: "playing",
        version: 2,
        topic: "최신",
      });
      mocks.loadGameRoom.mockResolvedValue(current);
      mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

      const response = await patch({
        action,
        expectedVersion: 1,
        ...extra,
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ room: latest });
    },
  );

  it("새 내장 놀이 start 저장 충돌은 최신 방과 409를 반환한다", async () => {
    const current = makeRoom({ gameId: "dice", players: makePlayers(2) });
    const latest = makeRoom({
      gameId: "dice",
      players: makePlayers(2),
      version: 2,
      topic: "최신",
    });
    mocks.loadGameRoom.mockResolvedValue(current);
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch({
      action: "start",
      commandId: "12111111-1111-4111-8111-111111111111",
      expectedCreatedAt: current.createdAt,
      expectedVersion: current.version,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ room: latest });
  });

  it("저장 전에 방이 사라지면 404를 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ gameId: "custom-game" }));
    mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

    const response = await patch({
      action: "set-topic",
      expectedVersion: 1,
      topic: "물",
    });

    expect(response.status).toBe(404);
  });
});

describe("memory-roll 요청", () => {
  it("저장 결과는 주사위 값과 재생 여부를 반환한다", async () => {
    const room = makeRoom({ gameId: "memory" });
    const savedRoom = makeRoom({
      gameId: "memory",
      version: 2,
      gameState: {
        phase: "rolling",
        diceRolls: { "user-1": 5 },
        private: { answer: "사과" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({
      kind: "saved",
      room: savedRoom,
      roll: 5,
      replayed: false,
    });

    const response = await patch({
      action: "memory-roll",
      roll: 5,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      room: {
        ...savedRoom,
        gameState: { phase: "rolling", diceRolls: { "user-1": 5 } },
      },
      result: { roll: 5, replayed: false },
    });
    expect(savedRoom.gameState.private).toEqual({ answer: "사과" });
    expect(mocks.recordMemoryRoll).toHaveBeenCalledWith({
      initialRoom: room,
      userId: "user-1",
      roll: 5,
      rollRoundId: "round-1",
    });
  });

  it("같은 값 재전송은 재생 결과를 반환한다", async () => {
    const room = makeRoom({ gameId: "memory" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({
      kind: "replayed",
      room,
      roll: 3,
      replayed: true,
    });

    const response = await patch({
      action: "memory-roll",
      roll: 3,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      room,
      result: { roll: 3, replayed: true },
    });
  });

  it("잘못된 메모리 주사위 요청은 400을 반환한다", async () => {
    const room = makeRoom({ gameId: "memory" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({
      kind: "invalid",
      room,
      reason: "roll",
    });

    const response = await patch({
      action: "memory-roll",
      roll: 7,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "잘못된 주사위 요청입니다",
    });
  });

  it("참가자가 아닌 메모리 주사위 요청은 403을 반환한다", async () => {
    const room = makeRoom({ gameId: "memory" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({ kind: "forbidden", room });

    const response = await patch({
      action: "memory-roll",
      roll: 4,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "방 참가자만 굴릴 수 있어요",
    });
  });

  it("메모리 주사위 저장 중 방이 사라지면 404를 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ gameId: "memory" }));
    mocks.recordMemoryRoll.mockResolvedValue({ kind: "missing", room: null });

    const response = await patch({
      action: "memory-roll",
      roll: 4,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "방을 찾을 수 없습니다",
    });
  });

  it("메모리 주사위 충돌은 최신 방과 409를 반환한다", async () => {
    const current = makeRoom({ gameId: "memory" });
    const latest = makeRoom({ gameId: "memory", version: 2 });
    mocks.loadGameRoom.mockResolvedValue(current);
    mocks.recordMemoryRoll.mockResolvedValue({
      kind: "conflict",
      room: latest,
      reason: "lifetime",
    });

    const response = await patch({
      action: "memory-roll",
      roll: 4,
      rollRoundId: "old-round",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
      room: latest,
    });
  });

  it("손상된 메모리 상태는 세부 내용 없이 500을 반환한다", async () => {
    const room = makeRoom({ gameId: "memory" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({ kind: "corrupt", room });

    const response = await patch({
      action: "memory-roll",
      roll: 4,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "메모리 게임 상태를 처리할 수 없습니다",
    });
  });

  it("메모리 명령 예외는 예외 문구 없이 500을 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ gameId: "memory" }));
    mocks.recordMemoryRoll.mockRejectedValue(
      new Error("저장소 비밀 문구가 드러나면 안 됩니다"),
    );

    const response = await patch({
      action: "memory-roll",
      roll: 4,
      rollRoundId: "round-1",
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "주사위 결과 저장에 실패했습니다" });
    expect(JSON.stringify(body)).not.toContain("저장소 비밀 문구");
  });

  it("본문 사용자 대신 세션 사용자를 메모리 명령에 전달한다", async () => {
    const room = makeRoom({ gameId: "memory" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({
      kind: "replayed",
      room,
      roll: 5,
      replayed: true,
    });

    await patch({
      action: "memory-roll",
      userId: "other-user",
      roll: 5,
      rollRoundId: "round-1",
    });

    expect(mocks.recordMemoryRoll).toHaveBeenCalledWith({
      initialRoom: room,
      userId: "user-1",
      roll: 5,
      rollRoundId: "round-1",
    });
  });

  it("오래된 예상 버전도 메모리 명령에서 먼저 판정한다", async () => {
    const room = makeRoom({ gameId: "memory", version: 2 });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.recordMemoryRoll.mockResolvedValue({
      kind: "replayed",
      room,
      roll: 5,
      replayed: true,
    });

    const response = await patch({
      action: "memory-roll",
      expectedVersion: 1,
      roll: 5,
      rollRoundId: "round-1",
    });

    expect(response.status).toBe(200);
    expect(mocks.recordMemoryRoll).toHaveBeenCalledOnce();
  });
});

describe("친구 방 시작 인원", () => {
  it("방장 혼자서는 시작할 수 없다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ gameId: "memory" }));
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room: { ...room, version: room.version + 1 },
    }));

    const response = await patch({ action: "start", expectedVersion: 1 });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "친구 방은 2명부터 8명까지 시작할 수 있어요",
    });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("상태 갱신으로 한 명 시작 검사를 우회할 수 없다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ gameId: "memory" }));
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room: { ...room, version: room.version + 1 },
    }));

    const response = await patch({
      action: "update-state",
      expectedVersion: 1,
      status: "playing",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "게임 시작은 시작 동작으로만 할 수 있어요",
    });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 진행 방의 직접 종료 전환 대신 다시 시작 안내를 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({ gameId: "dice", status: "playing" }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room: { ...room, version: room.version + 1 },
    }));

    const response = await patch({
      action: "update-state",
      expectedVersion: 1,
      status: "ended",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "새 규칙으로 다시 시작해 주세요",
      room: { status: "playing" },
    });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it.each([
    ["update-state", { patch: { score: 1 } }],
    ["set-state", { state: { score: 1 } }],
    ["next-turn", {}],
    ["set-topic", { topic: "물" }],
    ["add-question", { question: "왜 그럴까요?" }],
  ] as const)(
    "등록 엔진의 대기 방은 예전 %s 직접 쓰기를 저장 전에 거절한다",
    async (action, extra) => {
      const room = makeRoom({
        gameId: "dice",
        status: "waiting",
        players: makePlayers(2),
        gameState: {},
      });
      mocks.loadGameRoom.mockResolvedValue(room);

      const response = await patch({
        action,
        expectedVersion: room.version,
        ...extra,
      });

      expect(response.status).toBe(403);
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );

  it("등록 엔진 시작 본문의 초과 필드는 저장 전에 거절한다", async () => {
    const room = makeRoom({
      gameId: "dice",
      status: "waiting",
      players: makePlayers(2),
      gameState: {},
    });
    mocks.loadGameRoom.mockResolvedValue(room);

    const response = await patch({
      action: "start",
      commandId: "56555555-5555-4555-8555-555555555555",
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      unexpected: true,
    });

    expect(response.status).toBe(400);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it.each([2, 8])("참가자가 %i명이면 시작할 수 있다", async (playerCount) => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({ gameId: "memory", players: makePlayers(playerCount) }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room: { ...room, version: room.version + 1 },
    }));

    const response = await patch({
      action: "start",
      commandId: "55555555-5555-4555-8555-555555555555",
      expectedCreatedAt: 1,
      expectedVersion: 1,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      room: {
        status: "playing",
        players: { length: playerCount },
        pointAwardKeyVersion: 2,
        pointEvidenceVersion: 2,
        gameState: {
          stateVersion: 2,
          game: "memory",
          phase: "setup",
        },
      },
    });
  });
});

describe("새 판정기 시작과 옛 방 호환", () => {
  it("질문 주사위 새 시작은 버전 2 상태를 저장한다", async () => {
    const room = makeRoom({ gameId: "dice", players: makePlayers(2) });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "start",
      commandId: "13111111-1111-4111-8111-111111111111",
      expectedCreatedAt: room.createdAt,
      expectedVersion: 1,
    });

    expect(response.status).toBe(200);
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(expect.objectContaining({
      status: "playing",
      gameState: expect.objectContaining({ stateVersion: 2, game: "dice" }),
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    }));
  });

  it("질문 주사위 옛 진행 방은 직접 상태 쓰기를 막는다", async () => {
    const room = makeRoom({ gameId: "dice", status: "playing" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: candidate.version + 1 },
    }));

    const response = await patch({
      action: "update-state",
      expectedVersion: 1,
      patch: { score: 3 },
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });
});

describe("옛 진행 방 안내 화면", () => {
  const pagePath =
    "src/components/question-games/QuestionGameRoomFlow.tsx";
  const game = BUILT_IN_GAMES.find((candidate) => candidate.id === "dice")!;
  const room = makeRoom({ gameId: "dice", status: "playing" });

  it("페이지가 안내 판별 결과를 기존 놀이 구성 요소보다 먼저 쓴다", () => {
    const page = readFileSync(pagePath, "utf8");

    expect(page).toContain("RoomCompatibilityNotice");
    expect(page).toContain("shouldShowRoomCompatibilityNotice(room)");
    expect(page).toMatch(
      /const RoomComponent = [\s\S]*?RoomCompatibilityNotice[\s\S]*?ROOM_GAME_MAP\[game.id\]/,
    );
  });

  it("방장에게 다시 시작과 나가기를 제공하고 실제 동작을 연결한다", () => {
    const onAction = vi.fn();
    const onLeave = vi.fn();
    const view = render(createElement(RoomCompatibilityNotice, {
      game,
      room,
      myId: "user-1",
      actionLoading: false,
      onAction,
      onLeave,
    }));

    fireEvent.click(screen.getByRole("button", { name: "새 규칙으로 다시 시작" }));
    fireEvent.click(screen.getByRole("button", { name: /나가기/ }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith("restart");
    expect(onLeave).toHaveBeenCalledOnce();
    expect(screen.getByText("방 1234")).toBeInTheDocument();
    expect(view.container.querySelector("main")).toBeNull();
  });

  it("다른 참가자에게는 방장 대기 안내와 나가기만 제공한다", () => {
    const onAction = vi.fn();
    const onLeave = vi.fn();
    render(createElement(RoomCompatibilityNotice, {
      game,
      room,
      myId: "user-2",
      actionLoading: false,
      onAction,
      onLeave,
    }));

    expect(screen.queryByRole("button", {
      name: "새 규칙으로 다시 시작",
    })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "방장이 새 규칙으로 다시 시작하기를 기다리는 중입니다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /나가기/ }));
    expect(onLeave).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
  });
});

it("동시 참가 충돌 뒤 최신 참가자 목록에 다시 추가한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const latest = makeRoom({
    hostId: "host",
    version: 2,
    players: [
      { id: "host", name: "방장", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 3 },
    }));

  const response = await patch({ action: "join" });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.room.players.map((player: { id: string }) => player.id)).toEqual([
    "host",
    "other",
    "user-1",
  ]);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(2);
});

it("일곱 명이 같은 판본에서 동시에 참가해도 모두 저장한다", async () => {
  let storedRoom = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  let authCalls = 0;
  let readCalls = 0;
  let releaseReads: () => void;
  const allReadsStarted = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  mocks.auth.mockImplementation(async () => {
    authCalls += 1;
    return {
      user: { id: `user-${authCalls}`, name: `학생 ${authCalls}` },
    };
  });
  mocks.loadGameRoom.mockImplementation(async () => {
    const snapshot = storedRoom;
    readCalls += 1;
    if (readCalls === 7) releaseReads();
    await allReadsStarted;
    return snapshot;
  });
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => {
    if (
      candidate.version !== storedRoom.version ||
      candidate.createdAt !== storedRoom.createdAt
    ) {
      return { kind: "conflict" as const, room: storedRoom };
    }
    storedRoom = {
      ...candidate,
      version: candidate.version + 1,
      updatedAt: candidate.updatedAt + 1,
    };
    return { kind: "saved" as const, room: storedRoom };
  });

  const responses = await Promise.all(
    Array.from({ length: 7 }, () => patch({ action: "join" })),
  );

  expect(responses.map((response) => response.status)).toEqual(
    Array.from({ length: 7 }, () => 200),
  );
  expect(storedRoom.players).toHaveLength(8);
  expect(new Set(storedRoom.players.map((player) => player.id)).size).toBe(8);
  expect(storedRoom.version).toBe(8);
});

it("참가 저장 충돌의 비참가자 교체 방은 본문 없이 거부한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const replacement = makeRoom({
    hostId: "host",
    createdAt: 2,
    updatedAt: 2,
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 2 }],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: replacement })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 2 },
    }));

  const response = await patch({ action: "join" });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "방 참가자만 변경할 수 있어요",
  });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(1);
});

it("참가 저장 충돌의 참가자 교체 방은 공개 본문과 409를 반환한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const replacement = makeRoom({
    createdAt: 2,
    updatedAt: 2,
    gameState: { phase: "waiting", private: { answer: "비밀" } },
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockResolvedValueOnce({
    kind: "conflict",
    room: replacement,
  });

  const response = await patch({ action: "join" });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
    room: {
      ...replacement,
      gameState: { phase: "waiting" },
    },
  });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(1);
});

it("이미 참가한 사용자는 시작되고 가득 찬 방에서도 저장하지 않고 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      status: "playing",
      players: Array.from({ length: 8 }, (_, index) => ({
        id: index === 0 ? "user-1" : `other-${index}`,
        name: `학생 ${index}`,
        isHost: index === 0,
        joinedAt: index,
      })),
    }),
  );

  const response = await patch({ action: "join" });

  expect(response.status).toBe(200);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("참가 저장이 여덟 번 충돌하면 최신 방을 숨긴 409를 반환한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
    kind: "conflict",
    room: { ...candidate, players: current.players },
  }));

  const response = await patch({ action: "join" });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
  });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(8);
});

it("여덟 번째 참가 충돌의 최신 방에 참가가 확인되면 성공한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const pending = makeRoom({
    hostId: "host",
    version: 2,
    players: current.players,
  });
  const joined = makeRoom({
    hostId: "host",
    version: 3,
    players: [
      ...current.players,
      { id: "user-1", name: "학생", isHost: false, joinedAt: 3 },
    ],
  });
  let attempts = 0;
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async () => {
    attempts += 1;
    return {
      kind: "conflict" as const,
      room: attempts === 8 ? joined : pending,
    };
  });

  const response = await patch({ action: "join" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: joined });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(8);
});

it("세 번째 참가 충돌의 최신 방에 이미 참가했으면 성공한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const pending = makeRoom({
    hostId: "host",
    version: 2,
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const joined = makeRoom({
    hostId: "host",
    version: 3,
    players: [
      { id: "host", name: "방장", isHost: true, joinedAt: 1 },
      { id: "user-1", name: "학생", isHost: false, joinedAt: 3 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: joined });

  const response = await patch({ action: "join" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: joined });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("참가 저장 중 방이 사라지면 404를 반환한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      hostId: "host",
      players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    }),
  );
  mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

  const response = await patch({ action: "join" });

  expect(response.status).toBe(404);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(1);
});

it("메모리 나가기는 참가자 제거 뒤 완료된 후보를 저장한다", async () => {
  const room = makeRoom({
    gameId: "memory",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
    gameState: {
      phase: "rolling",
      diceRolls: { "user-1": 2, other: 6 },
      rollRoundId: "round-1",
    },
  });
  let settled: GameRoom | undefined;
  mocks.loadGameRoom.mockResolvedValue(room);
  mocks.settleMemoryRollingRoom.mockImplementationOnce((candidate: GameRoom) => {
    settled = {
      ...candidate,
      gameState: {
        ...candidate.gameState,
        phase: "play",
        turnOrder: ["other"],
        currentTurnIdx: 0,
      },
    };
    return settled;
  });
  mocks.saveGameRoom.mockImplementationOnce(async (candidate: GameRoom) => ({
    kind: "saved",
    room: { ...candidate, version: 2 },
  }));

  const response = await patch({ action: "leave" });
  const settlementInput = mocks.settleMemoryRollingRoom.mock.calls[0][0];

  expect(response.status).toBe(200);
  expect(settlementInput.hostId).toBe("other");
  expect(settlementInput.players).toEqual([
    expect.objectContaining({ id: "other", isHost: true }),
  ]);
  expect(mocks.saveGameRoom).toHaveBeenCalledWith(settled);
  await expect(response.json()).resolves.toMatchObject({
    room: { gameState: { phase: "play" } },
  });
});

it("메모리 나가기 저장 충돌 뒤 최신 방에서 완료 판정을 다시 한다", async () => {
  const current = makeRoom({
    gameId: "memory",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  const latest = makeRoom({
    gameId: "memory",
    version: 2,
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
      { id: "new", name: "새 학생", isHost: false, joinedAt: 3 },
    ],
  });
  let retriedSettlement: GameRoom | undefined;
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.settleMemoryRollingRoom.mockImplementation((candidate: GameRoom) => {
    if (candidate.version !== latest.version) return candidate;
    retriedSettlement = {
      ...candidate,
      gameState: { ...candidate.gameState, phase: "play" },
    };
    return retriedSettlement;
  });
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 3 },
    }));

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  expect(mocks.settleMemoryRollingRoom).toHaveBeenCalledTimes(2);
  expect(
    mocks.settleMemoryRollingRoom.mock.calls[0][0].players.map(
      (player) => player.id,
    ),
  ).toEqual(["other"]);
  expect(
    mocks.settleMemoryRollingRoom.mock.calls[1][0].players.map(
      (player) => player.id,
    ),
  ).toEqual(["other", "new"]);
  expect(mocks.saveGameRoom).toHaveBeenNthCalledWith(
    2,
    retriedSettlement,
  );
});

it("나가기 저장 충돌의 최신 방 생성 시각이 다르면 새 방에서 다시 계산하지 않는다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  const replacement = makeRoom({
    createdAt: 2,
    updatedAt: 2,
    players: current.players,
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: replacement })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 2 },
    }));

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ room: replacement });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(1);
  expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
});

it("나가기 저장 충돌의 비참가자 교체 방은 본문 없이 거부한다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  const replacement = makeRoom({
    createdAt: 2,
    updatedAt: 2,
    hostId: "other",
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockResolvedValueOnce({
    kind: "conflict",
    room: replacement,
  });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "방 참가자만 변경할 수 있어요",
  });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(1);
  expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
});

it("마지막 주사위가 놀이 단계로 바뀐 뒤 나가기 재시도는 실제 정리 함수로 다음 차례를 맞춘다", async () => {
  const { settleMemoryRollingRoom: actualSettleMemoryRoom } =
    await vi.importActual<typeof import("@/lib/memory-room-roll")>(
      "@/lib/memory-room-roll",
    );
  const current = makeRoom({
    gameId: "memory",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "next", name: "다음 학생", isHost: false, joinedAt: 2 },
      { id: "later", name: "나중 학생", isHost: false, joinedAt: 3 },
    ],
    gameState: {
      phase: "rolling",
      diceRolls: { "user-1": 6, next: 5 },
      rollRoundId: "round-1",
      turnOrder: [],
      currentTurnIdx: 0,
      revealedIds: [],
    },
  });
  const latest = makeRoom({
    gameId: "memory",
    version: 2,
    players: current.players,
    gameState: {
      phase: "play",
      diceRolls: { "user-1": 6, next: 5, later: 4 },
      rollRoundId: "round-1",
      turnOrder: ["user-1", "next", "later"],
      currentTurnIdx: 0,
      revealedIds: ["q-1"],
      lastReveal: {
        result: "miss",
        at: 10,
        turnPlayerId: "user-1",
      },
    },
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.settleMemoryRollingRoom.mockImplementation(actualSettleMemoryRoom);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 3 },
    }));

  const response = await patch({ action: "leave" });
  const retried = mocks.saveGameRoom.mock.calls[1][0] as GameRoom;

  expect(response.status).toBe(200);
  expect(retried.players.map((player) => player.id)).toEqual(["next", "later"]);
  expect(retried.gameState).toMatchObject({
    phase: "play",
    turnOrder: ["next", "later"],
    currentTurnIdx: 0,
    revealedIds: [],
  });
  expect(retried.gameState).not.toHaveProperty("lastReveal");
});

it("이미 나간 사용자는 메모리 완료 후보를 저장하거나 방 상태를 받지 않는다", async () => {
  const room = makeRoom({
    gameId: "memory",
    hostId: "other",
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
    gameState: {
      phase: "rolling",
      diceRolls: { other: 6 },
      rollRoundId: "round-1",
    },
  });
  const settled = {
    ...room,
    gameState: {
      ...room.gameState,
      phase: "play",
      turnOrder: ["other"],
      currentTurnIdx: 0,
    },
  };
  mocks.loadGameRoom.mockResolvedValue(room);
  mocks.settleMemoryRollingRoom.mockReturnValueOnce(settled);
  mocks.saveGameRoom.mockResolvedValueOnce({
    kind: "saved",
    room: { ...settled, version: 2 },
  });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: null });
  expect(mocks.settleMemoryRollingRoom).not.toHaveBeenCalled();
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("이미 나간 사용자는 메모리 상태 재판정을 시작하지 않는다", async () => {
  const current = makeRoom({
    gameId: "memory",
    hostId: "other",
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
  });
  const latest = makeRoom({
    gameId: "memory",
    hostId: "other",
    version: 2,
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
      { id: "new", name: "새 학생", isHost: false, joinedAt: 3 },
    ],
  });
  const firstSettlement = {
    ...current,
    gameState: { phase: "play", turnOrder: ["other"] },
  };
  const retriedSettlement = {
    ...latest,
    gameState: { phase: "play", turnOrder: ["other", "new"] },
  };
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.settleMemoryRollingRoom.mockImplementation((candidate: GameRoom) =>
    candidate === current ? firstSettlement : retriedSettlement,
  );
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockResolvedValueOnce({
      kind: "saved",
      room: { ...retriedSettlement, version: 3 },
    });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: null });
  expect(mocks.settleMemoryRollingRoom).not.toHaveBeenCalled();
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("마지막 메모리 참가자 나가기는 완료 판정 없이 조건부 삭제한다", async () => {
  const room = makeRoom({ gameId: "memory" });
  mocks.loadGameRoom.mockResolvedValue(room);
  mocks.deleteGameRoom.mockResolvedValueOnce({ kind: "deleted", room: null });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  expect(mocks.deleteGameRoom).toHaveBeenCalledWith(room);
  expect(mocks.settleMemoryRollingRoom).not.toHaveBeenCalled();
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("나가기 삭제 충돌의 최신 방 생성 시각이 다르면 새 방을 다시 삭제하지 않는다", async () => {
  const current = makeRoom();
  const replacement = makeRoom({ createdAt: 2, updatedAt: 2 });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: replacement })
    .mockResolvedValueOnce({ kind: "deleted", room: null });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ room: replacement });
  expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(1);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("나가기 삭제 충돌의 비참가자 교체 방은 본문 없이 거부한다", async () => {
  const current = makeRoom();
  const replacement = makeRoom({
    createdAt: 2,
    updatedAt: 2,
    hostId: "other",
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom.mockResolvedValueOnce({
    kind: "conflict",
    room: replacement,
  });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "방 참가자만 변경할 수 있어요",
  });
  expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(1);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("마지막 참가자 삭제 충돌 뒤 최신 방에서 나가기를 다시 계산한다", async () => {
  const current = makeRoom();
  const latest = makeRoom({
    version: 2,
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom.mockResolvedValue({
    kind: "conflict",
    room: latest,
  });
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
    kind: "saved",
    room: { ...candidate, version: 3 },
  }));

  const response = await patch({ action: "leave" });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.room.hostId).toBe("other");
  expect(body.room.players).toEqual([
    expect.objectContaining({ id: "other", isHost: true }),
  ]);
});

it.each([
  ["굴리지 않았으면", { "user-1": 6 }, "rolling", []],
  ["이미 결과가 있으면", { "user-1": 6, other: 4 }, "play", ["other"]],
] as const)(
  "마지막 참가자 삭제 충돌 뒤 새 참가자가 %s 실제 정리 결과를 저장한다",
  async (_condition, diceRolls, expectedPhase, expectedOrder) => {
    const { settleMemoryRollingRoom: actualSettleMemoryRoom } =
      await vi.importActual<typeof import("@/lib/memory-room-roll")>(
        "@/lib/memory-room-roll",
      );
    const current = makeRoom({
      gameId: "memory",
      gameState: {
        phase: "rolling",
        diceRolls: { "user-1": 6 },
        rollRoundId: "round-1",
        turnOrder: [],
        currentTurnIdx: 0,
      },
    });
    const latest = makeRoom({
      gameId: "memory",
      version: 2,
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "other", name: "새 학생", isHost: false, joinedAt: 2 },
      ],
      gameState: {
        phase: "rolling",
        diceRolls,
        rollRoundId: "round-1",
        turnOrder: [],
        currentTurnIdx: 0,
      },
    });
    mocks.loadGameRoom.mockResolvedValue(current);
    mocks.settleMemoryRollingRoom.mockImplementation(actualSettleMemoryRoom);
    mocks.deleteGameRoom.mockResolvedValueOnce({
      kind: "conflict",
      room: latest,
    });
    mocks.saveGameRoom.mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 3 },
    }));

    const response = await patch({ action: "leave" });
    const candidate = mocks.saveGameRoom.mock.calls[0][0] as GameRoom;

    expect(response.status).toBe(200);
    expect(candidate.players.map((player) => player.id)).toEqual(["other"]);
    expect(candidate.gameState).toMatchObject({
      phase: expectedPhase,
      turnOrder: expectedOrder,
    });
  },
);

it("이미 나간 사용자는 저장하지 않고 성공한다", async () => {
  const room = makeRoom({
    hostId: "other",
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(room);

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: null });
  expect(mocks.settleMemoryRollingRoom).not.toHaveBeenCalled();
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
});

it("이미 삭제된 방의 나가기는 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(null);

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("나가기 저장이 여덟 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async () => ({
    kind: "conflict",
    room: current,
  }));

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(8);
});

it("동시 이탈 뒤 새 참가자가 들어와도 최신 참가자 목록을 노출하지 않는다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  const pending = makeRoom({
    version: 2,
    players: current.players,
  });
  const left = makeRoom({
    hostId: "other",
    version: 3,
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
      { id: "new", name: "새 학생", isHost: false, joinedAt: 3 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: left });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: null });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("이미 이탈한 최신 메모리 방의 정산 저장 성공도 참가자 목록을 노출하지 않는다", async () => {
  const current = makeRoom({
    gameId: "memory",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  const latest = makeRoom({
    gameId: "memory",
    hostId: "other",
    version: 2,
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
      { id: "new", name: "새 학생", isHost: false, joinedAt: 3 },
    ],
  });
  const settled = {
    ...latest,
    gameState: { phase: "play", turnOrder: ["other", "new"] },
  };
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.settleMemoryRollingRoom.mockImplementation((candidate: GameRoom) =>
    candidate === latest ? settled : candidate,
  );
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockResolvedValueOnce({
      kind: "saved",
      room: { ...settled, version: 3 },
    });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: null });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(2);
  expect(mocks.saveGameRoom).toHaveBeenLastCalledWith(settled);
});

it.each([
  ["저장 성공", "saved", 200, { room: null }],
  ["다시 충돌", "conflict", 409, {
    error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
  }],
  ["방 삭제", "missing", 200, { room: null, deleted: true }],
  ["방 수명 교체", "replacement", 409, {
    error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
  }],
] as const)(
  "여덟 번째 메모리 나가기 충돌 뒤 정산 후보의 %s을 안전하게 처리한다",
  async (_name, finalResult, expectedStatus, expectedBody) => {
    const current = makeRoom({
      gameId: "memory",
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
      ],
    });
    const pending = makeRoom({
      gameId: "memory",
      version: 2,
      players: current.players,
    });
    const latest = makeRoom({
      gameId: "memory",
      hostId: "other",
      version: 3,
      players: [
        { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
      ],
    });
    const settlement = {
      ...latest,
      gameState: { phase: "play", turnOrder: ["other"] },
    };
    const conflicted = { ...latest, version: 4 };
    const replacement = {
      ...latest,
      createdAt: 2,
      updatedAt: 2,
      version: 1,
    };
    mocks.loadGameRoom.mockResolvedValue(current);
    mocks.settleMemoryRollingRoom.mockImplementation((candidate: GameRoom) =>
      candidate === latest ? settlement : candidate,
    );
    let saveAttempts = 0;
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => {
      saveAttempts += 1;
      if (saveAttempts < 8) {
        return { kind: "conflict" as const, room: pending };
      }
      if (saveAttempts === 8) {
        return { kind: "conflict" as const, room: latest };
      }
      if (finalResult === "saved") {
        return {
          kind: "saved" as const,
          room: { ...candidate, version: candidate.version + 1 },
        };
      }
      if (finalResult === "missing") {
        return { kind: "missing" as const, room: null };
      }
      return {
        kind: "conflict" as const,
        room: finalResult === "replacement" ? replacement : conflicted,
      };
    });

    const response = await patch({ action: "leave" });

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toEqual(expectedBody);
    expect(mocks.saveGameRoom).toHaveBeenCalledTimes(9);
    expect(mocks.saveGameRoom).toHaveBeenLastCalledWith(settlement);
    expect(mocks.settleMemoryRollingRoom).toHaveBeenLastCalledWith(latest);
  },
);

it("나가기 저장 중 방이 사라지면 삭제 성공으로 처리한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
      ],
    }),
  );
  mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("마지막 참가자 삭제가 여덟 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom();
  const latest = makeRoom({ version: 9 });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ room: latest });
  expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(8);
});

it("마지막 참가자 삭제 중 방이 사라지면 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(makeRoom());
  mocks.deleteGameRoom.mockResolvedValue({ kind: "missing", room: null });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("로그인하지 않은 요청은 401을 반환한다", async () => {
  mocks.auth.mockResolvedValue(null);

  const response = await patch({ action: "start", expectedVersion: 1 });

  expect(response.status).toBe(401);
  expect(mocks.loadGameRoom).not.toHaveBeenCalled();
});

describe("방 참가 경계", () => {
  it("참가 시도는 방 번호와 무관한 사용자별 제한을 먼저 적용한다", async () => {
    mocks.checkRateLimit.mockReturnValueOnce(
      Response.json({ error: "요청이 너무 많습니다" }, { status: 429 }),
    );

    const response = await patch({ action: "join" });

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("game-room-join:user-1", 10);
    expect(mocks.loadGameRoom).not.toHaveBeenCalled();
  });

  it("방 조회는 정상 폴링용 사용자 제한을 적용한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom());

    await get();

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("game-room-read:user-1", 120);
  });

  it("참가하지 않은 사용자는 방 전체 상태를 조회할 수 없다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "other", name: "다른 학생" },
    });
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({ gameState: { answer: "공개하면 안 되는 상태" } }),
    );

    const response = await get();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "방 참가자만 확인할 수 있어요",
    });
  });

  it("참가자는 방 전체 상태를 조회할 수 있다", async () => {
    const room = makeRoom({ gameState: { score: 2 } });
    mocks.loadGameRoom.mockResolvedValue(room);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room });
  });

  it.each(["update-state", "set-state", "next-turn"])(
    "참가하지 않은 사용자의 %s 요청은 403을 반환한다",
    async (action) => {
      mocks.auth.mockResolvedValue({
        user: { id: "other", name: "다른 학생" },
      });
      mocks.loadGameRoom.mockResolvedValue(makeRoom());

      const response = await patch({
        action,
        expectedVersion: 1,
        patch: { score: 1 },
        state: { score: 1 },
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "방 참가자만 변경할 수 있어요",
      });
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );
});

describe("방 상태 쓰기 권한", () => {
  const versionedActions: Array<[string, Record<string, unknown>]> = [
    ["start", {}],
    ["update-state", { patch: { score: 1 } }],
    ["set-state", { state: { score: 1 } }],
    ["next-turn", {}],
    ["set-topic", { topic: "물" }],
    ["add-question", { question: "왜 그럴까?" }],
    ["end", {}],
    ["restart", {}],
  ];

  it.each(versionedActions)(
    "%s 요청은 expectedVersion이 없으면 400을 반환한다",
    async (action, extra) => {
      mocks.loadGameRoom.mockResolvedValue(makeRoom({ gameId: "custom-game" }));

      const response = await patch({ action, ...extra });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "올바른 expectedVersion이 필요합니다",
      });
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );

  it.each(["1", 1.5, 0, -1])(
    "잘못된 expectedVersion %s는 400을 반환한다",
    async (expectedVersion) => {
      mocks.loadGameRoom.mockResolvedValue(makeRoom());

      const response = await patch({
        action: "update-state",
        expectedVersion,
        patch: { score: 1 },
      });

      expect(response.status).toBe(400);
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );

  it("방장이 아닌 참가자는 전체 상태를 교체할 수 없다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "member", name: "참가자" },
    });
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        players: [
          { id: "user-1", name: "방장", isHost: true, joinedAt: 1 },
          { id: "member", name: "참가자", isHost: false, joinedAt: 2 },
        ],
      }),
    );

    const response = await patch({
      action: "set-state",
      expectedVersion: 1,
      state: { score: 99 },
    });

    expect(response.status).toBe(403);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it.each(["playing", "ended"])(
    "방장이 아닌 참가자는 update-state로 방 상태를 %s로 바꿀 수 없다",
    async (status) => {
      mocks.auth.mockResolvedValue({
        user: { id: "member", name: "참가자" },
      });
      mocks.loadGameRoom.mockResolvedValue(
        makeRoom({
          gameId: "custom-game",
          status: status === "playing" ? "ended" : "playing",
          players: [
            { id: "user-1", name: "방장", isHost: true, joinedAt: 1 },
            { id: "member", name: "참가자", isHost: false, joinedAt: 2 },
          ],
        }),
      );

      const response = await patch({
        action: "update-state",
        expectedVersion: 1,
        patch: { phase: "done" },
        status,
      });

      expect(response.status).toBe(403);
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );
});

describe("기존 권한과 게임 규칙", () => {
  it.each(["start", "set-topic", "end", "restart"])(
    "방장이 아닌 사용자의 %s 요청은 403을 반환한다",
    async (action) => {
      mocks.auth.mockResolvedValue({
        user: { id: "other", name: "다른 학생" },
      });
      mocks.loadGameRoom.mockResolvedValue(makeRoom());

      const response = await patch({ action, expectedVersion: 1 });

      expect(response.status).toBe(403);
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );

  it("시작된 방에 새로 참가할 수 없다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "other", name: "다른 학생" },
    });
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ status: "playing" }));

    const response = await patch({ action: "join" });

    expect(response.status).toBe(400);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("정원이 찬 방에 새로 참가할 수 없다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "new-user", name: "새 학생" },
    });
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        hostId: "user-0",
        players: Array.from({ length: 8 }, (_, index) => ({
          id: `user-${index}`,
          name: `학생 ${index}`,
          isHost: index === 0,
          joinedAt: index,
        })),
      }),
    );

    const response = await patch({ action: "join" });

    expect(response.status).toBe(400);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("현재 차례가 아닌 사용자는 질문을 추가할 수 없다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        hostId: "other",
        players: [
          { id: "other", name: "다른 학생", isHost: true, joinedAt: 1 },
          { id: "user-1", name: "학생", isHost: false, joinedAt: 2 },
        ],
      }),
    );

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "왜 그럴까?",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("종료된 이어 말하기에는 질문을 추가할 수 없다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({ gameId: "relay", status: "ended" }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "종료 뒤 만든 질문",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기 진행 방은 직접 차례 변경보다 호환 안내를 먼저 반환한다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "member", name: "참가자" },
    });
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        players: [
          { id: "user-1", name: "방장", isHost: true, joinedAt: 1 },
          { id: "member", name: "참가자", isHost: false, joinedAt: 2 },
        ],
      }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "next-turn",
      expectedVersion: 1,
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기 진행 방은 직접 상태 갱신보다 호환 안내를 먼저 반환한다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "member", name: "참가자" },
    });
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        players: [
          { id: "user-1", name: "방장", isHost: true, joinedAt: 1 },
          { id: "member", name: "참가자", isHost: false, joinedAt: 2 },
        ],
      }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "update-state",
      expectedVersion: 1,
      patch: {},
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기의 중복 질문 추가는 호환 안내로 막는다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        chain: [
          {
            question: "왜 그럴까?",
            playerId: "user-1",
            playerName: "학생",
          },
        ],
      }),
    );

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "왜 그럴까?",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기의 정규화 중복 추가는 호환 안내로 막는다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        chain: [
          {
            question: "Why  is the sky blue?",
            playerId: "user-1",
            playerName: "학생",
          },
        ],
      }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "why is the sky blue?",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기의 학생 한도 초과 추가는 호환 안내로 막는다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        chain: Array.from({ length: 30 }, (_, index) => ({
          question: `${index + 1}번째 질문인가요?`,
          playerId: "user-1",
          playerName: "학생",
        })),
      }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "31번째 질문인가요?",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기의 방 한도 초과 추가는 호환 안내로 막는다", async () => {
    const players = Array.from({ length: 8 }, (_, index) => ({
      id: index === 0 ? "user-1" : `user-${index + 1}`,
      name: `학생 ${index + 1}`,
      isHost: index === 0,
      joinedAt: index + 1,
    }));
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        gameId: "relay",
        status: "playing",
        players,
        chain: Array.from({ length: 120 }, (_, index) => ({
          question: `${index + 1}번째 탐구 질문인가요?`,
          playerId: players[index % players.length].id,
          playerName: players[index % players.length].name,
        })),
      }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "121번째 탐구 질문인가요?",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("옛 이어 말하기의 짧은 답 추가는 호환 안내로 막는다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({ gameId: "relay", status: "playing" }),
    );
    mocks.saveGameRoom.mockImplementation(async (room: GameRoom) => ({
      kind: "saved",
      room,
    }));

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "1",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });
});
