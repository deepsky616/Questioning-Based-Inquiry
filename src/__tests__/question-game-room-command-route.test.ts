import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(
    (_key: string, _limitPerMinute?: number): Response | null => null,
  ),
  loadGameRoom: vi.fn(),
  saveGameRoom: vi.fn(),
  deleteGameRoom: vi.fn(),
  deleteGameRoomPresence: vi.fn(),
  applyQuestionGameRoomCommand: vi.fn(),
  findMysteryAiAnswerRequest: vi.fn(),
  generateMysteryAiAnswer: vi.fn(),
  leaveQuestionGameRoom: vi.fn(),
  restartQuestionGameRoom: vi.fn(),
  hasQuestionGameRoomEngine: vi.fn(() => false),
  ensureQuestionGameRoomPoints: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/game-room-store", () => ({
  loadGameRoom: mocks.loadGameRoom,
  saveGameRoom: mocks.saveGameRoom,
  deleteGameRoom: mocks.deleteGameRoom,
  deleteGameRoomPresence: mocks.deleteGameRoomPresence,
  isStaleRoomAction: (room: GameRoom, expected: unknown) =>
    typeof expected === "number" && expected !== room.version,
}));
vi.mock("@/lib/memory-room-roll", () => ({
  recordMemoryRoll: vi.fn(),
  settleMemoryRollingRoom: vi.fn((room: GameRoom) => room),
}));
vi.mock("@/lib/question-game-award-publish-service", () => ({
  QuestionGameAwardPublishError: class QuestionGameAwardPublishError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  },
  loadVerifiedGameAwardResult: vi.fn(),
}));
vi.mock("@/lib/point-award-service", () => ({
  ensureQuestionGameRoomPoints: mocks.ensureQuestionGameRoomPoints,
}));
vi.mock("@/lib/question-game-room-engine", () => ({
  applyQuestionGameRoomCommand: mocks.applyQuestionGameRoomCommand,
  leaveQuestionGameRoom: mocks.leaveQuestionGameRoom,
  restartQuestionGameRoom: mocks.restartQuestionGameRoom,
  hasQuestionGameRoomEngine: mocks.hasQuestionGameRoomEngine,
  isQuestionGameCommandId: (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
}));
vi.mock("@/lib/mystery-box-ai-answer", () => ({
  findMysteryAiAnswerRequest: mocks.findMysteryAiAnswerRequest,
  generateMysteryAiAnswer: mocks.generateMysteryAiAnswer,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.loggerWarn },
}));

import { PATCH } from "@/app/api/question-games/rooms/[code]/route";
import { shouldShowRoomCompatibilityNotice } from "@/app/(student)/student-question-play/games/RoomCompatibilityNotice";

const COMMAND_ID = "00000000-0000-4000-8000-000000000001";
const PLAY_ID = "00000000-0000-4000-8000-000000000002";
const ROUND_ID = "00000000-0000-4000-8000-000000000003";

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "user-1",
    status: "waiting",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "user-2", name: "친구", isHost: false, joinedAt: 2 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

function makeV2Room(overrides: Partial<GameRoom> = {}): GameRoom {
  return makeRoom({
    status: "playing",
    playId: PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    gameState: {
      stateVersion: 2,
      phase: "play",
      recentCommandIds: [],
      roundId: ROUND_ID,
      turnOrder: ["user-1", "user-2"],
      currentTurnIdx: 0,
    },
    ...overrides,
  });
}

function commandBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "submit",
    commandId: COMMAND_ID,
    expectedCreatedAt: 10,
    expectedVersion: 1,
    playId: PLAY_ID,
    roundId: ROUND_ID,
    ...overrides,
  };
}

