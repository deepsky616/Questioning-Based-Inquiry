import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  AiKeyMissingError: class AiKeyMissingError extends Error {},
  AiQuotaError: class AiQuotaError extends Error {},
  AiBusyError: class AiBusyError extends Error {},
  generateJsonWithMetadata: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { aggregate: vi.fn(), createMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    practiceCustomItem: { findFirst: vi.fn(), findMany: vi.fn() },
    practiceAttempt: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AiKeyMissingError, generateJsonWithMetadata } from "@/lib/ai";
import { __resetRateLimit } from "@/lib/rate-limit";
import { PRACTICE_DAILY_CAP, PRACTICE_POINTS } from "@/lib/practice-points";
import { issuePracticeGenerationProof } from "@/lib/practice-generation-proof";
import { JsonExtractionError } from "@/lib/json-extract";
import { POST } from "@/app/api/points/practice/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mAggregate = prisma.pointLog.aggregate as unknown as ReturnType<typeof vi.fn>;
const mCreate = prisma.pointLog.createMany as unknown as ReturnType<typeof vi.fn>;
const mUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUserFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mUserUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const mQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mGen = generateJsonWithMetadata as unknown as ReturnType<typeof vi.fn>;
const mCustomFindMany = prisma.practiceCustomItem.findMany as unknown as ReturnType<typeof vi.fn>;
const mAttempt = prisma.practiceAttempt.create as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("http://localhost/api/points/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// 은행 실제 문항: q01(닫힌·사실적), t01(target open), c01(주제)
const QUIZ_OK = { mode: "quiz", itemId: "q01", quizType: "closure", answer: "closed" };
const PROOF_SECRET = "practice-points-test-secret-at-least-32-characters";

function transformProof(source: string, target: "open" | "conceptual" | "controversial" = "open") {
  return issuePracticeGenerationProof({
    userId: "s1",
    mode: "transform",
    target,
    content: source,
  }).proof;
}

function createProof(passage: string) {
  return issuePracticeGenerationProof({
    userId: "s1",
    mode: "create",
    content: passage,
  }).proof;
}

let lockedCustomItem: (Record<string, unknown> & { isActive: boolean }) | null = null;

function allowCustomItem(row: Record<string, unknown>) {
  const scopedRow = { teacherId: "teacher-1", ...row };
  mUserFindUnique.mockResolvedValue({
    role: "STUDENT",
    school: "별빛초",
    grade: "3",
    className: "1",
  });
  mUserFindMany.mockResolvedValue([{ id: "teacher-1" }]);
  mCustomFindMany.mockResolvedValue([scopedRow]);
  lockedCustomItem = { ...scopedRow, isActive: true };
}

const aiClassification = (closure: string, cognitive: string) => ({
  data: {
    closure,
    cognitive,
    closureScore: 0.3,
    cognitiveScore: 0.8,
    reasoning: "테스트 근거",
    feedback: "잘했어요",
    inappropriate: false,
    inappropriateReason: "",
    isQuestion: true,
    sourceRelevant: true,
    taskCompleted: true,
  },
  model: "gemini-2.5-flash",
});

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  process.env.GAME_ACTIVITY_HASH_SECRET = PROOF_SECRET;
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mAggregate.mockResolvedValue({ _sum: { points: 0 } });
  mCreate.mockResolvedValue({ count: 1 });
  mUserFindUnique.mockResolvedValue({ role: "STUDENT" });
  mUserFindMany.mockResolvedValue([]);
  mUserUpdate.mockResolvedValue({ id: "s1", totalPoints: 1 });
  mAttempt.mockResolvedValue({ id: "attempt-1" });
  lockedCustomItem = null;
  mQueryRaw.mockImplementation(async (query: {
    strings?: readonly string[];
    sql?: string;
    values?: unknown[];
  }) => {
    const sql = Array.isArray(query)
      ? query.join("?")
      : query.strings?.join("?") ?? query.sql ?? "";
    if (sql.includes("clock_timestamp")) {
      return [{ awardedAt: new Date("2026-07-16T12:00:00.000Z") }];
    }
    if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "ok" }];
    if (sql.includes("teacher_classes")) return [];
    if (sql.includes("practice_custom_items")) {
      return lockedCustomItem?.isActive ? [lockedCustomItem] : [];
    }
    if (sql.includes('FROM "users"') && query.values?.[0] === "teacher-1") {
      return [{
        id: "teacher-1",
        role: "TEACHER",
        school: "별빛초",
        grade: null,
        className: null,
      }];
    }
    return [{
      id: "s1",
      role: "STUDENT",
      school: "별빛초",
      grade: "3",
      className: "1",
    }];
  });
  mTx.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input(prisma);
    }
    return Promise.all(input as Promise<unknown>[]);
  });
  mGen.mockResolvedValue(aiClassification("open", "conceptual"));
  mCustomFindMany.mockResolvedValue([]);
});

