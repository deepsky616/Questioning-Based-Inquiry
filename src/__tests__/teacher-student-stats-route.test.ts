import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    pointLog: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/teacher/students/[id]/stats/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mQuestionFind = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mCommentFind = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const mPointFind = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;
const mPointCount = prisma.pointLog.count as unknown as ReturnType<typeof vi.fn>;

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
    if (args.where.status === "APPROVED") return [approvedPoint];
    return [approvedPoint, pendingPoint];
  });
  mPointCount.mockResolvedValue(0);
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

  it("질문놀이 참여는 승인된 일반·상한 친구 방과 혼자·도움 실행을 한 판씩 센다", async () => {
    mPointCount.mockResolvedValue(4);

    const response = await GET(
      new NextRequest("http://localhost/api/teacher/students/student-1/stats"),
      { params: Promise.resolve({ id: "student-1" }) },
    );
    const body = await response.json();

    expect(body.student.gamePlays).toBe(4);
    expect(mPointCount).toHaveBeenCalledWith({
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
    });
  });
});
