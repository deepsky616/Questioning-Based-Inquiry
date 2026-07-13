import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    question: { groupBy: vi.fn(), findMany: vi.fn() },
    comment: { groupBy: vi.fn() },
    questionSession: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/teacher/students/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockStudents = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockQuestionGroups = prisma.question.groupBy as ReturnType<typeof vi.fn>;
const mockQuestionRows = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockCommentGroups = prisma.comment.groupBy as ReturnType<typeof vi.fn>;
const mockSessions = prisma.questionSession.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockTeacher.mockResolvedValue({
    school: "테스트초",
    teacherClasses: [{ grade: "4", className: "1" }],
  });
  mockStudents.mockResolvedValue([
    {
      id: "student-1",
      name: "가학생",
      grade: "4",
      className: "1",
      studentNumber: "2",
      school: "테스트초",
      totalPoints: 12,
      _count: { questions: 3, comments: 2, pointLogs: 4 },
    },
  ]);
  mockQuestionGroups.mockResolvedValue([]);
  mockCommentGroups.mockResolvedValue([]);
  mockSessions.mockResolvedValue([]);
});

describe("교사 학생 자료 분리 조회", () => {
  it("보기 값이 없으면 이전 통합 응답 형식을 유지한다", async () => {
    mockSessions.mockResolvedValue([{
      id: "session-1",
      date: "2026-07-13",
      targetType: "ALL",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: null,
      targetStudentIds: [],
    }]);
    mockQuestionGroups
      .mockResolvedValueOnce([{
        authorId: "student-1",
        _max: { createdAt: new Date("2026-07-13T01:00:00Z") },
      }])
      .mockResolvedValueOnce([{
        authorId: "student-1",
        sessionId: "session-1",
      }]);

    const response = await GET(
      new Request("http://localhost/api/teacher/students?today=2026-07-13"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      students: [{
        id: "student-1",
        name: "가학생",
        grade: "4",
        className: "1",
        studentNumber: "2",
        school: "테스트초",
        questionCount: 3,
        commentCount: 2,
        pointLogCount: 4,
        totalPoints: 12,
        lastActivityAt: "2026-07-13T01:00:00.000Z",
        sessionProgress: {
          total: 1,
          completed: 1,
          remaining: 0,
          percent: 100,
          actionableRemaining: 0,
        },
      }],
      teacherClasses: [{ grade: "4", className: "1" }],
    });
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        name: true,
        grade: true,
        className: true,
        studentNumber: true,
        school: true,
        totalPoints: true,
        _count: {
          select: { questions: true, comments: true, pointLogs: true },
        },
      },
    }));
  });

  it("명단 보기는 학생 기본 정보만 읽고 활동 집계를 건드리지 않는다", async () => {
    const response = await GET(
      new Request("http://localhost/api/teacher/students?view=directory"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      students: [{
        id: "student-1",
        name: "가학생",
        grade: "4",
        className: "1",
        studentNumber: "2",
      }],
      teacherClasses: [{ grade: "4", className: "1" }],
    });
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        name: true,
        grade: true,
        className: true,
        studentNumber: true,
      },
    }));
    expect(mockQuestionGroups).not.toHaveBeenCalled();
    expect(mockCommentGroups).not.toHaveBeenCalled();
    expect(mockSessions).not.toHaveBeenCalled();
  });

  it("활동 보기는 완료 질문을 학생과 수업으로 묶고 수업 대상은 한 번만 정규화한다", async () => {
    let targetReads = 0;
    const targetedSession = {
      id: "session-1",
      date: "2026-07-13",
      targetType: "CUSTOM",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: null,
      get targetStudentIds() {
        targetReads += 1;
        return ["student-1"];
      },
    };
    mockSessions.mockResolvedValue([targetedSession]);
    mockQuestionGroups
      .mockResolvedValueOnce([{ authorId: "student-1", _max: { createdAt: new Date("2026-07-13T01:00:00Z") } }])
      .mockResolvedValueOnce([{ authorId: "student-1", sessionId: "session-1" }]);

    const response = await GET(
      new Request("http://localhost/api/teacher/students?view=activity&today=2026-07-13"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      activity: [{
        studentId: "student-1",
        questionCount: 3,
        commentCount: 2,
        totalPoints: 12,
        lastActivityAt: "2026-07-13T01:00:00.000Z",
        sessionProgress: {
          total: 1,
          completed: 1,
          remaining: 0,
          percent: 100,
          actionableRemaining: 0,
        },
      }],
    });
    expect(mockQuestionGroups).toHaveBeenCalledWith(expect.objectContaining({
      by: ["authorId", "sessionId"],
      where: {
        authorId: { in: ["student-1"] },
        sessionId: { not: null },
        source: { not: "TEACHER_SHARED" },
      },
    }));
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        grade: true,
        className: true,
        studentNumber: true,
        totalPoints: true,
        _count: { select: { questions: true, comments: true } },
      },
    }));
    expect(mockQuestionRows).not.toHaveBeenCalled();
    expect(targetReads).toBe(1);
  });
});
