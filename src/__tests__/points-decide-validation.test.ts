import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_ACTIVITY_BONUS_PER_STUDENT } from "@/lib/activity-bonus-policy";
import { POST } from "@/app/api/teacher/points/decide/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mSessions = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const mComments = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mCurrentStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mUserUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const mPointUpdateMany = prisma.pointLog.updateMany as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/teacher/points/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function queryParts(query: unknown, taggedValues: unknown[] = []) {
  if (Array.isArray(query)) {
    return { sql: query.join("?"), values: taggedValues };
  }
  if (typeof query === "object" && query !== null && "sql" in query) {
    const candidate = query as { sql?: unknown; values?: unknown };
    return {
      sql: typeof candidate.sql === "string" ? candidate.sql : "",
      values: Array.isArray(candidate.values) ? candidate.values : [],
    };
  }
  return { sql: "", values: [] as unknown[] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mLogs.mockReset();
  mSessions.mockReset();
  mUser.mockReset();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mLogs.mockResolvedValue([
    { id: "log1", studentId: "s1", sessionId: "sess1", points: 0, bonusType: "AI_DUPLICATE_FLAGGED", relatedQuestionId: "q1", relatedCommentId: null, student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
  ]);
  mSessions.mockResolvedValue([{ id: "sess1" }]);
  mComments.mockResolvedValue([{ id: "c1", questionId: "q1" }]);
  mUser.mockResolvedValue({
    role: "TEACHER",
    school: "우리학교",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mCurrentStudents.mockResolvedValue([
    { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" },
  ]);
  mPointUpdateMany.mockResolvedValue({ count: 1 });
  mQueryRaw.mockImplementation(async (
    query: unknown,
    ...taggedValues: unknown[]
  ) => {
    const { sql, values } = queryParts(query, taggedValues);
    if (sql.includes('FROM "questions"')) {
      return [
        {
          id: "q1",
          authorId: "s1",
          sessionId: "sess1",
          source: "STUDENT",
        },
        {
          id: "q2",
          authorId: "s2",
          sessionId: "sess1",
          source: "STUDENT",
        },
      ];
    }
    if (sql.includes('FROM "comments"')) {
      return [{ id: "c1", authorId: "s1", questionId: "q1" }];
    }
    if (sql.includes('FROM "question_sessions"')) return [{ id: "sess1" }];
    if (sql.includes('FROM "teacher_classes"')) return [];
    if (values.includes("t1")) return [{ id: "t1" }];
    return [{ id: "s1" }, { id: "s2" }];
  });
  mUserUpdate.mockResolvedValue({ id: "s1" });
  mTx.mockImplementation(async (callback: unknown) => {
    const run = callback as (tx: typeof prisma) => Promise<unknown>;
    return run(prisma);
  });
});

// 경고 항목에 점수 수정(구제)을 개방하면서 함께 추가한 서버 범위 검증
describe("포인트 승인 — 수정 점수 범위 검증", () => {
  it("음수 수정 점수는 400 (감점 차단)", async () => {
    const res = await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: -3 }));
    expect(res.status).toBe(400);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("상한 초과·정수 아님도 400", async () => {
    expect(
      (await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: MAX_ACTIVITY_BONUS_PER_STUDENT + 1 }))).status,
    ).toBe(400);
    expect((await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: 2.5 }))).status).toBe(400);
  });

  it("범위 안 수정 점수(경고 항목 구제 포함)는 승인된다", async () => {
    const res = await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: 3 }));
    expect(res.status).toBe(200);
    expect(mTx).toHaveBeenCalledTimes(1);
  });

  it("사전 확인 뒤 담당 학급이 바뀌면 거래 안에서 다시 확인해 승인하지 않는다", async () => {
    mUser
      .mockReset()
      .mockResolvedValueOnce({
        role: "TEACHER",
        school: "우리학교",
        teacherClasses: [{ grade: "5", className: "1" }],
      })
      .mockResolvedValueOnce({
        role: "TEACHER",
        school: "우리학교",
        teacherClasses: [{ grade: "6", className: "2" }],
      });
    mLogs.mockResolvedValue([
      { id: "log1", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_DEEP_QUESTION", student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
    ]);

    const res = await POST(req({ ids: ["log1"], decision: "APPROVE" }));

    expect(res.status).toBe(403);
    expect(mTx).toHaveBeenCalledTimes(1);
    expect(mPointUpdateMany).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("사전 확인 뒤 수업 소유 교사가 바뀌면 거래 안에서 다시 확인해 승인하지 않는다", async () => {
    mSessions
      .mockResolvedValueOnce([{ id: "sess1" }])
      .mockResolvedValueOnce([]);
    mLogs.mockResolvedValue([
      { id: "log1", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_DEEP_QUESTION", student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
    ]);

    const res = await POST(req({ ids: ["log1"], decision: "APPROVE" }));

    expect(res.status).toBe(403);
    expect(mTx).toHaveBeenCalledTimes(1);
    expect(mPointUpdateMany).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("수업 연결이 사라진 인공지능 후보는 다른 교사가 승인할 수 없다", async () => {
    mLogs.mockResolvedValue([{
      id: "log1",
      studentId: "s1",
      sessionId: null,
      points: 3,
      bonusType: "AI_DEEP_QUESTION",
      relatedQuestionId: "q1",
      relatedCommentId: null,
      student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" },
    }]);

    const res = await POST(req({ ids: ["log1"], decision: "APPROVE" }));

    expect(res.status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
    expect(mPointUpdateMany).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("승인 직전 질문 근거가 사라지면 후보를 거부하고 합계에는 반영하지 않는다", async () => {
    mLogs.mockResolvedValue([{
      id: "log1",
      studentId: "s1",
      sessionId: "sess1",
      points: 3,
      bonusType: "AI_DEEP_QUESTION",
      relatedQuestionId: "q1",
      relatedCommentId: null,
      student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" },
    }]);
    mQueryRaw.mockImplementation(async (
      query: unknown,
      ...taggedValues: unknown[]
    ) => {
      const { sql, values } = queryParts(query, taggedValues);
      if (sql.includes('FROM "questions"')) return [];
      if (sql.includes('FROM "question_sessions"')) return [{ id: "sess1" }];
      if (sql.includes('FROM "teacher_classes"')) return [];
      if (values.includes("t1")) return [{ id: "t1" }];
      return [{ id: "s1" }];
    });

    const res = await POST(req({ ids: ["log1"], decision: "APPROVE" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
    expect(mPointUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["log1"] }, status: "PENDING" },
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "역할",
      { id: "s1", role: "TEACHER", school: "우리학교", grade: "5", className: "1" },
    ],
    [
      "학급",
      { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "2" },
    ],
  ])("사전 확인 뒤 학생 %s이 바뀌면 잠금 뒤 다시 읽어 승인하지 않는다", async (_field, currentStudent) => {
    mCurrentStudents.mockResolvedValue([currentStudent]);
    mLogs.mockResolvedValue([
      { id: "log1", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_DEEP_QUESTION", student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
    ]);

    const res = await POST(req({ ids: ["log1"], decision: "APPROVE" }));

    expect(res.status).toBe(403);
    expect(mCurrentStudents).toHaveBeenCalledWith({
      where: { id: { in: ["s1"] } },
      select: { id: true, role: true, school: true, grade: true, className: true },
      orderBy: { id: "asc" },
    });
    expect(mPointUpdateMany).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("경고(FLAGGED) 행을 구제 승인하면 유형이 교사 보정으로 전환된다", async () => {
    mLogs.mockResolvedValue([
      { id: "log1", studentId: "s1", sessionId: "sess1", points: 0, bonusType: "AI_DUPLICATE_FLAGGED", relatedQuestionId: "q1", relatedCommentId: null, student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
    ]);
    await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: 3 }));
    const update = mPointUpdateMany.mock.calls[0][0];
    expect(update.data.bonusType).toBe("TEACHER_ADJUSTED");
    expect(update.data.points).toBe(3);
  });

  it("일반 보너스 행의 수정 승인은 유형을 바꾸지 않는다", async () => {
    mLogs.mockResolvedValue([
      { id: "log1", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_DEEP_QUESTION", relatedQuestionId: "q1", relatedCommentId: null, student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
    ]);
    await POST(req({ ids: ["log1"], decision: "APPROVE", overridePoints: 4 }));
    const update = mPointUpdateMany.mock.calls[0][0];
    expect(update.data.bonusType).toBeUndefined();
    expect(update.data.points).toBe(4);
  });

  it("학생 행을 잠근 뒤 같은 수업의 승인 합계를 다시 읽고 초과 승인을 건너뛴다", async () => {
    mLogs
      .mockResolvedValueOnce([
        { id: "log1", studentId: "s1", sessionId: "sess1", points: 5, bonusType: "AI_DEEP_QUESTION", relatedQuestionId: "q1", relatedCommentId: null, student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
      ])
      .mockResolvedValueOnce([
        { studentId: "s1", sessionId: "sess1", points: 12 },
      ]);

    const res = await POST(req({ ids: ["log1"], decision: "APPROVE" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
    expect(mQueryRaw).toHaveBeenCalledTimes(7);
    expect(mLogs).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ status: "APPROVED" }),
    }));
    expect(mQueryRaw.mock.invocationCallOrder[6]).toBeLessThan(mLogs.mock.invocationCallOrder[1]);
    expect(mPointUpdateMany).not.toHaveBeenCalled();
    expect(mUserUpdate).not.toHaveBeenCalled();
  });

  it("한 요청에서도 남은 상한 안의 행만 승인하고 실제 반영 수를 반환한다", async () => {
    mLogs
      .mockResolvedValueOnce([
        { id: "log1", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_TOPIC_FIT_QUESTION", relatedQuestionId: "q1", relatedCommentId: null, student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
        { id: "log2", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_APT_ANSWER", relatedQuestionId: null, relatedCommentId: "c1", student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
      ])
      .mockResolvedValueOnce([
        { studentId: "s1", sessionId: "sess1", points: 10 },
      ]);

    const res = await POST(req({ ids: ["log1", "log2"], decision: "APPROVE" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(mPointUpdateMany).toHaveBeenCalledTimes(1);
    expect(mPointUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "log1", status: "PENDING" },
    }));
    expect(mUserUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { totalPoints: { increment: 3 } },
    });
  });

  it("질문과 답변 근거부터 잠근 뒤 수업, 교사, 담당 학급, 학생 순서로 잠근다", async () => {
    mCurrentStudents.mockResolvedValue([
      { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" },
      { id: "s2", role: "STUDENT", school: "우리학교", grade: "5", className: "1" },
    ]);
    mLogs
      .mockResolvedValueOnce([
        { id: "log2", studentId: "s2", sessionId: "sess1", points: 3, bonusType: "AI_DEEP_QUESTION", relatedQuestionId: "q2", relatedCommentId: null, student: { id: "s2", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
        { id: "log1", studentId: "s1", sessionId: "sess1", points: 3, bonusType: "AI_APT_ANSWER", relatedQuestionId: null, relatedCommentId: "c1", student: { id: "s1", role: "STUDENT", school: "우리학교", grade: "5", className: "1" } },
      ])
      .mockResolvedValueOnce([]);

    const res = await POST(req({ ids: ["log2", "log1"], decision: "APPROVE" }));
    const queries = mQueryRaw.mock.calls.map((call) =>
      queryParts(call[0], call.slice(1))
    );

    expect(res.status).toBe(200);
    expect(queries).toHaveLength(9);
    expect(queries[0].sql).toContain('FROM "questions"');
    expect(queries[0].sql).toContain('ORDER BY "id"');
    expect(queries[0].values).toEqual(["q1", "q2"]);
    expect(queries[1].sql).toContain('FROM "comments"');
    expect(queries[1].values).toEqual(["c1"]);
    expect(queries[2].sql).toContain('FROM "question_sessions"');
    expect(queries[2].values).toEqual(["sess1"]);
    expect(queries.slice(3, 6).map((query) => query.values[0])).toEqual([
      "point-user-transaction:s1",
      "point-user-transaction:s2",
      "point-user-transaction:t1",
    ]);
    queries.slice(3, 6).forEach((query) => {
      expect(query.sql).toContain("pg_advisory_xact_lock");
    });
    expect(queries[6].sql).toContain('FROM "users"');
    expect(queries[6].values).toEqual(["t1"]);
    expect(queries[7].sql).toContain('FROM "teacher_classes"');
    expect(queries[7].sql).toContain('ORDER BY "id"');
    expect(queries[7].values).toEqual(["t1"]);
    expect(queries[8].sql).toContain('FROM "users"');
    expect(queries[8].sql).toContain('ORDER BY "id"');
    expect(queries[8].values).toEqual(["s1", "s2"]);
    expect(mQueryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      mSessions.mock.invocationCallOrder[1],
    );
    expect(mSessions.mock.invocationCallOrder[1]).toBeLessThan(
      mQueryRaw.mock.invocationCallOrder[6],
    );
    expect(mQueryRaw.mock.invocationCallOrder[7]).toBeLessThan(
      mUser.mock.invocationCallOrder[1],
    );
    expect(mUser.mock.invocationCallOrder[1]).toBeLessThan(
      mQueryRaw.mock.invocationCallOrder[8],
    );
  });
});
