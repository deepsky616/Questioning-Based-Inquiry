import { beforeEach, describe, expect, it, vi } from "vitest";

const txMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  pointLogFindMany: vi.fn(),
  pointLogCreate: vi.fn(),
  pointLogCreateMany: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/ai", () => ({ generateJson: vi.fn() }));
vi.mock("@/lib/game-room-store", () => ({ loadGameRoom: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { findMany: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { generateJson } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { loadGameRoom } from "@/lib/game-room-store";
import type { GameRoom } from "@/lib/question-games-data";
import {
  buildAwardList,
  buildRoomAwardKey,
} from "@/lib/point-award-service";
import { POST } from "@/app/api/points/award/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mGenerateJson = generateJson as unknown as ReturnType<typeof vi.fn>;
const mLoadGameRoom = loadGameRoom as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mUserFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const txQueryRaw = txMocks.queryRaw;
const txPointLogFindMany = txMocks.pointLogFindMany;
const txPointLogCreate = txMocks.pointLogCreate;
const txPointLogCreateMany = txMocks.pointLogCreateMany;
const txUserFindUnique = txMocks.userFindUnique;
const txUserFindMany = txMocks.userFindMany;
const txUserUpdate = txMocks.userUpdate;
const txClient = {
  $queryRaw: txQueryRaw,
  pointLog: {
    findMany: txPointLogFindMany,
    create: txPointLogCreate,
    createMany: txPointLogCreateMany,
  },
  user: {
    findUnique: txUserFindUnique,
    findMany: txUserFindMany,
    update: txUserUpdate,
  },
};

const awardReq = (body: unknown) =>
  new NextRequest("http://localhost/api/points/award", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "relay",
    hostId: "t1",
    status: "ended",
    players: [{ id: "s1", name: "학생", isHost: false, joinedAt: 1 }],
    topic: "우주",
    chain: [
      { question: "왜 별이 보일까요?", playerId: "s1", playerName: "학생" },
      { question: "별은 무엇일까요?", playerId: "s1", playerName: "학생" },
    ],
    turnIndex: 0,
    gameState: {},
    version: 10,
    createdAt: 100,
    updatedAt: 100,
    pointAwardKeyVersion: 1,
    pointEvidenceVersion: 1,
    ...overrides,
  };
}

const BODY = {
  gameId: "relay",
  roomCode: "1234",
  roomCreatedAt: 100,
  topic: "우주",
  contributions: [{
    studentId: "s1",
    studentName: "학생",
    validQuestions: 2,
    questions: ["우주는 왜 넓을까요?"],
    isWinner: true,
  }],
};

const V2_PLAY_ID = "10000000-0000-4000-8000-000000000001";
const V2_OTHER_PLAY_ID = "10000000-0000-4000-8000-000000000002";
const V2_ROUND_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
] as const;

function makeV2RelayRoom(
  overrides: Partial<GameRoom> = {},
): GameRoom {
  const players = [
    { id: "t1", name: "교사", isHost: true, joinedAt: 1 },
    { id: "s1", name: "학생", isHost: false, joinedAt: 2 },
  ];
  const questions = V2_ROUND_IDS.flatMap((roundId, roundIndex) =>
    players.map((player, playerIndex) => ({
      roundId,
      round: roundIndex + 1,
      playerId: player.id,
      playerName: player.name,
      locale: "ko" as const,
      question: `${roundIndex + 1}-${playerIndex + 1}번째 질문은 무엇인가요?`,
    })),
  );
  return makeRoom({
    gameId: "relay",
    players,
    topic: "우주",
    chain: [],
    version: 20,
    playId: V2_PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    gameState: {
      stateVersion: 2,
      game: "relay",
      phase: "done",
      recentCommandIds: [],
      roundId: V2_ROUND_IDS[2],
      round: 3,
      maxRounds: 3,
      completedRounds: 3,
      endReason: "completed",
      players: players.map(({ id, name }) => ({ id, name })),
      playerNames: { t1: "교사", s1: "학생" },
      roundPlayerIds: ["t1", "s1"],
      roundTargetPlayerIds: ["t1", "s1"],
      roundSubmittedPlayerIds: ["t1", "s1"],
      turnOrder: ["t1", "s1"],
      currentTurnIdx: 0,
      questions,
      topic: "우주",
    },
    ...overrides,
  });
}

function makeV2MemoryRoom(
  scores: Record<"t1" | "s1", number> = { t1: 0, s1: 1 },
  overrides: Partial<GameRoom> = {},
): GameRoom {
  const pairs = Array.from({ length: 6 }, (_, index) => ({
    id: `pair-${index}`,
    question: `질문 ${index + 1}?`,
    answer: `대답 ${index + 1}`,
  }));
  const qCards = pairs.map(({ id }, index) => ({
    id: `q-${index}`,
    pairId: id,
    type: "q" as const,
  }));
  const aCards = pairs.map(({ id }, index) => ({
    id: `a-${index}`,
    pairId: id,
    type: "a" as const,
  }));
  const pairCount = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const takenIds = pairs.slice(0, pairCount).flatMap((_, index) => [
    qCards[index].id,
    aCards[index].id,
  ]);
  const takenSet = new Set(takenIds);
  const players = [
    { id: "t1", name: "교사", isHost: true, joinedAt: 1 },
    { id: "s1", name: "학생", isHost: false, joinedAt: 2 },
  ];
  return makeRoom({
    gameId: "memory",
    players,
    topic: "",
    chain: [],
    version: 20,
    playId: V2_PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    gameState: {
      stateVersion: 2,
      game: "memory",
      phase: "done",
      recentCommandIds: [],
      roundId: V2_ROUND_IDS[0],
      endReason: "completed",
      difficulty: "easy",
      pairs,
      qCards,
      aCards,
      diceRolls: { t1: 6, s1: 5 },
      turnOrder: ["t1", "s1"],
      currentTurnIdx: 0,
      takenIds,
      revealedIds: [...qCards, ...aCards]
        .filter(({ id }) => !takenSet.has(id))
        .map(({ id }) => id),
      scores,
      attempts: 18,
      maxAttempts: 18,
      lastReveal: null,
      lastResolvedRevealId: "resolved-last-attempt",
    },
    ...overrides,
  });
}

function useLockedRoom(room: GameRoom) {
  mLoadGameRoom.mockResolvedValue(room);
  txQueryRaw
    .mockResolvedValueOnce([{ locked: true }])
    .mockResolvedValueOnce([{ data: room }]);
}

function v2Body(gameId: string, playId = V2_PLAY_ID) {
  return {
    ...BODY,
    gameId,
    playId,
    topic: "클라이언트가 바꾼 주제",
    contributions: [{
      studentId: "attacker-target",
      studentName: "가짜 학생",
      validQuestions: 999,
      questions: ["가짜 질문은 무엇인가요?"],
      isWinner: true,
    }],
  };
}

const snapshot = JSON.stringify({
  type: "game-room-award-result",
  version: 1,
  bestQuestion: { studentId: "s1", question: "왜?", reason: "좋은 질문" },
  summary: "함께 잘 탐구했습니다.",
});

beforeEach(() => {
  vi.clearAllMocks();
  mTx.mockReset();
  txQueryRaw.mockReset();
  txPointLogFindMany.mockReset();
  txPointLogCreate.mockReset();
  txPointLogCreateMany.mockReset();
  txUserFindUnique.mockReset();
  txUserFindMany.mockReset();
  txUserUpdate.mockReset();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mGenerateJson.mockResolvedValue({ bonuses: [] });
  mLoadGameRoom.mockResolvedValue(makeRoom());
  mFindMany.mockResolvedValue([]);
  mUserFindUnique.mockResolvedValue({ school: "별빛초", teacherClasses: [] });
  mUserFindMany.mockResolvedValue([{
    id: "s1",
    role: "STUDENT",
    school: "별빛초",
    grade: "3",
    className: "1",
  }]);
  txQueryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("pg_advisory_xact_lock")) return [{ locked: true }];
    if (sql.includes('FROM "game_rooms"')) return [{ data: makeRoom() }];
    if (sql.includes('FROM "users"')) return [{ id: "t1" }, { id: "s1" }];
    if (sql.includes('FROM "teacher_classes"')) return [];
    throw new Error(`알 수 없는 거래 쿼리: ${sql}`);
  });
  txPointLogFindMany.mockResolvedValue([]);
  txPointLogCreate.mockResolvedValue({});
  txPointLogCreateMany.mockResolvedValue({ count: 0 });
  txUserFindUnique.mockResolvedValue({
    role: "TEACHER",
    school: "별빛초",
    teacherClasses: [],
  });
  txUserFindMany.mockResolvedValue([{
    id: "s1",
    role: "STUDENT",
    school: "별빛초",
    grade: "3",
    className: "1",
  }]);
  txUserUpdate.mockResolvedValue({});
  mTx.mockImplementation(async (input: unknown) => {
    if (typeof input !== "function") return [];
    return input(txClient);
  });
});

