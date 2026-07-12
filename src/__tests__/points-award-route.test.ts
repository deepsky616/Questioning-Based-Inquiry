import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/ai", () => ({ generateJson: vi.fn() }));
vi.mock("@/lib/game-room-store", () => ({ loadGameRoom: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { findMany: vi.fn(), create: vi.fn() },
    user: { update: vi.fn() },
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
import { POST } from "@/app/api/points/award/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mGenerateJson = generateJson as unknown as ReturnType<typeof vi.fn>;
const mLoadGameRoom = loadGameRoom as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mPointCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const awardReq = (body: unknown) =>
  new NextRequest("http://localhost/api/points/award", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "t1",
    status: "ended",
    players: [{ id: "s1", name: "학생", isHost: false, joinedAt: 1 }],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 100,
    updatedAt: 100,
    pointAwardKeyVersion: 1,
    ...overrides,
  };
}

const BODY = {
  gameId: "dice",
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

const snapshot = JSON.stringify({
  type: "game-room-award-result",
  version: 1,
  bestQuestion: { studentId: "s1", question: "왜?", reason: "좋은 질문" },
  summary: "함께 잘 탐구했습니다.",
});

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mGenerateJson.mockResolvedValue({ bonuses: [] });
  mLoadGameRoom.mockResolvedValue(makeRoom());
  mFindMany.mockResolvedValue([]);
  mTx.mockResolvedValue([]);
});

describe("포인트 지급 요청 검증", () => {
  it("비로그인은 401, 일반 필수 항목 누락은 400", async () => {
    mAuth.mockResolvedValue(null);
    expect((await POST(awardReq(BODY))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "t1" } });
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
    ["게임이 다르면", makeRoom({ gameId: "relay" })],
    ["생성 시각이 다르면", makeRoom({ createdAt: 200 })],
  ])("현재 방이 %s 409이고 분석하거나 쓰지 않는다", async (_case, room) => {
    mLoadGameRoom.mockResolvedValue(room);

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(409);
    expect(mGenerateJson).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });
});

describe("포인트 지급 수명별 중복 조회", () => {
  it("표지 방은 예전 표시 코드 기록을 무시하고 내부 키를 쓴다", async () => {
    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(200);
    expect(mFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { gameId: "dice", roomCode: "room:1234:100" },
    }));
    expect(mPointCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roomCode: "room:1234:100" }),
    }));
  });

  it("표지 없는 방은 생성 뒤 예전 표시 코드 기록도 확인한다", async () => {
    mLoadGameRoom.mockResolvedValue(makeRoom({ pointAwardKeyVersion: undefined }));

    await POST(awardReq(BODY));

    expect(mFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        gameId: "dice",
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
      { id: "log1", studentId: "s1", bonusType: "PARTICIPATION", points: 5, reason: "참여", aiAnalysis: "예전 글", createdAt },
      { id: "log2", studentId: "s1", bonusType: "COMPLETION", points: 5, reason: "완료", aiAnalysis: snapshot, createdAt },
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
});

describe("포인트 지급 저장", () => {
  it("기본 점수는 내부 수명 키로 트랜잭션 지급하고 합계를 누적한다", async () => {
    const res = await POST(awardReq(BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mTx).toHaveBeenCalledTimes(1);
    const types = data.awards.map((award: { bonusType: string }) => award.bonusType);
    expect(types).toHaveLength(4);
    expect(new Set(types).size).toBe(4);
  });

  it("첫 기록에 종류와 버전이 있는 결과 JSON을 저장한다", async () => {
    mGenerateJson.mockResolvedValue({
      bonuses: [],
      bestQuestion: { studentId: "s1", question: "왜?", reason: "좋은 질문" },
      summary: "함께 잘 탐구했습니다.",
    });

    await POST(awardReq(BODY));

    const firstData = mPointCreate.mock.calls[0][0].data as { aiAnalysis?: string };
    expect(JSON.parse(firstData.aiAnalysis ?? "null")).toEqual({
      type: "game-room-award-result",
      version: 1,
      bestQuestion: { studentId: "s1", question: "왜?", reason: "좋은 질문" },
      summary: "함께 잘 탐구했습니다.",
    });
    for (const [args] of mPointCreate.mock.calls.slice(1)) {
      expect(args.data.aiAnalysis).toBeUndefined();
    }
  });

  it("동시 호출로 unique 충돌이 나면 현재 수명 기록을 반환한다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    mFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "log1", points: 5 }]);

    const data = await (await POST(awardReq(BODY))).json();

    expect(data.alreadyAwarded).toBe(true);
  });

  it("그 외 저장 실패는 500", async () => {
    mTx.mockRejectedValue(new Error("db down"));

    expect((await POST(awardReq(BODY))).status).toBe(500);
  });
});