describe("연습 포인트 — 분류 퀴즈", () => {
  it("서버가 은행으로 재검증해 정답이면 지급한다", async () => {
    const res = await POST(req(QUIZ_OK));
    const data = await res.json();
    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.QUIZ_CORRECT);
    expect(mTx).toHaveBeenCalledTimes(1);
  });

  it("교사 세션이 오래됐어도 현재 자료베이스 역할이 학생이면 시도를 기록하고 지급한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "TEACHER" } });

    const data = await (await POST(req(QUIZ_OK))).json();

    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.QUIZ_CORRECT);
    expect(mAttempt).toHaveBeenCalledWith({
      data: {
        studentId: "s1",
        mode: "quiz",
        itemId: "q01",
        quizType: "closure",
        correct: true,
      },
    });
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
  });

  it("클라이언트가 정답이라고 주장해도 은행과 다르면 지급하지 않는다", async () => {
    const res = await POST(req({ ...QUIZ_OK, answer: "open" }));
    const data = await res.json();
    expect(data.correct).toBe(false);
    expect(data.awarded).toBe(0);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mAttempt).toHaveBeenCalledWith({
      data: {
        studentId: "s1",
        mode: "quiz",
        itemId: "q01",
        quizType: "closure",
        correct: false,
      },
    });
  });

  it("존재하지 않는 문항은 400", async () => {
    expect((await POST(req({ ...QUIZ_OK, itemId: "없는문항" }))).status).toBe(400);
  });

  it("같은 문항 재도전은 중복 삽입을 건너뛰고 시도만 기록한다", async () => {
    mCreate.mockResolvedValue({ count: 0 });
    const data = await (await POST(req(QUIZ_OK))).json();
    expect(data).toEqual({
      correct: true,
      awarded: 0,
      capped: false,
      alreadyAwarded: true,
    });
    expect(mAttempt).toHaveBeenCalledOnce();
  });

  it("하루 상한에 도달하면 지급하지 않는다", async () => {
    mAggregate.mockResolvedValue({ _sum: { points: PRACTICE_DAILY_CAP } });
    const data = await (await POST(req(QUIZ_OK))).json();
    expect(data.awarded).toBe(0);
    expect(data.capped).toBe(true);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mCreate).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 서울 자정을 넘겨도 잠금 뒤 자료베이스 시각 하나로 날짜 키와 합산 경계를 맞춘다", async () => {
    const beforeMidnight = new Date("2026-07-16T14:59:59.900Z");
    const afterMidnight = new Date("2026-07-16T15:00:00.100Z");
    vi.useFakeTimers();
    vi.setSystemTime(beforeMidnight);
    mQueryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = Array.isArray(query)
        ? query.join("?")
        : query.strings?.join("?") ?? query.sql ?? "";
      if (sql.includes("clock_timestamp")) return [{ awardedAt: afterMidnight }];
      return [{ id: "s1", role: "STUDENT" }];
    });

    try {
      const data = await (await POST(req(QUIZ_OK))).json();

      expect(data.awarded).toBe(PRACTICE_POINTS.QUIZ_CORRECT);
      expect(mQueryRaw).toHaveBeenCalledTimes(2);
      expect(mAggregate).toHaveBeenCalledWith({
        _sum: { points: true },
        where: {
          studentId: "s1",
          gameId: "PRACTICE",
          status: "APPROVED",
          createdAt: { gte: new Date("2026-07-16T15:00:00.000Z") },
        },
      });
      expect(mCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roomCode: "quiz:q01:closure:2026-07-17",
          createdAt: afterMidnight,
        }),
        skipDuplicates: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("서로 다른 두 동시 지급도 학생 행 잠금 뒤 최신 합계를 읽어 하루 상한을 넘지 않는다", async () => {
    let earnedToday = PRACTICE_DAILY_CAP - 1;
    let outsideReadCount = 0;
    let releaseOutsideReads!: () => void;
    const bothOutsideReadsStarted = new Promise<void>((resolve) => {
      releaseOutsideReads = resolve;
    });
    const order: string[] = [];
    const aggregateCalls: unknown[] = [];
    const lockQueries: Array<{ sql: string; values: unknown[] }> = [];
    const createdPoints: number[] = [];
    let userUpdateCount = 0;
    let transactionCount = 0;
    let lockTail = Promise.resolve();

    // 이전 구현은 트랜잭션 밖에서 두 요청이 같은 14점을 읽도록 만든다.
    mAggregate.mockImplementation(async () => {
      const snapshot = earnedToday;
      outsideReadCount += 1;
      if (outsideReadCount === 2) releaseOutsideReads();
      await bothOutsideReadsStarted;
      return { _sum: { points: snapshot } };
    });
    mCreate.mockImplementation(async ({ data }) => {
      earnedToday += data.points;
      return { count: 1 };
    });
    mTx.mockImplementation(async (input: unknown) => {
      if (typeof input !== "function") {
        return Promise.all(input as Promise<unknown>[]);
      }

      transactionCount += 1;
      const transactionId = transactionCount;
      const previousLock = lockTail;
      let releaseLock!: () => void;
      lockTail = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const tx = {
        $queryRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => {
          if (query.sql.includes("clock_timestamp")) {
            order.push(`time:${transactionId}`);
            return [{ awardedAt: new Date("2026-07-16T12:00:00.000Z") }];
          }
          await previousLock;
          lockQueries.push(query);
          order.push(`lock:${transactionId}`);
          return [{ id: "s1", role: "STUDENT" }];
        }),
        pointLog: {
          aggregate: vi.fn(async (args: unknown) => {
            aggregateCalls.push(args);
            order.push(`sum:${transactionId}`);
            return { _sum: { points: earnedToday } };
          }),
          createMany: vi.fn(async ({ data }: { data: { points: number } }) => {
            order.push(`create:${transactionId}`);
            createdPoints.push(data.points);
            earnedToday += data.points;
            return { count: 1 };
          }),
        },
        practiceAttempt: {
          create: vi.fn(async () => {
            order.push(`attempt:${transactionId}`);
            return { id: `attempt-${transactionId}` };
          }),
        },
        user: {
          update: vi.fn(async () => {
            order.push(`update:${transactionId}`);
            userUpdateCount += 1;
            return { id: "s1", totalPoints: earnedToday };
          }),
        },
      };

      try {
        return await input(tx);
      } finally {
        releaseLock();
      }
    });

    const responses = await Promise.all([
      POST(req(QUIZ_OK)),
      POST(req({ ...QUIZ_OK, itemId: "q02" })),
    ]);
    const results = await Promise.all(responses.map((response) => response.json()));

    expect(results.reduce((sum, result) => sum + result.awarded, 0)).toBe(1);
    expect(results.filter((result) => result.capped)).toHaveLength(1);
    expect(order).toEqual([
      "lock:1",
      "attempt:1",
      "time:1",
      "sum:1",
      "create:1",
      "update:1",
      "lock:2",
      "attempt:2",
      "time:2",
      "sum:2",
    ]);
    expect(lockQueries).toHaveLength(2);
    expect(lockQueries[0].sql).toContain('FROM "users"');
    expect(lockQueries[0].sql).toContain("FOR UPDATE");
    expect(lockQueries[0].values).toEqual(["s1"]);
    expect(aggregateCalls).toHaveLength(2);
    expect(aggregateCalls[0]).toEqual({
      _sum: { points: true },
      where: {
        studentId: "s1",
        gameId: "PRACTICE",
        status: "APPROVED",
        createdAt: { gte: expect.any(Date) },
      },
    });
    expect(createdPoints).toEqual([1]);
    expect(userUpdateCount).toBe(1);
  });

  it("학생 토큰이 오래됐어도 현재 자료베이스 역할이 교사이면 지급하지 않는다", async () => {
    mUserFindUnique.mockResolvedValue({ role: "TEACHER" });
    mQueryRaw.mockResolvedValue([{ id: "s1", role: "TEACHER" }]);

    const data = await (await POST(req(QUIZ_OK))).json();

    expect(data).toEqual({
      correct: true,
      awarded: 0,
      capped: false,
      alreadyAwarded: false,
    });
    expect(mAttempt).not.toHaveBeenCalled();
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mQueryRaw).toHaveBeenCalled();
    expect(mAggregate).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("교사 계정은 판정만 받고 지급은 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mUserFindUnique.mockResolvedValue({ role: "TEACHER" });
    mQueryRaw.mockResolvedValue([{
      id: "t1",
      role: "TEACHER",
      school: "별빛초",
      grade: null,
      className: null,
    }]);
    const data = await (await POST(req(QUIZ_OK))).json();
    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(0);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mAttempt).not.toHaveBeenCalled();
  });
});

