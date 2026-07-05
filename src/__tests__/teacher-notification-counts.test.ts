import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    question: { count: vi.fn() },
    comment: { count: vi.fn() },
    questionSession: { findMany: vi.fn() },
    pointLog: { count: vi.fn() },
  },
}));

import { GET as getFlaggedCount } from "@/app/api/teacher/flagged-count/route";
import { GET as getPendingPointCount } from "@/app/api/teacher/points/pending-count/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const questionCount = prisma.question.count as unknown as ReturnType<typeof vi.fn>;
const commentCount = prisma.comment.count as unknown as ReturnType<typeof vi.fn>;
const sessionFindMany = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const pointLogCount = prisma.pointLog.count as unknown as ReturnType<typeof vi.fn>;

const teacherSession = { user: { id: "teacher-1", role: "TEACHER" } };

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue(teacherSession);
  userFindUnique.mockResolvedValue({
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  userFindMany.mockResolvedValue([{ id: "student-1" }, { id: "student-2" }]);
  questionCount.mockResolvedValue(2);
  commentCount.mockResolvedValue(3);
  sessionFindMany.mockResolvedValue([{ id: "session-1" }, { id: "session-2" }]);
  pointLogCount.mockResolvedValue(4);
});

describe("교사 상단 알림 카운트 API", () => {
  it("로그인이 없으면 부적절 의심 카운트를 조회할 수 없다", async () => {
    mAuth.mockResolvedValue(null);

    const res = await getFlaggedCount();

    expect(res.status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("부적절 의심 카운트는 교사의 학교와 담당 학급 학생만 대상으로 센다", async () => {
    const res = await getFlaggedCount();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ total: 5, questions: 2, comments: 3 });
    expect(userFindMany).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        OR: [{ grade: "5", className: "1" }],
      },
      select: { id: true },
    });
    expect(questionCount).toHaveBeenCalledWith({
      where: { flagged: true, authorId: { in: ["student-1", "student-2"] } },
    });
    expect(commentCount).toHaveBeenCalledWith({
      where: { flagged: true, authorId: { in: ["student-1", "student-2"] } },
    });
  });

  it("교사 학교 정보가 없으면 부적절 의심 알림을 0으로 반환한다", async () => {
    userFindUnique.mockResolvedValue({
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });

    const res = await getFlaggedCount();
    const body = await res.json();

    expect(body).toEqual({ total: 0, questions: 0, comments: 0 });
    expect(userFindMany).not.toHaveBeenCalled();
    expect(questionCount).not.toHaveBeenCalled();
    expect(commentCount).not.toHaveBeenCalled();
  });

  it("AI 추천 포인트 대기 카운트는 교사의 수업세션 안의 PENDING만 센다", async () => {
    const res = await getPendingPointCount();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 4 });
    expect(sessionFindMany).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1" },
      select: { id: true },
    });
    expect(pointLogCount).toHaveBeenCalledWith({
      where: { status: "PENDING", sessionId: { in: ["session-1", "session-2"] } },
    });
  });

  it("교사의 수업세션이 없으면 AI 추천 포인트 대기 카운트를 0으로 반환한다", async () => {
    sessionFindMany.mockResolvedValue([]);

    const res = await getPendingPointCount();
    const body = await res.json();

    expect(body).toEqual({ count: 0 });
    expect(pointLogCount).not.toHaveBeenCalled();
  });
});
