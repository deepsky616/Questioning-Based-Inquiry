import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    teacherClass: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    question: { findMany: vi.fn() },
    questionLike: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    sessionAnalysis: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/question-game-history-service", () => ({
  loadQuestionGameClassSummary: vi.fn(),
}));

import { GET } from "@/app/api/reports/class/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadQuestionGameClassSummary } from "@/lib/question-game-history-service";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockStudents = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockStudentCount = prisma.user.count as ReturnType<typeof vi.fn>;
const mockClassGroups = prisma.user.groupBy as ReturnType<typeof vi.fn>;
const mockTeacherClasses = prisma.teacherClass.findMany as ReturnType<typeof vi.fn>;
const mockOwnedClass = prisma.teacherClass.findFirst as ReturnType<typeof vi.fn>;
const mockQuestions = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockLikes = prisma.questionLike.findMany as ReturnType<typeof vi.fn>;
const mockComments = prisma.comment.findMany as ReturnType<typeof vi.fn>;
const mockSessions = prisma.questionSession.findMany as ReturnType<typeof vi.fn>;
const mockAnalyses = prisma.sessionAnalysis.findMany as ReturnType<typeof vi.fn>;
const mockGameSummary = loadQuestionGameClassSummary as ReturnType<typeof vi.fn>;

type TeacherRecord = {
  role: "TEACHER";
  school: string | null;
  teacherClasses: Array<{ grade: string; className: string }>;
};

let teacherRecord: TeacherRecord | null;

const classReportRequest = (grade = "5", className = "1") =>
  new NextRequest(
    `http://localhost/api/reports/class?grade=${grade}&className=${className}`,
  );

function expectNoStudentOrAggregateReads() {
  expect(mockStudents).not.toHaveBeenCalled();
  expect(mockQuestions).not.toHaveBeenCalled();
  expect(mockLikes).not.toHaveBeenCalled();
  expect(mockComments).not.toHaveBeenCalled();
  expect(mockSessions).not.toHaveBeenCalled();
  expect(mockAnalyses).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: {
      id: "teacher-1",
      role: "TEACHER",
      school: "한빛초",
      grade: null,
      className: null,
    },
  });
  teacherRecord = {
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  };
  mockTeacher.mockImplementation(async () => teacherRecord);
  mockTeacherClasses.mockResolvedValue([{ grade: "5", className: "1" }]);
  mockOwnedClass.mockResolvedValue({ id: "class-1" });
  mockStudentCount.mockResolvedValue(1);
  mockClassGroups.mockResolvedValue([]);
  mockStudents.mockResolvedValue([
    { id: "student-1", name: "학생", studentNumber: "1" },
  ]);
  mockQuestions.mockResolvedValue([]);
  mockLikes.mockResolvedValue([]);
  mockComments.mockResolvedValue([]);
  mockSessions.mockResolvedValue([]);
  mockAnalyses.mockResolvedValue([]);
  mockGameSummary.mockResolvedValue({
    totals: { plays: 0, points: 0, goodQuestions: 0 },
    modes: {
      solo: { plays: 0, points: 0, goodQuestions: 0 },
      ai: { plays: 0, points: 0, goodQuestions: 0 },
      friend: { plays: 0, points: 0, goodQuestions: 0 },
    },
    recent: [],
  });
});

describe("학급 보고서 접근 경계", () => {
  it("담당 밖 학급은 학생 조회 전에 403으로 거부한다", async () => {
    mockOwnedClass.mockResolvedValue(null);

    const response = await GET(classReportRequest("6", "2"));

    expect(response.status).toBe(403);
    expectNoStudentOrAggregateReads();
  });

  it("학교가 없는 교사는 학생 조회 전에 403으로 거부한다", async () => {
    teacherRecord = {
      role: "TEACHER",
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    };

    const response = await GET(classReportRequest());

    expect(response.status).toBe(403);
    expectNoStudentOrAggregateReads();
  });

  it("담당 학급이 없으면 같은 학교 학생의 학년 반 목록과 학생 수를 반환한다", async () => {
    teacherRecord = { role: "TEACHER", school: "한빛초", teacherClasses: [] };
    mockClassGroups.mockResolvedValue([
      { grade: "6", className: "2", _count: { _all: 2 } },
      { grade: "5", className: "1", _count: { _all: 3 } },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/reports/class"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockClassGroups).toHaveBeenCalledWith({
      by: ["grade", "className"],
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: { not: null },
        className: { not: null },
      },
      _count: { _all: true },
    });
    expect(body).toEqual({
      scope: "class-list",
      classes: [
        { grade: "5", className: "1", studentCount: 3 },
        { grade: "6", className: "2", studentCount: 2 },
      ],
    });
    expect(mockStudentCount).not.toHaveBeenCalled();
  });

  it("같은 학교 담당 학급은 학교 조건으로 학생을 조회한다", async () => {
    const response = await GET(classReportRequest());

    expect(response.status).toBe(200);
    expect(mockStudents).toHaveBeenCalledWith({
      where: {
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
      },
      select: { id: true, name: true, studentNumber: true },
    });
    expect(mockGameSummary).not.toHaveBeenCalled();
  });

  it("다른 교사 질문수업의 전체 분석은 학급 보고서에 붙이지 않는다", async () => {
    mockSessions.mockResolvedValue([
      { id: "session-owned", teacherId: "teacher-1", date: "2026-07-14", subject: "과학", topic: "물질" },
      { id: "session-other", teacherId: "teacher-2", date: "2026-07-13", subject: "수학", topic: "도형" },
    ]);
    mockAnalyses.mockResolvedValue([
      { sessionId: "session-owned", result: { summary: "내 수업 분석" } },
    ]);

    const response = await GET(classReportRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockAnalyses).toHaveBeenCalledWith({
      where: {
        sessionId: { in: ["session-owned"] },
        scope: "class",
        studentId: "",
      },
      select: { sessionId: true, result: true },
    });
    expect(body.sessions).toEqual([
      expect.objectContaining({
        id: "session-owned",
        grade: "5",
        analysis: { summary: "내 수업 분석" },
      }),
      expect.objectContaining({
        id: "session-other",
        grade: "5",
        analysis: null,
      }),
    ]);
  });
});