describe("연습 포인트 — 질문 바꾸기·만들기 (서버 AI 판정)", () => {
  it("목표 유형 달성 시 지급하고 분류 결과를 돌려준다", async () => {
    const res = await POST(req({ mode: "transform", itemId: "t01", content: "주인공의 행동이 어떤 결과를 가져올까요?" }));
    const data = await res.json();
    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
    expect(data.classification.closure).toBe("open");
  });

  it("목표 미달성이면 지급 없이 분류·피드백만 돌려준다", async () => {
    mGen.mockResolvedValue(aiClassification("closed", "factual"));
    const data = await (await POST(req({ mode: "transform", itemId: "t01", content: "주인공 이름이 뭐야?" }))).json();
    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
  });

  it("판정 서비스를 쓸 수 없으면 재시도 오류를 돌리고 오답 시도를 만들지 않는다", async () => {
    mGen.mockRejectedValue(new AiKeyMissingError());

    const response = await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "만약 주인공이 다른 선택을 했다면 어떻게 달라질까요?",
    }));

    expect(response.status).toBe(503);
    expect(mAttempt).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("원문과 무관한 외운 질문은 목표 유형이어도 지급하지 않는다", async () => {
    mGen.mockResolvedValue({
      ...aiClassification("open", "conceptual"),
      data: { ...aiClassification("open", "conceptual").data, sourceRelevant: false },
    });

    const data = await (await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "우주에 도시를 만든다면 어떤 모습이어야 할까요?",
    }))).json();

    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
  });

  it("필수 안전 판정이 빠진 부분 응답은 지급하지 않고 재시도를 요청한다", async () => {
    const partial = aiClassification("open", "conceptual");
    const { inappropriate: _omitted, ...data } = partial.data;
    mGen.mockResolvedValue({ ...partial, data });

    const response = await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "주인공의 선택이 달랐다면 어떤 결과가 생겼을까요?",
    }));

    expect(response.status).toBe(502);
    expect(mAttempt).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("목표 분류 확신이 낮으면 관련 질문이어도 지급하지 않는다", async () => {
    mGen.mockResolvedValue({
      ...aiClassification("open", "conceptual"),
      data: {
        ...aiClassification("open", "conceptual").data,
        closureScore: 0.7,
        cognitiveScore: 0.4,
      },
    });

    const data = await (await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "주인공의 선택은 어떤 결과를 만들었을까요?",
    }))).json();

    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
  });

  it("개념적 목표는 답이 정해진 관계 질문이어도 인지 분류 확신이 높으면 지급한다", async () => {
    mGen.mockResolvedValue(aiClassification("closed", "conceptual"));

    const data = await (await POST(req({
      mode: "create",
      topicId: "c01",
      target: "conceptual",
      content: "문화유산과 지역 사회는 서로 어떤 관계가 있나요?",
    }))).json();

    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
  });

  it("판정 응답 해석이 실패하면 시도를 남기지 않고 재시도 오류를 돌려준다", async () => {
    mGen.mockRejectedValueOnce(new JsonExtractionError("판정 응답 형식 오류"));

    const response = await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "주인공의 선택이 달랐다면 어떤 결과가 생겼을까요?",
    }));

    expect(response.status).toBe(502);
    expect(mAttempt).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("판정에는 원문과 목표를 신뢰하지 않는 구조화 자료로 전달한다", async () => {
    await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "주인공의 선택이 달랐다면 어떤 결과가 생겼을까요?",
    }));

    const options = mGen.mock.calls[0][0];
    expect(JSON.parse(options.prompt)).toEqual({
      mode: "transform",
      sourceText: expect.any(String),
      target: "open",
      submittedQuestion: "주인공의 선택이 달랐다면 어떤 결과가 생겼을까요?",
    });
    expect(options).toEqual(expect.objectContaining({
      systemInstruction: expect.stringContaining("untrusted data"),
      responseMimeType: "application/json",
      responseJsonSchema: expect.any(Object),
    }));
  });

  it("부적절 판정이면 목표 유형이어도 지급하지 않는다", async () => {
    mGen.mockResolvedValue({
      ...aiClassification("open", "controversial"),
      data: { ...aiClassification("open", "controversial").data, inappropriate: true, inappropriateReason: "비속어" },
    });
    const data = await (await POST(req({ mode: "create", topicId: "c01", target: "controversial", content: "나쁜 질문" }))).json();
    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
  });

  it("만들기: 논쟁적 목표에 개념적 질문이면 미달성이다", async () => {
    mGen.mockResolvedValue(aiClassification("open", "conceptual"));
    const data = await (await POST(req({ mode: "create", topicId: "c01", target: "controversial", content: "문화유산은 무엇을 보여줄까?" }))).json();
    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
  });

  it("비로그인은 401, 형식 오류는 400", async () => {
    mAuth.mockResolvedValue(null);
    expect((await POST(req(QUIZ_OK))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await POST(req({ mode: "quiz" }))).status).toBe(400);
  });

  it("삭제된 계정의 남은 인증으로는 판정 모델을 호출하지 않는다", async () => {
    mUserFindUnique.mockResolvedValue(null);

    const response = await POST(req({
      mode: "transform",
      itemId: "t01",
      content: "주인공의 선택이 달랐다면 어떤 결과가 생겼을까요?",
    }));

    expect(response.status).toBe(401);
    expect(mGen).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });
});

