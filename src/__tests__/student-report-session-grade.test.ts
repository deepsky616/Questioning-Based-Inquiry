import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
    questionLike: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    sessionAnalysis: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { buildStudentReport } from "@/lib/student-report";

const mockStudent = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockQuestions = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockLikes = prisma.questionLike.findMany as ReturnType<typeof vi.fn>;
const mockComments = prisma.comment.findMany as ReturnType<typeof vi.fn>;
const mockSessions = prisma.questionSession.findMany as ReturnType<typeof vi.fn>;
const mockAnalyses = prisma.sessionAnalysis.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockStudent.mockResolvedValue({
    id: "student-kim",
    name: "김질문",
    role: "STUDENT",
    grade: "4",
    className: "1",
    studentNumber: "1",
    school: "질문초등학교",
  });
  mockQuestions.mockResolvedValue([]);
  mockLikes.mockResolvedValue([]);
  mockComments.mockResolvedValue([]);
  mockSessions.mockResolvedValue([
    {
      id: "session-1",
      date: "2026-07-28",
      subject: "수학",
      topic: "6. 평면도형의 둘레와 넓이",
    },
  ]);
  mockAnalyses.mockResolvedValue([
    {
      sessionId: "session-1",
      result: { summary: "평면도형 수업에 적극적으로 참여했어요." },
    },
  ]);
});

describe("학생 상세리포트 질문수업 학년", () => {
  it("질문수업별 분석 자료에 학생의 학년을 포함한다", async () => {
    const report = await buildStudentReport("student-kim");

    expect(report?.student).toEqual(
      expect.objectContaining({ name: "김질문", grade: "4" }),
    );
    expect(report?.sessions).toEqual([
      expect.objectContaining({
        id: "session-1",
        grade: "4",
        analysis: expect.objectContaining({
          summary: "평면도형 수업에 적극적으로 참여했어요.",
        }),
      }),
    ]);
  });
});
