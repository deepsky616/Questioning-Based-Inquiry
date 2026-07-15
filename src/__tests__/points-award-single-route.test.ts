import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: {
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/points/award-single/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindFirst = prisma.pointLog.findFirst as unknown as ReturnType<typeof vi.fn>;
const mAggregate = prisma.pointLog.aggregate as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function awardReq(body: unknown) {
  return new NextRequest("http://localhost/api/points/award-single", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BODY = {
  mode: "solo",
  gameId: "dice",
  instanceId: "client-generated-instance",
  validQuestions: 999999,
  completed: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
});

describe("단독 질문놀이 점수 지급", () => {
  it("일곱 지역 놀이 화면은 자동 포인트 지급 훅을 사용하지 않는다", () => {
    const gameFiles = [
      "MemoryGame.tsx",
      "MysteryBoxGame.tsx",
      "LadderGame.tsx",
      "StoryDiceGame.tsx",
      "DiceGame.tsx",
      "RelayGame.tsx",
      "KabaGame.tsx",
    ];

    for (const file of gameFiles) {
      const source = readFileSync(join(
        process.cwd(),
        "src/app/(student)/student-question-play/games",
        file,
      ), "utf8");
      expect(source, file).not.toContain("useSingleAward");
      expect(source, file).not.toContain("AwardBadge");
      expect(source, file).not.toContain("/api/points/award-single");
    }
  });

  it("비로그인은 거부한다", async () => {
    mAuth.mockResolvedValue(null);

    expect((await POST(awardReq(BODY))).status).toBe(401);
  });

  it("교사 미리보기는 점수를 기록하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });

    const res = await POST(awardReq(BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ awarded: 0, preview: true });
    expect(mTx).not.toHaveBeenCalled();
  });

  it("끝내지 않은 놀이는 기존처럼 점수 없이 안내한다", async () => {
    const res = await POST(awardReq({ ...BODY, completed: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({
      awarded: 0,
      notCompleted: true,
    }));
    expect(mTx).not.toHaveBeenCalled();
  });

  it("서버에 저장된 진행 증거가 없는 완료와 활동 수로 점수를 만들지 않는다", async () => {
    const res = await POST(awardReq(BODY));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data).toEqual(expect.objectContaining({ awarded: 0 }));
    expect(mFindFirst).not.toHaveBeenCalled();
    expect(mAggregate).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("동시에 여러 완료 요청을 보내도 점수와 일일 상한을 바꾸지 않는다", async () => {
    const responses = await Promise.all([
      POST(awardReq({ ...BODY, instanceId: "first" })),
      POST(awardReq({ ...BODY, instanceId: "second" })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([409, 409]);
    expect(mFindFirst).not.toHaveBeenCalled();
    expect(mAggregate).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });
});