describe("포인트 지급 요청 검증", () => {
  it("비로그인은 401, 일반 필수 항목 누락은 400", async () => {
    mAuth.mockResolvedValue(null);
    expect((await POST(awardReq(BODY))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    expect((await POST(awardReq({ gameId: "dice" }))).status).toBe(400);
  });

  it("수명값이 없는 이전 요청은 409이고 쓰지 않는다", async () => {
    const { roomCreatedAt: _removed, ...legacyBody } = BODY;

    const res = await POST(awardReq(legacyBody));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("수명값이 유한한 음이 아닌 정수가 아니면 400이다", async () => {
    const res = await POST(awardReq({ ...BODY, roomCreatedAt: 1.5 }));

    expect(res.status).toBe(400);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it.each([
    ["없으면", null],
    ["코드가 다르면", makeRoom({ code: "5678" })],
    ["게임이 다르면", makeRoom({ gameId: "dice" })],
    ["생성 시각이 다르면", makeRoom({ createdAt: 200 })],
  ])("현재 방이 %s 409이고 분석하거나 쓰지 않는다", async (_case, room) => {
    mLoadGameRoom.mockResolvedValue(room);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("방장이 아니면 종료된 방의 지급을 요청할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t2", role: "TEACHER" } });

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("학생이 자기 방의 방장이고 저장 상태를 채워도 지급할 수 없다", async () => {
    const studentRoom = makeRoom({
      hostId: "s1",
      players: [{ id: "s1", name: "학생", isHost: true, joinedAt: 1 }],
    });
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    mLoadGameRoom.mockResolvedValue(studentRoom);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(mLoadGameRoom).not.toHaveBeenCalled();
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("끝나지 않은 방은 점수를 지급하지 않는다", async () => {
    mLoadGameRoom.mockResolvedValue(makeRoom({ status: "playing" }));

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it.each(["dice", "kaba", "ladder", "story-dice", "memory"])(
    "서버가 활동을 직접 기록하지 않는 %s 놀이는 점수를 지급하지 않는다",
    async (gameId) => {
      mLoadGameRoom.mockResolvedValue(makeRoom({ gameId }));

      const res = await POST(awardReq({ ...BODY, gameId }));

      expect(res.status).toBe(409);
      expect(mGenerateJson).not.toHaveBeenCalled();
      expect(mTx).not.toHaveBeenCalled();
      expect(txPointLogCreateMany).not.toHaveBeenCalled();
      expect(txUserUpdate).not.toHaveBeenCalled();
    },
  );

  it("증거 버전이 없는 이전 이어 말하기 방은 점수를 지급하지 않는다", async () => {
    mLoadGameRoom.mockResolvedValue(
      makeRoom({ pointEvidenceVersion: undefined }),
    );

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("서버 질문 형식에 맞지 않는 저장 질문은 점수를 지급하지 않는다", async () => {
    mLoadGameRoom.mockResolvedValue(
      makeRoom({
        chain: [
          { question: "1", playerId: "s1", playerName: "학생" },
        ],
      }),
    );

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("요청의 가짜 참가자와 부풀린 기여를 무시하고 저장된 방 상태로 계산한다", async () => {
    const forgedBody = {
      ...BODY,
      topic: "바꾼 주제",
      contributions: [
        {
          studentId: "attacker-target",
          studentName: "가짜 학생",
          validQuestions: 999999,
          questions: ["가짜 질문"],
          isWinner: true,
        },
      ],
    };

    const res = await POST(awardReq(forgedBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "s1", bonusType: "VALID_QUESTIONS", points: 6 }),
    ]));
    expect(data.awards).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "attacker-target" }),
    ]));
    expect(mGenerateJson.mock.calls[0][0].prompt).toContain("우주");
    expect(mGenerateJson.mock.calls[0][0].prompt)
      .not.toContain("클라이언트가 바꾼 주제");
    expect(txUserUpdate).toHaveBeenCalledTimes(1);
    expect(txUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" } }));
    expect(mGenerateJson.mock.calls[0][0].prompt).toContain("우주");
    expect(mGenerateJson.mock.calls[0][0].prompt).not.toContain("가짜 학생");
    expect(mGenerateJson.mock.calls[0][0].prompt).not.toContain("999999");
  });

  it("방 명단에 있어도 실제 학생 계정이 아니면 지급하지 않는다", async () => {
    mUserFindMany.mockResolvedValue([]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("교사의 담당 학급 밖 학생이 방에 있으면 지급하지 않는다", async () => {
    mUserFindUnique.mockResolvedValue({
      school: "별빛초",
      teacherClasses: [{ grade: "3", className: "1" }],
    });
    mUserFindMany.mockResolvedValue([{
      id: "s1",
      role: "STUDENT",
      school: "별빛초",
      grade: "3",
      className: "2",
    }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("담당 학급이 없는 교사는 같은 학교 학생에게 지급할 수 있다", async () => {
    mUserFindUnique.mockResolvedValue({ school: "별빛초", teacherClasses: [] });

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(200);
    expect(mUserFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["s1"] } },
    }));
    expect(txUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s1" },
    }));
  });

  it("교사 방장은 점수 대상에서 빼고 담당 학생에게만 지급한다", async () => {
    const teacherRoom = makeRoom({
      players: [
        { id: "t1", name: "교사", isHost: true, joinedAt: 1 },
        { id: "s1", name: "학생", isHost: false, joinedAt: 2 },
      ],
    });
    mLoadGameRoom.mockResolvedValue(teacherRoom);
    txQueryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ data: teacherRoom }]);

    const data = await (await POST(awardReq(BODY))).json();

    expect(data.awards).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "t1" }),
    ]));
    expect(data.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "s1" }),
    ]));
    expect(txUserUpdate).toHaveBeenCalledTimes(1);
    expect(txUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s1" },
    }));
  });
});

