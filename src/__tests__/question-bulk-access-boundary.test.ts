import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));
vi.mock("@/lib/ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    question: { findUnique: vi.fn(), findMany: vi.fn() },
    comment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST as createBulkComments } from "@/app/api/questions/bulk-comments/route";
import { POST as createBulkAiAnswers } from "@/app/api/questions/bulk-ai-answers/route";
import { auth } from "@/lib/auth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuestionFind = prisma.question.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuestionFindMany = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCommentCreate = prisma.comment.create as unknown as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mockResolveAiConfig = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const mockGenerateText = generateText as unknown as ReturnType<typeof vi.fn>;

const teacher = {
  id: "teacher-1",
  role: "TEACHER",
  school: "한빛초",
  teacherClasses: [{ grade: "5", className: "1" }],
};

const assignedQuestion = {
  id: "question-assigned",
  content: "담당 학급 질문",
  context: null,
  closure: "open",
  cognitive: "conceptual",
  authorId: "student-assigned",
  author: {
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  },
};

const outsideQuestion = {
  ...assignedQuestion,
  id: "question-outside",
  content: "담당 밖 질문",
  authorId: "student-outside",
  author: {
    role: "STUDENT",
    school: "새봄초",
    grade: "6",
    className: "2",
  },
};

const questions = new Map([
  [assignedQuestion.id, assignedQuestion],
  [outsideQuestion.id, outsideQuestion],
]);

function containsTeacherScope(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsTeacherScope);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.role === "STUDENT" && record.school === teacher.school) return true;
  return Object.values(record).some(containsTeacherScope);
}

function requestedIds(where: unknown): string[] {
  if (!where || typeof where !== "object") return [];
  const id = (where as { id?: { in?: unknown } }).id;
  return Array.isArray(id?.in)
    ? id.in.filter((item): item is string => typeof item === "string")
    : [];
}

const jsonRequest = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: teacher });
  mockUserFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === teacher.id ? teacher : null,
  );
  mockQuestionFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    questions.get(where.id) ?? null,
  );
  mockQuestionFindMany.mockImplementation(async ({ where }: { where: unknown }) => {
    const rows = requestedIds(where)
      .map((id) => questions.get(id))
      .filter((question): question is typeof assignedQuestion => Boolean(question));
    return containsTeacherScope(where)
      ? rows.filter((question) => question.id === assignedQuestion.id)
      : rows;
  });
  mockCommentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `comment-${String(data.questionId)}`,
    ...data,
  }));
  mockTransaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
    Promise.all(operations),
  );
  mockResolveAiConfig.mockResolvedValue({ apiKey: "test-key", model: "test-model" });
  mockGenerateText.mockResolvedValue("생성된 답변");
});

describe("질문 묶음 경로 접근 경계", () => {
  it("교사는 담당 밖 질문에 묶음 댓글을 읽거나 쓸 수 없다", async () => {
    await createBulkComments(jsonRequest("/api/questions/bulk-comments", {
      questionIds: [outsideQuestion.id],
      content: "교사 피드백",
    }));

    expect(mockCommentCreate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("교사는 담당 밖 질문으로 묶음 인공지능 답변을 읽거나 만들 수 없다", async () => {
    await createBulkAiAnswers(jsonRequest("/api/questions/bulk-ai-answers", {
      questionIds: [outsideQuestion.id],
    }));

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockCommentCreate).not.toHaveBeenCalled();
    const readOutsideContentWithoutScope = mockQuestionFindMany.mock.calls.some(
      ([query]) =>
        requestedIds(query?.where).includes(outsideQuestion.id) &&
        Boolean(query?.select?.content) &&
        !containsTeacherScope(query?.where),
    );
    expect(readOutsideContentWithoutScope).toBe(false);
  });

  it("교사는 담당 질문 한 건에 묶음 댓글을 계속 쓸 수 있다", async () => {
    const response = await createBulkComments(jsonRequest("/api/questions/bulk-comments", {
      questionIds: [assignedQuestion.id],
      content: "교사 피드백",
    }));

    expect(response.status).toBe(200);
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: {
        content: "교사 피드백",
        authorId: teacher.id,
        questionId: assignedQuestion.id,
      },
    });
  });

  it("교사는 담당 질문 한 건에 묶음 인공지능 답변을 계속 만들 수 있다", async () => {
    const response = await createBulkAiAnswers(jsonRequest("/api/questions/bulk-ai-answers", {
      questionIds: [assignedQuestion.id],
    }));

    expect(response.status).toBe(200);
    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(mockCommentCreate).toHaveBeenCalledWith({
      data: {
        content: "생성된 답변",
        authorId: teacher.id,
        questionId: assignedQuestion.id,
      },
    });
  });
});
