import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/question-game-history-service", () => ({
  loadQuestionGameLearningHistory: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    pointLog: { findMany: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/teacher/students/[id]/stats/route";
import { loadQuestionGameLearningHistory } from "@/lib/question-game-history-service";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mQuestionFind = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mCommentFind = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const mPointFind = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mGameHistory = loadQuestionGameLearningHistory as unknown as ReturnType<typeof vi.fn>;

const approvedPoint = {
  id: "approved-1",
  createdAt: new Date("2026-07-17T00:00:00.000Z"),
  points: 3,
  gameId: "PRACTICE",
  bonusType: "PRACTICE_CREATE",
  reason: "승인 포인트",
};
const pendingPoint = {
  id: "pending-1",
  createdAt: new Date("2026-07-17T01:00:00.000Z"),
  points: 5,
  gameId: "ACTIVITY_AI",
  bonusType: "AI_EFFORT",
  reason: "검토 대기 포인트",
};

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mUserFind.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === "teacher-1") {
      return {
        role: "TEACHER",
        school: "한빛초",
        teacherClasses: [{ grade: "5", className: "1" }],
      };
    }
    return {
      id: "student-1",
      name: "학생",
      grade: "5",
      className: "1",
      studentNumber: "2",
      school: "한빛초",
      totalPoints: 3,
      role: "STUDENT",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  });
  mQuestionFind.mockResolvedValue([]);
  mCommentFind.mockResolvedValue([]);
  mPointFind.mockImplementation(async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
    if ("relatedQuestionId" in args.where) return [];
    if ("OR" in args.where) return [];
    if (args.where.status === "APPROVED") return [approvedPoint];
    return [approvedPoint, pendingPoint];
  });
  mGameHistory.mockResolvedValue({
    totals: { plays: 0, points: 0, goodQuestions: 0 },
    modes: {
      solo: { plays: 0, points: 0, goodQuestions: 0 },
      ai: { plays: 0, points: 0, goodQuestions: 0 },
      friend: { plays: 0, points: 0, goodQuestions: 0 },
    },
    recent: [],
  });
});

describe("교사 학생 상세 포인트", () => {
  it("로그인 후 교사 역할이 회수되면 학생 통계를 거부한다", async () => {
    mUserFind.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "teacher-1") {
        return {
          role: "STUDENT",
          school: "한빛초",
          teacherClasses: [{ grade: "5", className: "1" }],
        };
      }
      return {
        id: "student-1",
        name: "학생",
        grade: "5",
        className: "1",
        studentNumber: "2",
        school: "한빛초",
        totalPoints: 3,
        role: "STUDENT",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    });

    const response = await GET(
      new NextRequest("http://localhost/api/teacher/students/student-1/stats"),
      { params: Promise.resolve({ id: "student-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mQuestionFind).not.toHaveBeenCalled();
    expect(mCommentFind).not.toHaveBeenCalled();
    expect(mPointFind).not.toHaveBeenCalled();
  });

  it("받은 포인트 사건과 최근 포인트에는 승인된 장부만 포함한다", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/teacher/students/student-1/stats"),
      { params: Promise.resolve({ id: "student-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.events).toEqual([{
      type: "point",
      createdAt: approvedPoint.createdAt.toISOString(),
      weight: 3,
    }]);
    expect(body.recentPoints.map((point: { id: string }) => point.id)).toEqual(["approved-1"]);
    expect(mPointFind).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { studentId: "student-1", status: "APPROVED" },
    }));
  });

  it("좋은 질문은 승인된 양수 질문 보너스와 교사 조정의 서로 다른 질문만 센다", async () => {
    mPointFind.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("relatedQuestionId" in args.where) {
        return [
          { relatedQuestionId: "question-1" },
          { relatedQuestionId: "question-1" },
          { relatedQuestionId: "question-2" },
        ];
      }
      return [approvedPoint];
    });

    const response = await GET(
      new NextRequest("http://localhost/api/teacher/students/student-1/stats"),
      { params: Promise.resolve({ id: "student-1" }) },
    );
    const body = await response.json();

    expect(body.student.goodQuestions).toBe(2);
    expect(mPointFind).toHaveBeenNthCalledWith(2, {
      where: {
        studentId: "student-1",
        status: "APPROVED",
        points: { gt: 0 },
        bonusType: {
          in: ["AI_TOPIC_FIT_QUESTION", "AI_DEEP_QUESTION", "TEACHER_ADJUSTED"],
        },
        relatedQuestionId: { not: null },
      },
      select: { relatedQuestionId: true },
    });
  });

  it("같은 친구 방의 참여와 상한 표지는 한 판으로 묶고 이전 상한 기록과 혼자·도움 실행도 한 판씩 센다", async () => {
    mPointFind.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ("relatedQuestionId" in args.where) return [];
      if ("OR" in args.where) {
        return [
          { id: "friend-base", bonusType: "PARTICIPATION", gameId: "relay", roomCode: "room:1234:1", gameRunId: null },
          { id: "friend-cap", bonusType: "FRIEND_DAILY_LIMIT", gameId: "relay", roomCode: "room:1234:1", gameRunId: null },
          { id: "legacy-cap", bonusType: "FRIEND_DAILY_LIMIT", gameId: "dice", roomCode: "room:5678:1", gameRunId: null },
          { id: "solo-base", bonusType: "ACTIVITY_SOLO_relay", gameId: "ACTIVITY_SOLO", roomCode: null, gameRunId: "solo-run" },
          { id: "solo-extra", bonusType: "ACTIVITY_SOLO_RELAY_EXTRA", gameId: "ACTIVITY_SOLO", roomCode: null, gameRunId: "solo-run" },
          { id: "ai-base", bonusType: "ACTIVITY_AI_relay", gameId: "ACTIVITY_AI", roomCode: null, gameRunId: "ai-run" },
        ];
      }
      return [approvedPoint];
    });

    const response = await GET(
      new NextRequest("http://localhost/api/teacher/students/student-1/stats"),
      { params: Promise.resolve({ id: "student-1" }) },
    );
    const body = await response.json();

    expect(body.student.gamePlays).toBe(4);
    expect(body.questionGames.totals.plays).toBe(0);
    expect(mGameHistory).toHaveBeenCalledWith("student-1");
    expect(mPointFind).toHaveBeenNthCalledWith(3, {
      where: {
        studentId: "student-1",
        status: "APPROVED",
        OR: [
          { bonusType: "PARTICIPATION" },
          { bonusType: "FRIEND_DAILY_LIMIT" },
          { gameId: "ACTIVITY_SOLO" },
          { gameId: "ACTIVITY_AI" },
        ],
      },
      select: {
        id: true,
        bonusType: true,
        gameId: true,
        roomCode: true,
        gameRunId: true,
      },
    });
  });
});