describe("포인트 지급 수명별 중복 조회", () => {
  it("표지 방은 예전 표시 코드 기록을 무시하고 내부 키를 쓴다", async () => {
    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(200);
    expect(mFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        gameId: "relay",
        roomCode: "room:1234:100",
        status: "APPROVED",
      },
    }));
    expect(txPointLogFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        gameId: "relay",
        roomCode: "room:1234:100",
        status: "APPROVED",
      },
    }));
    expect(txPointLogCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ roomCode: "room:1234:100" }),
      ]),
    });
  });

  it("표지 없는 방은 생성 뒤 예전 표시 코드 기록도 확인한다", async () => {
    const legacyRoom = makeRoom({ pointAwardKeyVersion: undefined });
    mLoadGameRoom.mockResolvedValue(legacyRoom);
    txQueryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ data: legacyRoom }]);

    await POST(awardReq(BODY));

    expect(mFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        gameId: "relay",
        OR: expect.arrayContaining([
          { roomCode: "room:1234:100" },
          { roomCode: "1234", createdAt: { gte: new Date(100) } },
        ]),
      }),
    }));
    expect(txPointLogFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        gameId: "relay",
        OR: expect.arrayContaining([
          { roomCode: "room:1234:100" },
          { roomCode: "1234", createdAt: { gte: new Date(100) } },
        ]),
      }),
    }));
  });

  it("같은 수명의 기존 기록에서 표지된 결과를 생성 순서와 무관하게 복원한다", async () => {
    const createdAt = new Date(100);
    const logs = [
      { id: "log1", studentId: "s1", bonusType: "PARTICIPATION", points: 5, reason: "참여", status: "APPROVED", aiAnalysis: "예전 글", createdAt },
      { id: "log2", studentId: "s1", bonusType: "COMPLETION", points: 5, reason: "완료", status: "APPROVED", aiAnalysis: snapshot, createdAt },
    ];
    mFindMany.mockResolvedValue(logs);

    const res = await POST(awardReq(BODY));
    const data = await res.json();

    expect(data.alreadyAwarded).toBe(true);
    expect(data.bestQuestion).toEqual({
      studentId: "s1",
      question: "왜?",
      reason: "좋은 질문",
    });
    expect(data.summary).toBe("함께 잘 탐구했습니다.");
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("기존 지급 기록이 있어도 현재 담당 범위 밖 학생이면 반환하지 않는다", async () => {
    mUserFindUnique.mockResolvedValue({
      school: "별빛초",
      teacherClasses: [{ grade: "3", className: "1" }],
    });
    mUserFindMany.mockResolvedValue([{
      id: "s1",
      role: "STUDENT",
      school: "별빛초",
      grade: "3",
      className: "2",
    }]);
    mFindMany.mockResolvedValue([{
      id: "old-log",
      studentId: "s1",
      points: 5,
    }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("기존 지급 기록의 학생이 현재 방 참가자가 아니면 반환하지 않는다", async () => {
    mFindMany.mockResolvedValue([{
      id: "old-log",
      studentId: "outside-student",
      bonusType: "PARTICIPATION",
      points: 5,
      reason: "참여",
      status: "APPROVED",
    }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });
});

describe("저장된 놀이 상태 계산", () => {
  it("떠난 학생 점수가 있는 메모리 지급은 작업 팔 전까지 닫아 둔다", async () => {
    const gameRoom = makeRoom({
      gameId: "memory",
      players: [
        { id: "t1", name: "교사", isHost: true, joinedAt: 1 },
        { id: "s1", name: "학생", isHost: false, joinedAt: 2 },
      ],
      chain: [],
      gameState: {
        stateVersion: 2,
        game: "memory",
        phase: "done",
        endReason: "completed",
        qCards: [
          { id: "q-1", pairId: "pair-1", type: "q" },
          { id: "q-2", pairId: "pair-2", type: "q" },
        ],
        aCards: [
          { id: "a-1", pairId: "pair-1", type: "a" },
          { id: "a-2", pairId: "pair-2", type: "a" },
        ],
        takenIds: ["q-1", "a-1", "q-2", "a-2"],
        scores: { t1: 0, s1: 1, s2: 1 },
      },
      version: 10,
      playId: "11111111-1111-4111-8111-111111111111",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    });
    mLoadGameRoom.mockResolvedValue(gameRoom);
    txQueryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ data: gameRoom }]);

    const res = await POST(awardReq({ ...BODY, gameId: "memory" }));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "relay",
      {},
      [
        { question: "첫 질문인가요?", playerId: "s1", playerName: "학생" },
        { question: "둘째 질문인가요?", playerId: "s1", playerName: "학생" },
      ],
      6,
    ],
  ])("%s는 요청값이 아닌 저장 상태를 점수로 바꾼다", async (
    gameId,
    gameState,
    chain,
    expectedPoints,
  ) => {
    const gameRoom = makeRoom({ gameId, gameState, chain });
    mLoadGameRoom.mockResolvedValue(gameRoom);
    txQueryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ data: gameRoom }]);

    const res = await POST(awardReq({ ...BODY, gameId }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        studentId: "s1",
        bonusType: "VALID_QUESTIONS",
        points: expectedPoints,
      }),
    ]));
  });

  const repeatedStateCases: Array<[
    string,
    Record<string, unknown>,
    GameRoom["chain"],
  ]> = [
    [
      "relay",
      {},
      [
        { question: "같은 질문인가요?", playerId: "s1", playerName: "학생" },
        { question: " 같은   질문인가요? ", playerId: "s1", playerName: "학생" },
      ],
    ],
  ];

  it.each(repeatedStateCases)(
    "%s의 같은 활동 반복 기록은 지급하지 않는다",
    async (gameId, gameState, chain) => {
      const gameRoom = makeRoom({ gameId, gameState, chain, version: 20 });
      mLoadGameRoom.mockResolvedValue(gameRoom);

      const res = await POST(awardReq({ ...BODY, gameId }));

      expect(res.status).toBe(409);
      expect(mGenerateJson).not.toHaveBeenCalled();
      expect(mTx).not.toHaveBeenCalled();
      expect(txPointLogCreateMany).not.toHaveBeenCalled();
      expect(txUserUpdate).not.toHaveBeenCalled();
    },
  );

  const overLimitStateCases: Array<[
    string,
    Record<string, unknown>,
    GameRoom["chain"],
  ]> = [
    [
      "relay",
      {},
      Array.from({ length: 31 }, (_, index) => ({
        question: `질문 ${index}인가요?`,
        playerId: "s1",
        playerName: "학생",
      })),
    ],
  ];

  it.each(overLimitStateCases)(
    "%s의 학생별 활동 상한을 넘는 한 번의 저장 상태는 지급하지 않는다",
    async (gameId, gameState, chain) => {
      const gameRoom = makeRoom({ gameId, gameState, chain, version: 100 });
      mLoadGameRoom.mockResolvedValue(gameRoom);

      const res = await POST(awardReq({ ...BODY, gameId }));

      expect(res.status).toBe(409);
      expect(mGenerateJson).not.toHaveBeenCalled();
      expect(mTx).not.toHaveBeenCalled();
      expect(txPointLogCreateMany).not.toHaveBeenCalled();
      expect(txUserUpdate).not.toHaveBeenCalled();
    },
  );

  it("학생별 상한 안이어도 방 전체 활동 상한을 넘으면 지급하지 않는다", async () => {
    const students = Array.from({ length: 5 }, (_, index) => ({
      id: `s${index + 1}`,
      role: "STUDENT",
      school: "별빛초",
      grade: "3",
      className: "1",
    }));
    const players = [
      { id: "t1", name: "교사", isHost: true, joinedAt: 1 },
      ...students.map((student, index) => ({
        id: student.id,
        name: `학생 ${index + 1}`,
        isHost: false,
        joinedAt: index + 2,
      })),
    ];
    const chain = students.flatMap((student) =>
      Array.from({ length: 25 }, (_, index) => ({
        question: `${student.id} 질문 ${index}인가요?`,
        playerId: student.id,
        playerName: student.id,
      })),
    );
    const gameRoom = makeRoom({
      gameId: "relay",
      players,
      chain,
      version: 200,
    });
    mUserFindMany.mockResolvedValue(students);
    mLoadGameRoom.mockResolvedValue(gameRoom);

    const res = await POST(awardReq({ ...BODY, gameId: "relay" }));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  const versionStateCases: Array<[
    string,
    Record<string, unknown>,
    GameRoom["chain"],
  ]> = [
    [
      "relay",
      {},
      [
        { question: "질문 하나인가요?", playerId: "s1", playerName: "학생" },
        { question: "질문 둘인가요?", playerId: "s1", playerName: "학생" },
      ],
    ],
  ];

  it.each(versionStateCases)(
    "%s의 활동 수가 방 버전보다 많으면 지급하지 않는다",
    async (gameId, gameState, chain) => {
      const gameRoom = makeRoom({ gameId, gameState, chain, version: 1 });
      mLoadGameRoom.mockResolvedValue(gameRoom);

      const res = await POST(awardReq({ ...BODY, gameId }));

      expect(res.status).toBe(409);
      expect(mGenerateJson).not.toHaveBeenCalled();
      expect(mTx).not.toHaveBeenCalled();
      expect(txPointLogCreateMany).not.toHaveBeenCalled();
      expect(txUserUpdate).not.toHaveBeenCalled();
    },
  );
});