describe("연습 시도 기록 — 정답·오답 모두 남긴다", () => {
  it("퀴즈 오답도 시도로 기록한다(정답률 재료)", async () => {
    const data = await (await POST(req({ ...QUIZ_OK, answer: "open" }))).json();
    expect(data.correct).toBe(false);
    expect(mAttempt).toHaveBeenCalledWith({
      data: { studentId: "s1", mode: "quiz", itemId: "q01", quizType: "closure", correct: false },
    });
  });

  it("퀴즈 정답은 correct=true로 기록한다", async () => {
    await POST(req(QUIZ_OK));
    expect(mAttempt).toHaveBeenCalledWith({
      data: { studentId: "s1", mode: "quiz", itemId: "q01", quizType: "closure", correct: true },
    });
  });

  it("교사의 '직접 해보기'는 기록하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mUserFindUnique.mockResolvedValue({ role: "TEACHER" });
    mQueryRaw.mockResolvedValue([{ id: "t1", role: "TEACHER" }]);
    await POST(req(QUIZ_OK));
    expect(mAttempt).not.toHaveBeenCalled();
  });

  it("바꾸기 미달성도 시도로 기록한다", async () => {
    mGen.mockResolvedValue(aiClassification("closed", "factual"));
    await POST(req({ mode: "transform", itemId: "t01", content: "주인공 이름이 뭐야?" }));
    expect(mAttempt).toHaveBeenCalledWith({
      data: { studentId: "s1", mode: "transform", itemId: "t01", correct: false },
    });
  });

  it("AI 실시간 출제는 문항 id 없이 기록한다", async () => {
    const source = "우리나라의 수도는 어디인가요?";
    await POST(req({
      mode: "transform-ai",
      source,
      target: "open",
      content: "수도가 서울이 아니었다면 우리 생활은 어떻게 달라졌을까요?",
      generationProof: transformProof(source),
    }));
    expect(mAttempt).toHaveBeenCalledWith({
      data: { studentId: "s1", mode: "transform-ai", correct: true },
    });
  });

  it("시도 기록 실패 시 점수만 따로 지급하지 않고 재시도를 허용한다", async () => {
    mAttempt.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req(QUIZ_OK));
    expect(res.status).toBe(500);
    expect(mCreate).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });
});

