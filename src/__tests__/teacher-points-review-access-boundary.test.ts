import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    questionSession: { findMany: vi.fn() },
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET as getPendingPoints } from "@/app/api/teacher/points/pending/route";
import { POST as decidePoints } from "@/app/api/teacher/points/decide/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mSessions = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mCurrentStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mUserUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const mPointUpdateMany = prisma.pointLog.updateMany as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const mApprovedLogs = vi.fn();

const decideRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/teacher/points/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const student = {
  id: "student-1",
  role: "STUDENT",
  school: "우리학교",
  grade: "5",
  className: "1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mSessions.mockReset();
  mUser.mockReset();
  mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mSessions.mockResolvedValue([]);
  mLogs.mockResolvedValue([]);
  mUser.mockResolvedValue({
    role: "TEACHER",
    school: "우리학교",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mTx.mockImplementation(async (callback: unknown) => {
    const run = callback as (tx: {
      $queryRaw: typeof mQueryRaw;
      questionSession: { findMany: typeof mSessions };
      pointLog: {
        findMany: typeof mApprovedLogs;
        updateMany: typeof mPointUpdateMany;
      };
      user: {
        findUnique: typeof mUser;
        findMany: typeof mCurrentStudents;
        update: typeof mUserUpdate;
      };
    }) => Promise<unknown>;
    return run({
      $queryRaw: mQueryRaw,
      questionSession: { findMany: mSessions },
      pointLog: {
        findMany: mApprovedLogs,
        updateMany: mPointUpdateMany,
      },
      user: {
        findUnique: mUser,
        findMany: mCurrentStudents,
        update: mUserUpdate,
      },
    });
  });
  mUserUpdate.mockResolvedValue({ id: "student-1" });
  mCurrentStudents.mockResolvedValue([student]);
  mPointUpdateMany.mockResolvedValue({ count: 1 });
  mQueryRaw.mockImplementation(async (query: { sql?: string; strings?: readonly string[] }) => {
    const sql = query.sql ?? query.strings?.join("?") ?? "";
    if (sql.includes('FROM "questions"')) {
      return [{
        id: "question-1",
        authorId: "student-1",
        sessionId: "owned-session",
        source: "STUDENT",
      }];
    }
    if (sql.includes('FROM "comments"')) return [];
    if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "ok" }];
    return [{ id: "student-1" }];
  });
  mApprovedLogs.mockResolvedValue([]);
  (prisma.question.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("교사 포인트 검토 권한 경계", () => {
  it("직접 지정한 세션도 로그인 교사의 소유 세션 집합으로 로그를 제한한다", async () => {
    const req = new NextRequest(
      "http://localhost/api/teacher/points/pending?sessionId=other-session",
    );

    const res = await getPendingPoints(req);

    expect(res.status).toBe(200);
    expect(mSessions).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1", id: "other-session" },
      select: { id: true },
    });
    expect(mLogs).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          status: "PENDING",
          sessionId: { in: [] },
          student: {
            role: "STUDENT",
            school: "우리학교",
            OR: [{ grade: "5", className: "1" }],
          },
        },
      }),
    );
  });

  it("세션 없는 다른 담당 학급 학생의 로그는 승인하지 않는다", async () => {
    mLogs.mockResolvedValue([
      {
        id: "log-1",
        studentId: "student-1",
        sessionId: null,
        points: 3,
        bonusType: "AI_DEEP_QUESTION",
        student: { ...student, className: "2" },
      },
    ]);

    const res = await decidePoints(
      decideRequest({ ids: ["log-1"], decision: "APPROVE" }),
    );

    expect(res.status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("담당 학급 학생이어도 세션과 원문 근거가 없는 로그는 승인하지 않는다", async () => {
    mLogs.mockResolvedValue([
      {
        id: "log-1",
        studentId: "student-1",
        sessionId: null,
        points: 3,
        bonusType: "AI_DEEP_QUESTION",
        student,
      },
    ]);

    const res = await decidePoints(
      decideRequest({ ids: ["log-1"], decision: "APPROVE" }),
    );

    expect(res.status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("세션이 있는 로그는 로그인 교사 소유 세션만 승인한다", async () => {
    mLogs.mockResolvedValue([
      {
        id: "log-1",
        studentId: "student-1",
        sessionId: "other-session",
        points: 3,
        bonusType: "AI_DEEP_QUESTION",
        student,
      },
    ]);

    const res = await decidePoints(
      decideRequest({ ids: ["log-1"], decision: "APPROVE" }),
    );

    expect(res.status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("소유 세션 로그여도 현재 담당 학생이 아니면 승인하지 않는다", async () => {
    mLogs.mockResolvedValue([
      {
        id: "log-1",
        studentId: "student-1",
        sessionId: "owned-session",
        points: 3,
        bonusType: "AI_DEEP_QUESTION",
        student: { ...student, school: "다른학교" },
      },
    ]);
    mSessions.mockResolvedValue([{ id: "owned-session" }]);

    const res = await decidePoints(
      decideRequest({ ids: ["log-1"], decision: "APPROVE" }),
    );

    expect(res.status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("사전 확인 뒤 담당 학급이 바뀌면 거래 안에서 다시 확인해 거부 상태도 쓰지 않는다", async () => {
    mLogs.mockResolvedValue([
      {
        id: "log-1",
        studentId: "student-1",
        sessionId: "owned-session",
        points: 3,
        bonusType: "AI_DEEP_QUESTION",
        relatedQuestionId: "question-1",
        relatedCommentId: null,
        student,
      },
    ]);
    mSessions.mockResolvedValue([{ id: "owned-session" }]);
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

    const res = await decidePoints(
      decideRequest({ ids: ["log-1"], decision: "REJECT" }),
    );

    expect(res.status).toBe(403);
    expect(mTx).toHaveBeenCalledTimes(1);
    expect(mPointUpdateMany).not.toHaveBeenCalled();
  });

  it("다른 요청이 먼저 승인한 대기 로그는 학생 총점에 다시 더하지 않는다", async () => {
    mLogs.mockResolvedValue([
      {
        id: "log-1",
        studentId: "student-1",
        sessionId: "owned-session",
        points: 3,
        bonusType: "AI_DEEP_QUESTION",
        relatedQuestionId: "question-1",
        relatedCommentId: null,
        student,
      },
    ]);
    mSessions.mockResolvedValue([{ id: "owned-session" }]);
    mPointUpdateMany.mockResolvedValue({ count: 0 });
    mTx.mockImplementation(async (callback: unknown) => {
      if (typeof callback !== "function") return [];
      const run = callback as (tx: {
        $queryRaw: typeof mQueryRaw;
        questionSession: { findMany: typeof mSessions };
        pointLog: { findMany: typeof mApprovedLogs; updateMany: typeof mPointUpdateMany };
        user: {
          findUnique: typeof mUser;
          findMany: typeof mCurrentStudents;
          update: typeof mUserUpdate;
        };
      }) => Promise<unknown>;
      return run({
        $queryRaw: mQueryRaw,
        questionSession: { findMany: mSessions },
        pointLog: { findMany: mApprovedLogs, updateMany: mPointUpdateMany },
        user: {
          findUnique: mUser,
          findMany: mCurrentStudents,
          update: mUserUpdate,
        },
      });
    });

    const res = await decidePoints(
      decideRequest({ ids: ["log-1"], decision: "APPROVE" }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);
    expect(mUserUpdate).not.toHaveBeenCalled();
  });
});