describe("포인트 지급 저장", () => {
  it("기본 점수는 내부 수명 키로 트랜잭션 지급하고 합계를 누적한다", async () => {
    const res = await POST(awardReq(BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mTx).toHaveBeenCalledTimes(1);
    expect(txPointLogCreate).not.toHaveBeenCalled();
    expect(txPointLogCreateMany).toHaveBeenCalledTimes(1);
    expect(txPointLogCreateMany.mock.calls[0][0].data).toHaveLength(4);
    expect(txUserUpdate).toHaveBeenCalledTimes(1);
    const types = data.awards.map((award: { bonusType: string }) => award.bonusType);
    expect(types).toHaveLength(4);
    expect(new Set(types).size).toBe(4);
  });

  it("첫 기록에 종류와 버전이 있는 결과 JSON을 저장한다", async () => {
    mGenerateJson.mockResolvedValue({
      bonuses: [],
      bestQuestion: {
        studentId: "s1",
        question: "왜 별이 보일까요?",
        reason: "좋은 질문",
      },
      summary: "함께 잘 탐구했습니다.",
    });

    await POST(awardReq(BODY));

    const rows = txPointLogCreateMany.mock.calls[0][0].data as Array<{
      aiAnalysis?: string;
    }>;
    const firstData = rows[0];
    expect(JSON.parse(firstData.aiAnalysis ?? "null")).toEqual({
      type: "game-room-award-result",
      version: 1,
      bestQuestion: {
        studentId: "s1",
        question: "왜 별이 보일까요?",
        reason: "좋은 질문",
      },
      summary: "함께 잘 탐구했습니다.",
    });
    for (const row of rows.slice(1)) {
      expect(row.aiAnalysis).toBeUndefined();
    }
  });

  it("잠금과 방 공유 잠금 뒤 같은 수명 기록을 다시 확인하고 쓴다", async () => {
    await POST(awardReq(BODY));

    expect(txQueryRaw).toHaveBeenCalledTimes(4);
    const [lockStrings, ...lockValues] = txQueryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const [roomStrings, ...roomValues] = txQueryRaw.mock.calls[1] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(lockStrings.join("?")).toContain("pg_advisory_xact_lock");
    expect(lockValues).toContain("relay:room:1234:100");
    expect(roomStrings.join("?")).toContain('FROM "game_rooms"');
    expect(roomStrings.join("?")).toContain("FOR SHARE");
    expect(roomValues).toContain("1234");
    expect(txQueryRaw.mock.invocationCallOrder[1])
      .toBeLessThan(txPointLogFindMany.mock.invocationCallOrder[0]);
    expect(txPointLogFindMany.mock.invocationCallOrder[0])
      .toBeLessThan(txPointLogCreateMany.mock.invocationCallOrder[0]);
    expect(txPointLogCreateMany.mock.invocationCallOrder[0])
      .toBeLessThan(txUserUpdate.mock.invocationCallOrder[0]);
  });

  it("쓰기 직전 교사 담당 학급이 바뀌면 현재 범위로 다시 검사한다", async () => {
    txUserFindUnique.mockResolvedValue({
      role: "TEACHER",
      school: "별빛초",
      teacherClasses: [{ grade: "3", className: "2" }],
    });

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("교사와 담당 학급 및 참가 학생 행을 잠그고 직렬 실행으로 지급한다", async () => {
    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(200);
    const sqlCalls = txQueryRaw.mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join("?"),
    );
    expect(sqlCalls.some((sql) =>
      sql.includes('FROM "users"') && sql.includes("FOR SHARE")
    )).toBe(true);
    expect(sqlCalls.some((sql) =>
      sql.includes('FROM "teacher_classes"') && sql.includes("FOR SHARE")
    )).toBe(true);
    expect(mTx.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });

  it("첫 확인 뒤 방 수명이 바뀌면 409이고 쓰지 않는다", async () => {
    txQueryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ data: makeRoom({ createdAt: 200 }) }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("잠금 전에 놀이 상태 버전이 바뀌면 409이고 쓰지 않는다", async () => {
    txQueryRaw
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ data: makeRoom({ version: 2 }) }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("잠금 뒤 기존 지급의 학생이 현재 방 참가자가 아니면 반환하지 않는다", async () => {
    txPointLogFindMany.mockResolvedValue([{
      id: "existing",
      studentId: "다른학생",
      bonusType: "PARTICIPATION",
      points: 5,
      reason: "참여",
      status: "APPROVED",
    }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("잠금 뒤 기존 지급이 생겨도 현재 담당 범위를 다시 확인한다", async () => {
    txPointLogFindMany.mockResolvedValue([{
      id: "existing",
      studentId: "s1",
      points: 5,
    }]);
    txUserFindMany.mockResolvedValue([{
      id: "s1",
      role: "STUDENT",
      school: "다른학교",
      grade: "3",
      className: "1",
    }]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(403);
    expect(txPointLogCreateMany).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("동시 호출로 unique 충돌이 나면 현재 수명 기록을 반환한다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    mFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "log1",
        studentId: "s1",
        bonusType: "PARTICIPATION",
        points: 5,
        reason: "참여",
        status: "APPROVED",
      }]);

    const data = await (await POST(awardReq(BODY))).json();

    expect(data.alreadyAwarded).toBe(true);
  });

  it("동시 충돌 뒤 현재 방 밖 학생 기록은 반환하지 않는다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    mFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "log1",
        studentId: "outside-student",
        bonusType: "PARTICIPATION",
        points: 5,
        reason: "참여",
        status: "APPROVED",
      }]);

    expect((await POST(awardReq(BODY))).status).toBe(403);
  });

  it("unique 충돌 뒤 현재 수명 기록이 비어 있으면 500이다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    mFindMany.mockResolvedValue([]);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(500);
  });

  it("그 외 저장 실패는 500", async () => {
    mTx.mockRejectedValue(new Error("db down"));

    expect((await POST(awardReq(BODY))).status).toBe(500);
  });

  it("직렬 실행 충돌은 다시 시도할 수 있도록 409로 응답한다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("retry", {
        code: "P2034",
        clientVersion: "5",
      }),
    );

    expect((await POST(awardReq(BODY))).status).toBe(409);
  });
});