describe("연습 포인트 — 교사 커스텀 문항", () => {
  const CUSTOM_QUIZ_ROW = {
    id: "cust1",
    mode: "quiz",
    content: "우리 반 규칙은 왜 필요할까요?",
    closure: "open",
    cognitive: "conceptual",
    explanation: "정답이 하나가 아니고 관계를 생각하는 질문이에요.",
    source: null, target: null, hint: null, example: null, title: null, passage: null,
  };

  it("내장 은행에 없는 문항 id는 커스텀 문항에서 찾아 채점·지급한다", async () => {
    allowCustomItem(CUSTOM_QUIZ_ROW);
    const data = await (await POST(req({ mode: "quiz", itemId: "cust1", quizType: "closure", answer: "open" }))).json();
    expect(mCustomFindMany).toHaveBeenCalledWith({
      where: {
        teacherId: { in: ["teacher-1"] },
        isActive: true,
        id: "cust1",
        mode: "quiz",
      },
      orderBy: { createdAt: "asc" },
    });
    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.QUIZ_CORRECT);
  });

  it("커스텀 문항 오답은 지급하지 않는다", async () => {
    allowCustomItem(CUSTOM_QUIZ_ROW);
    const data = await (await POST(req({ mode: "quiz", itemId: "cust1", quizType: "closure", answer: "closed" }))).json();
    expect(data.correct).toBe(false);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
  });

  it("비활성·미존재 커스텀 문항은 400", async () => {
    expect((await POST(req({ mode: "quiz", itemId: "cust-none", quizType: "closure", answer: "open" }))).status).toBe(400);
  });

  it("다른 학교나 담당 반 밖의 커스텀 문항 식별값으로는 채점하거나 지급하지 않는다", async () => {
    mUserFindUnique.mockResolvedValue({
      role: "STUDENT",
      school: "별빛초",
      grade: "3",
      className: "1",
    });
    mUserFindMany.mockResolvedValue([]);
    mCustomFindMany.mockResolvedValue([CUSTOM_QUIZ_ROW]);

    const response = await POST(req({
      mode: "quiz",
      itemId: "cust1",
      quizType: "closure",
      answer: "open",
    }));

    expect(response.status).toBe(400);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("커스텀 바꾸기 문항은 DB의 목표 유형으로 판정한다", async () => {
    allowCustomItem({
      ...CUSTOM_QUIZ_ROW,
      id: "cust2", mode: "transform", content: null, closure: null, cognitive: null, explanation: null,
      source: "우리 반 규칙은 몇 개인가요?", target: "controversial",
      hint: "찬반이 갈리는 상황을 만들어 보세요.", example: "규칙이 많은 반과 적은 반, 어느 쪽이 좋을까요?",
    });
    mGen.mockResolvedValue(aiClassification("open", "controversial"));
    const data = await (await POST(req({ mode: "transform", itemId: "cust2", content: "규칙을 학생이 정해야 할까요?" }))).json();
    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
  });

  it("판정 중 커스텀 문항이 비활성화되면 시도와 점수를 모두 보류한다", async () => {
    allowCustomItem(CUSTOM_QUIZ_ROW);
    lockedCustomItem = { ...lockedCustomItem!, isActive: false };

    const response = await POST(req({
      mode: "quiz",
      itemId: "cust1",
      quizType: "closure",
      answer: "open",
    }));

    expect(response.status).toBe(409);
    expect(mAttempt).not.toHaveBeenCalled();
    expect(mCreate).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });
});

describe("연습 포인트 — AI 실시간 출제 문항", () => {
  it("서버가 발급한 생성 증명이 없으면 원문을 바꿔 점수를 받을 수 없다", async () => {
    const response = await POST(req({
      mode: "transform-ai",
      source: "사용자가 마음대로 바꾼 닫힌 질문은 무엇인가요?",
      target: "open",
      content: "이 질문의 답이 달라진다면 어떤 일이 생길까요?",
    }));

    expect(response.status).toBe(400);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("transform-ai: 목표 달성 시 원문 해시 기반 키로 지급한다", async () => {
    const source = "우리나라의 수도는 어디인가요?";
    const res = await POST(req({
      mode: "transform-ai",
      source,
      target: "open",
      content: "수도가 서울이 아니었다면 우리 생활은 어떻게 달라졌을까요?",
      generationProof: transformProof(source),
    }));
    const data = await res.json();
    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
    const roomCode = mCreate.mock.calls[0][0].data.roomCode as string;
    expect(roomCode).toMatch(
      /^transform:ai-[0-9a-f]{64}:\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("같은 원문을 새 증명으로 다시 발급해도 같은 날 중복 키는 바뀌지 않는다", async () => {
    const source = "우리나라의 수도는 어디인가요?";
    const body = {
      mode: "transform-ai",
      source,
      target: "open",
      content: "수도가 서울이 아니었다면 우리 생활은 어떻게 달라졌을까요?",
      generationProof: transformProof(source),
    };
    await POST(req(body));
    const first = mCreate.mock.calls[0][0].data.roomCode;
    mCreate.mockClear();

    await POST(req({ ...body, generationProof: transformProof(source) }));

    expect(mCreate.mock.calls[0][0].data.roomCode).toBe(first);
  });

  it("create-ai: 같은 제시문·목표는 같은 중복 방지 키를 갖는다(하루 1회)", async () => {
    const body = {
      mode: "create-ai",
      passage: "우리 동네 시장에는 오래된 가게가 많아요. 최근 큰 마트가 생기면서 시장을 찾는 사람이 줄었어요.",
      target: "conceptual",
      content: "마트가 생긴 것과 시장 손님이 줄어든 것은 어떤 관계가 있을까요?",
      generationProof: "",
    };
    body.generationProof = createProof(body.passage);
    await POST(req(body));
    const first = mCreate.mock.calls[0][0].data.roomCode;
    mCreate.mockClear();
    await POST(req(body));
    expect(mCreate.mock.calls[0][0].data.roomCode).toBe(first);
  });

  it("서버 증명을 받은 뒤 원문을 바꾸면 거부한다", async () => {
    const original = "우리나라의 수도는 어디인가요?";
    const response = await POST(req({
      mode: "transform-ai",
      source: "사용자가 바꾼 질문은 무엇인가요?",
      target: "open",
      content: "답이 달라졌다면 어떤 일이 생길까요?",
      generationProof: transformProof(original),
    }));

    expect(response.status).toBe(400);
    expect(mGen).not.toHaveBeenCalled();
    expect(mTx).not.toHaveBeenCalled();
  });

  it("transform-ai: 원문 누락 등 형식 오류는 400", async () => {
    expect((await POST(req({ mode: "transform-ai", target: "open", content: "질문" }))).status).toBe(400);
  });
});