function rawPatch(body: string) {
  return PATCH(
    new Request("http://localhost/api/question-games/rooms/1234", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

function patch(body: Record<string, unknown>) {
  return rawPatch(JSON.stringify(body));
}

function jsonBodyWithBytes(byteLength: number) {
  const prefix = '{"action":"unknown","padding":"';
  const suffix = '"}';
  const fixedBytes = new TextEncoder().encode(prefix + suffix).byteLength;
  const paddingBytes = byteLength - fixedBytes;
  const koreanCharacters = Math.floor(paddingBytes / 3);
  const asciiCharacters = paddingBytes % 3;
  return prefix +
    "가".repeat(koreanCharacters) +
    "x".repeat(asciiCharacters) +
    suffix;
}

function removedPlayerRoom(room: GameRoom, userId: string): GameRoom {
  const players = room.players.filter((player) => player.id !== userId);
  const hostId = players.some((player) => player.id === room.hostId)
    ? room.hostId
    : (players[0]?.id ?? "");
  const shouldEnd = room.status === "playing" && players.length === 1;
  return {
    ...room,
    hostId,
    players: players.map((player) => ({
      ...player,
      isHost: player.id === hostId,
    })),
    status: shouldEnd ? "ended" : room.status,
    gameState: {
      ...room.gameState,
      ...(shouldEnd
        ? { phase: "done", endReason: "insufficient-players" }
        : {}),
    },
  };
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({
    user: { id: "user-1", name: "학생" },
  });
  mocks.checkRateLimit.mockReset().mockReturnValue(null);
  mocks.loadGameRoom.mockReset();
  mocks.saveGameRoom.mockReset();
  mocks.deleteGameRoom.mockReset();
  mocks.deleteGameRoomPresence.mockReset().mockResolvedValue(undefined);
  mocks.applyQuestionGameRoomCommand.mockReset();
  mocks.findMysteryAiAnswerRequest.mockReset();
  mocks.generateMysteryAiAnswer.mockReset();
  mocks.leaveQuestionGameRoom.mockReset();
  mocks.restartQuestionGameRoom.mockReset();
  mocks.hasQuestionGameRoomEngine.mockReset().mockReturnValue(false);
  mocks.ensureQuestionGameRoomPoints.mockReset().mockResolvedValue(null);
  mocks.loggerWarn.mockReset();
});

describe("명령 본문 경계", () => {
  it("유티에프 팔 본문 상한은 방 조회까지 진행한다", async () => {
    const body = jsonBodyWithBytes(QUESTION_GAME_LIMITS.commandBodyBytes);
    expect(new TextEncoder().encode(body)).toHaveLength(
      QUESTION_GAME_LIMITS.commandBodyBytes,
    );
    mocks.loadGameRoom.mockResolvedValue(makeRoom());

    const response = await rawPatch(body);

    expect(response.status).toBe(400);
    expect(mocks.loadGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("유티에프 팔 본문 상한보다 한 바이트 크면 방을 조회하거나 저장하지 않는다", async () => {
    const body = jsonBodyWithBytes(QUESTION_GAME_LIMITS.commandBodyBytes + 1);
    expect(new TextEncoder().encode(body)).toHaveLength(
      QUESTION_GAME_LIMITS.commandBodyBytes + 1,
    );

    const response = await rawPatch(body);

    expect(response.status).toBe(400);
    expect(mocks.loadGameRoom).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("깨진 제이슨 본문은 방을 조회하거나 저장하지 않고 400이다", async () => {
    const response = await rawPatch('{"action":');

    expect(response.status).toBe(400);
    expect(mocks.loadGameRoom).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });
});

describe("참가자와 방 수명 경계", () => {
  it("비참가자는 틀린 생성 시각과 버전에도 방 없는 403을 받는다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "outsider", name: "외부 학생" },
    });
    mocks.loadGameRoom.mockResolvedValue(makeV2Room());

    const response = await patch(commandBody({
      expectedCreatedAt: 999,
      expectedVersion: 999,
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "방 참가자만 변경할 수 있어요" });
    expect(body).not.toHaveProperty("room");
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("다른 방 생성 시각은 재생 판정보다 먼저 공개 최신 방과 409다", async () => {
    const room = makeV2Room({
      createdAt: 20,
      updatedAt: 20,
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "replayed",
      room,
    });

    const response = await patch(commandBody({ expectedCreatedAt: 10 }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      room: { gameState: { stateVersion: 2, phase: "play", recentCommandIds: [COMMAND_ID] } },
    });
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it.each(["10", null])(
    "잘못된 생성 시각 %j은 판정 전에 400이다",
    async (expectedCreatedAt) => {
      mocks.loadGameRoom.mockResolvedValue(makeV2Room());

      const response = await patch(commandBody({ expectedCreatedAt }));

      expect(response.status).toBe(400);
      expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );
});

describe("버전 2 명령 경계", () => {
  it.each([
    "update-state",
    "set-state",
    "next-turn",
    "set-topic",
    "add-question",
  ])("방장도 %s로 버전 2 상태를 직접 바꿀 수 없다", async (action) => {
    mocks.loadGameRoom.mockResolvedValue(makeV2Room());

    const response = await patch(commandBody({ action }));

    expect(response.status).toBe(403);
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("등록 여부와 무관하게 버전 2 명령을 판정기로 보낸다", async () => {
    const room = makeV2Room();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(false);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "invalid",
      room,
      message: "잘못된 명령입니다",
    });

    const response = await patch(commandBody());

    expect(response.status).toBe(400);
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        room,
        userId: "user-1",
        userName: "학생",
        action: "submit",
        body: commandBody(),
        now: expect.any(Number),
        random: expect.any(Function),
        randomUUID: expect.any(Function),
      }),
    );
  });

  it("버전 2 진행 방의 새 시작 명령은 방장도 다시 시작할 수 없다", async () => {
    const room = makeV2Room();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: makeV2Room({ playId: COMMAND_ID }),
    });

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("버전 2 진행 방의 일반 참가자는 새 시작 명령을 실행할 수 없다", async () => {
    const room = makeV2Room();
    mocks.auth.mockResolvedValue({
      user: { id: "user-2", name: "친구" },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: makeV2Room({ playId: COMMAND_ID }),
    });

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(403);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("버전 2 시작 재생은 진행 상태 검사보다 먼저 저장 없이 성공한다", async () => {
    const room = makeV2Room({
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "replayed",
      room,
    });

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(200);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("같은 명령 재생은 낡은 예상 버전보다 먼저 저장 없는 성공이다", async () => {
    const room = makeV2Room({
      version: 3,
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "replayed",
      room,
      result: {
        roll: 4,
        replayed: true,
        hidden: "내부 값",
      },
    });

    const response = await patch(commandBody({ expectedVersion: 1 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      room: {
        ...room,
        gameState: {
          stateVersion: 2,
          phase: "play",
          recentCommandIds: [COMMAND_ID],
        },
      },
      result: { roll: 4, replayed: true },
    });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("변경 결과만 조건부 저장하고 공개 저장 방과 허용 결과만 반환한다", async () => {
    const room = makeV2Room();
    const candidate = makeV2Room({
      gameState: {
        stateVersion: 2,
        phase: "next",
        recentCommandIds: [COMMAND_ID],
        private: { answer: "판정 비밀" },
      },
    });
    const saved = { ...candidate, version: 2, updatedAt: 20 };
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: candidate,
      result: { retryAfterMs: 500, secret: "내부 값" },
    });
    mocks.saveGameRoom.mockResolvedValue({ kind: "saved", room: saved });

    const response = await patch(commandBody());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      room: {
        ...saved,
        gameState: {
          stateVersion: 2,
          phase: "next",
          recentCommandIds: [COMMAND_ID],
        },
      },
      result: { retryAfterMs: 500 },
    });
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(candidate);
  });

  it("버전 2 놀이의 정상 완료를 저장한 직후 포인트 지급을 보장한다", async () => {
    const room = makeV2Room();
    const candidate = makeV2Room({
      status: "ended",
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const saved = { ...candidate, version: 2, updatedAt: 20 };
    const awardResult = {
      awards: [{
        studentId: "user-1",
        bonusType: "PARTICIPATION",
        points: 1,
        reason: "게임 참여",
      }],
    };
    const settled = { ...saved, version: 3, awardResult };
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: candidate,
    });
    mocks.ensureQuestionGameRoomPoints.mockResolvedValue(awardResult);
    mocks.saveGameRoom
      .mockResolvedValueOnce({ kind: "saved", room: saved })
      .mockResolvedValueOnce({ kind: "saved", room: settled });

    const response = await patch(commandBody());

    expect(response.status).toBe(200);
    expect(mocks.ensureQuestionGameRoomPoints).toHaveBeenCalledWith(saved);
    expect(mocks.saveGameRoom).toHaveBeenNthCalledWith(2, {
      ...saved,
      awardResult,
    });
    await expect(response.json()).resolves.toMatchObject({
      room: { awardResult },
    });
  });

  it.each([
    ["invalid", 400, "잘못된 명령입니다"],
    ["forbidden", 403, "할 수 없는 명령입니다"],
  ] as const)("%s 판정은 저장 없이 %i다", async (kind, status, message) => {
    const room = makeV2Room();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({ kind, room, message });

    const response = await patch(commandBody());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("판정 충돌은 저장 없이 공개 최신 방과 409다", async () => {
    const room = makeV2Room({
      version: 2,
      gameState: {
        stateVersion: 2,
        phase: "latest",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "conflict",
      room,
      message: "기대 버전이 다릅니다",
    });

    const response = await patch(commandBody());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      room: {
        gameState: { stateVersion: 2, phase: "latest", recentCommandIds: [] },
      },
    });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("손상 판정은 내부 문구와 방을 숨긴 500이다", async () => {
    const room = makeV2Room();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "corrupt",
      room,
      message: "저장소 내부 비밀",
    });

    const response = await patch(commandBody());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "질문놀이 상태를 처리할 수 없습니다" });
    expect(JSON.stringify(body)).not.toContain("저장소 내부 비밀");
    expect(body).not.toHaveProperty("room");
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("조건부 저장 충돌은 공개 최신 방과 409다", async () => {
    const room = makeV2Room();
    const candidate = makeV2Room({
      gameState: {
        stateVersion: 2,
        phase: "candidate",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const latest = makeV2Room({
      version: 2,
      gameState: {
        stateVersion: 2,
        phase: "latest",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: candidate,
    });
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch(commandBody());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      room: {
        gameState: { stateVersion: 2, phase: "latest", recentCommandIds: [] },
      },
    });
  });

  it("동시 저장 충돌에서 같은 명령이 이미 반영됐으면 재생 성공이다", async () => {
    const room = makeV2Room();
    const candidate = makeV2Room({
      gameState: {
        stateVersion: 2,
        phase: "candidate",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const latest = makeV2Room({
      version: 2,
      gameState: {
        stateVersion: 2,
        phase: "saved",
        recentCommandIds: [COMMAND_ID],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand
      .mockReturnValueOnce({ kind: "changed", room: candidate })
      .mockReturnValueOnce({
        kind: "replayed",
        room: latest,
        result: { replayed: true, hidden: "내부 값" },
      });
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch(commandBody());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      room: {
        ...latest,
        gameState: {
          stateVersion: 2,
          phase: "saved",
          recentCommandIds: [COMMAND_ID],
        },
      },
      result: { replayed: true },
    });
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenCalledTimes(2);
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });

  it("조건부 저장 충돌의 비참가자 교체 방은 403에서 숨긴다", async () => {
    const room = makeV2Room();
    const candidate = makeV2Room({
      gameState: {
        stateVersion: 2,
        phase: "candidate",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const replacement = makeV2Room({
      createdAt: 20,
      updatedAt: 20,
      hostId: "user-2",
      players: [
        { id: "user-2", name: "친구", isHost: true, joinedAt: 2 },
      ],
      gameState: {
        stateVersion: 2,
        phase: "replacement",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: candidate,
    });
    mocks.saveGameRoom.mockResolvedValue({
      kind: "conflict",
      room: replacement,
    });

    const response = await patch(commandBody());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "방 참가자만 변경할 수 있어요" });
    expect(body).not.toHaveProperty("room");
  });
});

describe("미스터리 박스 에이아이 해결 경계", () => {
  const request = {
    itemId: "apple",
    playerId: "user-1",
    locale: "ko" as const,
    question: "비가 오면 잘 자라나요?",
  };
  const resolution = { ...request, answer: "yes" as const };

  function resolutionRequired(room: GameRoom) {
    return {
      kind: "resolution-required" as const,
      room,
      resolution: request,
      message: "해결이 필요합니다",
    };
  }

  it("첫 판정이 해결 필요일 때만 별도 제한 뒤 서버 답으로 다시 판정해 한 번 저장한다", async () => {
    const room = makeV2Room({ gameId: "mystery-box" });
    const candidate = makeV2Room({
      gameId: "mystery-box",
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const saved = { ...candidate, version: 2 };
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand
      .mockReturnValueOnce(resolutionRequired(room))
      .mockReturnValueOnce({ kind: "changed", room: candidate });
    mocks.findMysteryAiAnswerRequest.mockReturnValue(request);
    mocks.generateMysteryAiAnswer.mockResolvedValue(resolution);
    mocks.saveGameRoom.mockResolvedValue({ kind: "saved", room: saved });

    const response = await patch(commandBody({
      action: "mystery-ask",
      question: request.question,
      locale: request.locale,
    }));

    expect(response.status).toBe(200);
    expect(mocks.findMysteryAiAnswerRequest).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "resolution-required" }),
      "user-1",
    );
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "game-room-mystery-ai:user-1",
      20,
    );
    expect(mocks.generateMysteryAiAnswer).toHaveBeenCalledWith(
      "user-1",
      request,
    );
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenCalledTimes(2);
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ mysteryAnswerResolution: resolution }),
    );
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(candidate);
  });

  it.each([
    ["규칙 답", "changed"],
    ["재생", "replayed"],
    ["잘못된 명령", "invalid"],
    ["잘못된 차례", "forbidden"],
    ["낡은 버전", "conflict"],
  ] as const)("%s 판정에는 별도 제한과 에이아이 호출이 없다", async (_name, kind) => {
    const room = makeV2Room({ gameId: "mystery-box" });
    mocks.loadGameRoom.mockResolvedValue(room);
    if (kind === "changed") {
      mocks.applyQuestionGameRoomCommand.mockReturnValue({ kind, room });
      mocks.saveGameRoom.mockResolvedValue({ kind: "saved", room });
    } else if (kind === "replayed") {
      mocks.applyQuestionGameRoomCommand.mockReturnValue({ kind, room });
    } else {
      mocks.applyQuestionGameRoomCommand.mockReturnValue({
        kind,
        room,
        message: "거절했습니다",
      });
    }

    await patch(commandBody());

    expect(mocks.findMysteryAiAnswerRequest).not.toHaveBeenCalled();
    expect(mocks.generateMysteryAiAnswer).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalledWith(
      "game-room-mystery-ai:user-1",
      20,
    );
  });

  it("에이아이 별도 호출 제한은 답을 만들거나 방을 저장하지 않는다", async () => {
    const room = makeV2Room({ gameId: "mystery-box" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue(resolutionRequired(room));
    mocks.findMysteryAiAnswerRequest.mockReturnValue(request);
    mocks.checkRateLimit.mockImplementation((key: string) =>
      key === "game-room-mystery-ai:user-1"
        ? new Response(JSON.stringify({ error: "잠시 후 다시 시도해 주세요" }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          })
        : null,
    );

    const response = await patch(commandBody());

    expect(response.status).toBe(429);
    expect(mocks.generateMysteryAiAnswer).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("에이아이 오류는 내부 값 없이 재시도 가능한 503이며 저장하지 않는다", async () => {
    const room = makeV2Room({ gameId: "mystery-box" });
    const secret = "apple raw-model-output";
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue(resolutionRequired(room));
    mocks.findMysteryAiAnswerRequest.mockReturnValue(request);
    mocks.generateMysteryAiAnswer.mockRejectedValue(
      new Error(`${secret} ${request.question}`),
    );

    const response = await patch(commandBody());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "답변을 준비하지 못했어요. 질문은 저장되지 않았습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(request.question);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("요청자를 확인하지 못하거나 두 번째 판정도 해결 필요면 안전한 500이고 저장하지 않는다", async () => {
    const room = makeV2Room({ gameId: "mystery-box" });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand.mockReturnValue(resolutionRequired(room));
    mocks.findMysteryAiAnswerRequest.mockReturnValueOnce(null);

    const missingRequester = await patch(commandBody());

    expect(missingRequester.status).toBe(500);
    expect(mocks.generateMysteryAiAnswer).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalledWith(
      "game-room-mystery-ai:user-1",
      20,
    );
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();

    mocks.findMysteryAiAnswerRequest.mockReturnValue(request);
    mocks.generateMysteryAiAnswer.mockResolvedValue(resolution);
    const unresolved = await patch(commandBody());

    expect(unresolved.status).toBe(500);
    await expect(unresolved.json()).resolves.toEqual({
      error: "질문놀이 상태를 처리할 수 없습니다",
    });
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("저장 충돌 재생 판정에도 같은 서버 해결값을 넘기고 최신 방을 덮어쓰지 않는다", async () => {
    const room = makeV2Room({ gameId: "mystery-box" });
    const candidate = makeV2Room({
      gameId: "mystery-box",
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const latest = makeV2Room({
      gameId: "mystery-box",
      version: 2,
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand
      .mockReturnValueOnce(resolutionRequired(room))
      .mockReturnValueOnce({ kind: "changed", room: candidate })
      .mockReturnValueOnce({ kind: "replayed", room: latest });
    mocks.findMysteryAiAnswerRequest.mockReturnValue(request);
    mocks.generateMysteryAiAnswer.mockResolvedValue(resolution);
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch(commandBody());

    expect(response.status).toBe(200);
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenCalledTimes(3);
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ mysteryAnswerResolution: resolution }),
    );
    expect(mocks.generateMysteryAiAnswer).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });

  it("에이아이 해결 뒤 저장 충돌이 재생이 아니면 최신 공개 방만 409로 돌려준다", async () => {
    const room = makeV2Room({ gameId: "mystery-box" });
    const candidate = makeV2Room({
      gameId: "mystery-box",
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [COMMAND_ID],
      },
    });
    const latest = makeV2Room({
      gameId: "mystery-box",
      version: 2,
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [],
        private: { itemId: "book" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.applyQuestionGameRoomCommand
      .mockReturnValueOnce(resolutionRequired(room))
      .mockReturnValueOnce({ kind: "changed", room: candidate })
      .mockReturnValueOnce({
        kind: "conflict",
        room: latest,
        message: "최신 방과 맞지 않습니다",
      });
    mocks.findMysteryAiAnswerRequest.mockReturnValue(request);
    mocks.generateMysteryAiAnswer.mockResolvedValue(resolution);
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch(commandBody());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.room.gameState).not.toHaveProperty("private");
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ mysteryAnswerResolution: resolution }),
    );
    expect(mocks.generateMysteryAiAnswer).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });
});

describe("등록된 놀이의 옛 방 전환", () => {
  it("등록된 놀이만 시작을 판정기로 보낸다", async () => {
    const room = makeRoom();
    const candidate = makeV2Room();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);
    mocks.applyQuestionGameRoomCommand.mockReturnValue({
      kind: "changed",
      room: candidate,
    });
    mocks.saveGameRoom.mockResolvedValue({
      kind: "saved",
      room: { ...candidate, version: 2 },
    });

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(200);
    expect(mocks.applyQuestionGameRoomCommand).toHaveBeenCalledOnce();
  });

  it("등록된 놀이도 방장과 최소 인원 검사를 통과해야 시작한다", async () => {
    const room = makeRoom({ players: [makeRoom().players[0]] });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(400);
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("등록된 놀이의 끝난 방은 인원과 무관하게 시작을 막는다", async () => {
    const room = makeRoom({
      status: "ended",
      players: [makeRoom().players[0]],
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(409);
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("등록된 놀이 시작은 최신 인원 검사보다 낡은 버전을 먼저 거절한다", async () => {
    const room = makeRoom({
      version: 2,
      players: [makeRoom().players[0]],
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    const response = await patch(commandBody({
      action: "start",
      expectedVersion: 1,
    }));

    expect(response.status).toBe(409);
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
  });

  it("등록된 놀이도 방장만 시작할 수 있다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-2", name: "친구" },
    });
    mocks.loadGameRoom.mockResolvedValue(makeRoom());
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    const response = await patch(commandBody({ action: "start" }));

    expect(response.status).toBe(403);
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("등록된 놀이의 옛 진행 방은 다시 시작과 나가기 외 동작을 막는다", async () => {
    const room = makeRoom({
      status: "playing",
      gameState: { phase: "old", private: { answer: "비밀" } },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    const response = await patch(commandBody({ action: "end" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      room: { gameState: { phase: "old" } },
    });
    expect(mocks.applyQuestionGameRoomCommand).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("등록된 놀이의 옛 방 다시 시작은 실행 값을 지운 후보를 저장한다", async () => {
    const room = makeRoom({
      status: "playing",
      playId: PLAY_ID,
      pointAwardKeyVersion: 1,
      pointEvidenceVersion: 1,
      gameState: { phase: "old" },
    });
    const restarted = makeRoom();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);
    mocks.restartQuestionGameRoom.mockReturnValue({
      kind: "changed",
      room: restarted,
    });
    mocks.saveGameRoom.mockResolvedValue({
      kind: "saved",
      room: { ...restarted, version: 2 },
    });

    const response = await patch(commandBody({ action: "restart" }));

    expect(response.status).toBe(200);
    expect(mocks.restartQuestionGameRoom).toHaveBeenCalledWith(room);
    expect(mocks.saveGameRoom).toHaveBeenCalledWith(restarted);
  });

  it("이미 빈 대기 방 다시 시작은 낡은 버전에도 저장 없는 재생이다", async () => {
    const room = makeRoom({ version: 3 });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);
    mocks.restartQuestionGameRoom.mockReturnValue({
      kind: "replayed",
      room,
    });

    const response = await patch(commandBody({
      action: "restart",
      expectedVersion: 1,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room });
    expect(mocks.restartQuestionGameRoom).toHaveBeenCalledWith(room);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("동시 다시 시작 저장 충돌에서 최신 방이 이미 비었으면 재생 성공이다", async () => {
    const room = makeRoom({
      status: "playing",
      gameState: { phase: "old" },
    });
    const restarted = makeRoom();
    const latest = makeRoom({ version: 2 });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);
    mocks.restartQuestionGameRoom
      .mockReturnValueOnce({ kind: "changed", room: restarted })
      .mockReturnValueOnce({ kind: "replayed", room: latest });
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch(commandBody({ action: "restart" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: latest });
    expect(mocks.restartQuestionGameRoom).toHaveBeenCalledTimes(2);
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });
});

describe("옛 진행 방 안내 판별", () => {
  it("등록된 놀이의 옛 진행 방만 안내한다", () => {
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    expect(shouldShowRoomCompatibilityNotice(makeRoom({
      status: "playing",
      gameState: { phase: "old" },
    }))).toBe(true);
  });

  it.each([
    ["대기 옛 방", { status: "waiting", gameState: {} }],
    ["끝난 옛 방", { status: "ended", gameState: {} }],
    ["버전 2 방", {
      status: "playing",
      gameState: { stateVersion: 2, phase: "play", recentCommandIds: [] },
    }],
  ] as const)("%s은 안내하지 않는다", (_name, overrides) => {
    mocks.hasQuestionGameRoomEngine.mockReturnValue(true);

    expect(shouldShowRoomCompatibilityNotice(makeRoom(
      overrides as Partial<GameRoom>,
    ))).toBe(false);
  });

  it("미등록 놀이의 옛 진행 방은 안내하지 않는다", () => {
    mocks.hasQuestionGameRoomEngine.mockReturnValue(false);

    expect(shouldShowRoomCompatibilityNotice(makeRoom({
      status: "playing",
      gameState: { phase: "old" },
    }))).toBe(false);
  });
});

describe("버전 2 나가기", () => {
  beforeEach(() => {
    mocks.leaveQuestionGameRoom.mockImplementation(
      ({ room, userId }: { room: GameRoom; userId: string }) => ({
        kind: "changed",
        room: removedPlayerRoom(room, userId),
      }),
    );
  });

  it("저장 충돌 뒤 최신 방에서 이탈과 방장 위임을 다시 계산한다", async () => {
    const current = makeV2Room({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "user-2", name: "친구", isHost: false, joinedAt: 2 },
        { id: "user-3", name: "다른 친구", isHost: false, joinedAt: 3 },
      ],
    });
    const latest = makeV2Room({
      version: 2,
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "user-3", name: "다른 친구", isHost: false, joinedAt: 3 },
        { id: "user-4", name: "새 친구", isHost: false, joinedAt: 4 },
      ],
    });
    mocks.loadGameRoom.mockResolvedValue(current);
    mocks.saveGameRoom
      .mockResolvedValueOnce({ kind: "conflict", room: latest })
      .mockImplementationOnce(async (candidate: GameRoom) => ({
        kind: "saved",
        room: { ...candidate, version: 3 },
      }));

    const response = await patch({
      action: "leave",
      expectedCreatedAt: current.createdAt,
    });
    const retried = mocks.saveGameRoom.mock.calls[1][0] as GameRoom;

    expect(response.status).toBe(200);
    expect(mocks.leaveQuestionGameRoom).toHaveBeenCalledTimes(2);
    expect(mocks.leaveQuestionGameRoom).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ room: latest, userId: "user-1" }),
    );
    expect(retried.hostId).toBe("user-3");
    expect(retried.players.map((player) => player.id)).toEqual([
      "user-3",
      "user-4",
    ]);
  });

  it("두 명 진행 방의 이탈은 한 명 부족 종료 후보를 저장한다", async () => {
    const room = makeV2Room({
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 2 },
    }));

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      room: {
        status: "ended",
        hostId: "user-2",
        players: [{ id: "user-2", isHost: true }],
        gameState: { phase: "done", endReason: "insufficient-players" },
      },
    });
    const candidate = mocks.saveGameRoom.mock.calls[0][0] as GameRoom;
    expect(candidate.gameState.private).toEqual({ answer: "비밀" });
  });

  it("이탈 저장 성공 뒤 접속 기록 삭제가 실패해도 성공 응답과 안전한 경고를 유지한다", async () => {
    const room = makeV2Room();
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 2 },
    }));
    mocks.deleteGameRoomPresence.mockRejectedValue(
      new Error("postgresql://secret-user:secret-password@example.test/private"),
    );

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      room: { players: [{ id: "user-2" }] },
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "질문놀이 접속 기록 정리를 마치지 못했습니다",
    );
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain("secret");
  });

  it("마지막 참가자 이탈은 후보를 저장하지 않고 조건부 삭제한다", async () => {
    const room = makeV2Room({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      ],
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.deleteGameRoom.mockResolvedValue({ kind: "deleted", room: null });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: null, deleted: true });
    expect(mocks.deleteGameRoom).toHaveBeenCalledWith(
      expect.objectContaining({ players: [] }),
    );
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("생성 시각 없는 버전 2 이탈은 방을 바꾸지 않고 400이다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeV2Room());

    const response = await patch({ action: "leave" });

    expect(response.status).toBe(400);
    expect(mocks.leaveQuestionGameRoom).not.toHaveBeenCalled();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
  });

  it("이탈 충돌 뒤 이미 나간 최신 방은 다시 노출하지 않는다", async () => {
    const room = makeV2Room();
    const latest = makeV2Room({
      version: 2,
      hostId: "user-2",
      players: [
        { id: "user-2", name: "친구", isHost: true, joinedAt: 2 },
        { id: "user-3", name: "다른 친구", isHost: false, joinedAt: 3 },
      ],
      gameState: {
        stateVersion: 2,
        phase: "play",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockResolvedValueOnce({ kind: "conflict", room: latest });
    mocks.leaveQuestionGameRoom
      .mockReturnValueOnce({ kind: "changed", room: removedPlayerRoom(room, "user-1") })
      .mockReturnValueOnce({ kind: "replayed", room: latest });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: null });
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });

  it("이탈 저장 충돌의 다른 생성 시각은 공개 교체 방과 409다", async () => {
    const room = makeV2Room();
    const replacement = makeV2Room({
      createdAt: 20,
      updatedAt: 20,
      gameState: {
        stateVersion: 2,
        phase: "replacement",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockResolvedValueOnce({
      kind: "conflict",
      room: replacement,
    });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      room: {
        gameState: {
          stateVersion: 2,
          phase: "replacement",
          recentCommandIds: [],
        },
      },
    });
    expect(mocks.leaveQuestionGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });

  it("이탈 충돌의 비참가자 교체 방은 다시 노출하지 않는다", async () => {
    const room = makeV2Room();
    const replacement = makeV2Room({
      createdAt: 20,
      updatedAt: 20,
      hostId: "user-2",
      players: [
        { id: "user-2", name: "친구", isHost: true, joinedAt: 2 },
      ],
      gameState: {
        stateVersion: 2,
        phase: "replacement",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.saveGameRoom.mockResolvedValueOnce({
      kind: "conflict",
      room: replacement,
    });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "방 참가자만 변경할 수 있어요",
    });
    expect(mocks.leaveQuestionGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).toHaveBeenCalledOnce();
  });

  it("마지막 참가자 삭제 충돌의 참가자 교체 방은 공개 본문과 409다", async () => {
    const room = makeV2Room({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      ],
    });
    const replacement = makeV2Room({
      createdAt: 20,
      updatedAt: 20,
      gameState: {
        stateVersion: 2,
        phase: "replacement",
        recentCommandIds: [],
        private: { answer: "비밀" },
      },
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.deleteGameRoom.mockResolvedValueOnce({
      kind: "conflict",
      room: replacement,
    });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      room: {
        gameState: {
          stateVersion: 2,
          phase: "replacement",
          recentCommandIds: [],
        },
      },
    });
    expect(mocks.deleteGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("마지막 참가자 삭제 충돌의 비참가자 교체 방은 본문 없이 거부한다", async () => {
    const room = makeV2Room({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      ],
    });
    const replacement = makeV2Room({
      createdAt: 20,
      updatedAt: 20,
      hostId: "user-2",
      players: [
        { id: "user-2", name: "친구", isHost: true, joinedAt: 2 },
      ],
    });
    mocks.loadGameRoom.mockResolvedValue(room);
    mocks.deleteGameRoom.mockResolvedValueOnce({
      kind: "conflict",
      room: replacement,
    });

    const response = await patch({
      action: "leave",
      expectedCreatedAt: room.createdAt,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "방 참가자만 변경할 수 있어요",
    });
    expect(mocks.deleteGameRoom).toHaveBeenCalledOnce();
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });
});