describe("버전 2 실행별 점수 지급", () => {
  it("같은 방의 서로 다른 실행은 별도 점수 키를 사용한다", () => {
    expect(buildRoomAwardKey("1234", 100, V2_PLAY_ID)).toBe(
      `room:1234:100:${V2_PLAY_ID}`,
    );
    expect(buildRoomAwardKey("1234", 100, V2_OTHER_PLAY_ID)).toBe(
      `room:1234:100:${V2_OTHER_PLAY_ID}`,
    );
    expect(buildRoomAwardKey("1234", 100)).toBe("room:1234:100");
  });

  it("클라이언트 기여를 무시하고 저장된 완료 질문을 실행 키로 지급한다", async () => {
    const room = makeV2RelayRoom();
    useLockedRoom(room);

    const res = await POST(awardReq(v2Body("relay")));
    const data = await res.json();
    const executionKey = `room:1234:100:${V2_PLAY_ID}`;

    expect(res.status).toBe(200);
    expect(data.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        studentId: "s1",
        bonusType: "VALID_QUESTIONS",
        points: 9,
      }),
    ]));
    expect(data.awards).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "attacker-target" }),
    ]));
    expect(mFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        gameId: "relay",
        roomCode: executionKey,
        status: "APPROVED",
      },
    }));
    expect(txPointLogFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        gameId: "relay",
        roomCode: executionKey,
        status: "APPROVED",
      },
    }));
    expect(txPointLogCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ roomCode: executionKey }),
      ]),
    });
  });

  it("버전 2 실행 식별값이 없거나 현재 방과 다르면 거절한다", async () => {
    const room = makeV2RelayRoom();
    mLoadGameRoom.mockResolvedValue(room);

    const missing = await POST(awardReq({
      ...v2Body("relay"),
      playId: undefined,
    }));
    const mismatched = await POST(awardReq(v2Body("relay", V2_OTHER_PLAY_ID)));

    expect(missing.status).toBe(409);
    expect(mismatched.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it.each(["host", "insufficient-players"])(
    "%s 종료는 참가와 완료 점수도 지급하지 않는다",
    async (endReason) => {
      const room = makeV2RelayRoom({
        gameState: {
          ...makeV2RelayRoom().gameState,
          endReason,
        },
      });
      mLoadGameRoom.mockResolvedValue(room);

      const res = await POST(awardReq(v2Body("relay")));

      expect(res.status).toBe(409);
      expect(mGenerateJson).not.toHaveBeenCalled();
      expect(mTx).not.toHaveBeenCalled();
    },
  );

  it("짝 찾기는 질문 점수 없이 활동 우승과 참가 및 완료 점수만 지급한다", async () => {
    const room = makeV2MemoryRoom();
    useLockedRoom(room);

    const res = await POST(awardReq(v2Body("memory")));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "s1", bonusType: "PARTICIPATION" }),
      expect.objectContaining({ studentId: "s1", bonusType: "COMPLETION" }),
      expect.objectContaining({ studentId: "s1", bonusType: "WINNER" }),
    ]));
    expect(data.awards).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ bonusType: "VALID_QUESTIONS" }),
    ]));
    expect(mGenerateJson).not.toHaveBeenCalled();
  });

  it("질문도 활동 점수도 없는 완료 방은 인공지능 없이 참가와 완료만 지급한다", async () => {
    const room = makeV2MemoryRoom({ t1: 0, s1: 0 });
    useLockedRoom(room);

    const res = await POST(awardReq(v2Body("memory")));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awards.map((award: { bonusType: string }) => award.bonusType))
      .toEqual(["PARTICIPATION", "COMPLETION"]);
    expect(mGenerateJson).not.toHaveBeenCalled();
  });

  it("기존 지급은 승인 기록만 공개 필드로 복원한다", async () => {
    const room = makeV2MemoryRoom();
    mLoadGameRoom.mockResolvedValue(room);
    mFindMany.mockResolvedValue([
      {
        id: "private-id",
        studentId: "s1",
        gameId: "memory",
        roomCode: `room:1234:100:${V2_PLAY_ID}`,
        bonusType: "PARTICIPATION",
        points: 1,
        reason: "게임 참여",
        status: "APPROVED",
        awardedById: "private-teacher",
        aiAnalysis: null,
      },
      {
        id: "private-id-2",
        studentId: "s1",
        gameId: "memory",
        roomCode: `room:1234:100:${V2_PLAY_ID}`,
        bonusType: "COMPLETION",
        points: 5,
        reason: "게임 완료",
        status: "APPROVED",
        awardedById: "private-teacher",
        aiAnalysis: null,
      },
    ]);

    const data = await (await POST(awardReq(v2Body("memory")))).json();

    expect(data).toEqual({
      alreadyAwarded: true,
      awards: [
        {
          studentId: "s1",
          bonusType: "PARTICIPATION",
          points: 1,
          reason: "게임 참여",
        },
        {
          studentId: "s1",
          bonusType: "COMPLETION",
          points: 5,
          reason: "게임 완료",
        },
      ],
    });
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("승인되지 않은 기록은 기존 지급 결과로 복원하지 않는다", async () => {
    const room = makeV2MemoryRoom();
    useLockedRoom(room);
    mFindMany.mockResolvedValue([{
      studentId: "s1",
      bonusType: "PARTICIPATION",
      points: 1,
      reason: "검토 중",
      status: "PENDING",
      aiAnalysis: null,
    }]);

    const res = await POST(awardReq(v2Body("memory")));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.alreadyAwarded).toBeUndefined();
    expect(mTx).toHaveBeenCalledTimes(1);
  });
});

