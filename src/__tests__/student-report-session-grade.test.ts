import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
    questionLike: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    sessionAnalysis: { findMany: vi.fn() },
    questionGrowth: { findMany: vi.fn() },
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
  it("출력 자료는 해당 학생의 성장 기록을 수업에 연결하고 백 개 이후 기록도 보존한다", async () => {
    const records = Array.from({ length: 105 }, (_, i) => ({ questionId: `q${i}`, originalContent: "소금이 녹을까?", revisedContent: "온도에 따라 다를까?", changeNote: `돌아보기 ${i}`, reflection: "", revision: 1, updatedAt: new Date(), question: { sessionId: "session-1" } }));
    vi.mocked(prisma.questionGrowth.findMany).mockResolvedValue(records as never);
    const report = await buildStudentReport("student-kim", { includeGrowth: true });
    expect(report?.sessions[0].growthRecords).toHaveLength(105);
    expect(report?.sessions[0].growthRecords?.[104].changeNote).toBe("돌아보기 104");
    expect(prisma.questionGrowth.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { question: { authorId: "student-kim", source: "STUDENT", sessionId: { in: ["session-1"] } }, OR: [{ changeNote: { not: "" } }, { reflection: { not: "" } }] } }));
  });
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