describe("저장 질문 기반 인공지능 보너스", () => {
  const storedRequest = {
    gameId: "relay",
    roomCode: "1234",
    roomCreatedAt: 100,
    playId: V2_PLAY_ID,
    topic: "우주",
    contributions: [
      {
        studentId: "s1",
        studentName: "학생 하나",
        validQuestions: 1,
        questions: ["Why Stars?"],
        isWinner: false,
      },
      {
        studentId: "s2",
        studentName: "학생 둘",
        validQuestions: 0,
        questions: [],
        isWinner: false,
      },
    ],
  };

  it("최고 질문은 공백과 대소문자를 정규화해 저장 원문으로 돌려준다", () => {
    const result = buildAwardList(storedRequest, {
      bestQuestion: {
        studentId: "s1",
        question: "  why   stars? ",
        reason: "탐구할 점이 분명해요.",
      },
      bonuses: [],
    });

    expect(result.bestQuestion?.question).toBe("Why Stars?");
    expect(result.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "s1", bonusType: "BEST_QUESTION" }),
    ]));
  });

  it("저장 질문과 다른 최고 질문 및 질문이 빈 학생의 모든 보너스를 거절한다", () => {
    const forgedQuestionResult = buildAwardList(storedRequest, {
      bestQuestion: {
        studentId: "s1",
        question: "서버에 없는 질문은 무엇인가요?",
        reason: "가짜 근거",
      },
      bonuses: [],
    });
    const emptyStudentResult = buildAwardList(storedRequest, {
      bestQuestion: {
        studentId: "s2",
        question: "가짜 질문은 무엇인가요?",
        reason: "가짜 근거",
      },
      bonuses: [
        { studentId: "s2", bonusType: "CREATIVITY", reason: "가짜 근거" },
        { studentId: "s2", bonusType: "COOPERATION", reason: "가짜 근거" },
        { studentId: "s1", bonusType: "EFFORT", reason: "실제 질문 근거" },
      ],
    });

    expect(forgedQuestionResult.bestQuestion).toBeUndefined();
    expect(emptyStudentResult.bestQuestion).toBeUndefined();
    expect(emptyStudentResult.awards).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ bonusType: "BEST_QUESTION" }),
      expect.objectContaining({ studentId: "s2", bonusType: "CREATIVITY" }),
      expect.objectContaining({ studentId: "s2", bonusType: "COOPERATION" }),
    ]));
    expect(emptyStudentResult.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: "s1", bonusType: "EFFORT" }),
    ]));
  });
});
