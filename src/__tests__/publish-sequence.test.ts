import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn(), update: vi.fn() },
    question: { findMany: vi.fn(), create: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/sessions/[id]/publish-questions/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockSessFind = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockSessUpdate = prisma.questionSession.update as ReturnType<typeof vi.fn>;
const mockQFind = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockQCreate = prisma.question.create as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/sessions/s1/publish-questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: { id: "s1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mockSessFind.mockResolvedValue({ id: "s1", teacherId: "t1", sharedQuestions: [] });
  mockQFind.mockResolvedValue([]);
  mockQCreate.mockImplementation(({ data }: { data: { content: string; inquiryType: string | null } }) =>
    Promise.resolve({ id: "q-new", content: data.content, inquiryType: data.inquiryType }),
  );
  mockSessUpdate.mockResolvedValue({});
});

describe("POST publish-questions (sequence 분기)", () => {
  it("sequence를 받으면 sharedQuestions에 그룹/순서를 저장한다", async () => {
    const res = await POST(
      req({
        sequence: [
          { type: "factual", content: "학생질문1", contentGroup: "광합성", priority: 1, source: "student" },
          { type: "conceptual", content: "교사질문1", contentGroup: "광합성", priority: 2, source: "teacher" },
        ],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const updateArg = mockSessUpdate.mock.calls[0][0];
    const saved = updateArg.data.sharedQuestions;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ content: "학생질문1", contentGroup: "광합성", priority: 1 });
    expect(mockQCreate).toHaveBeenCalledTimes(1);
    expect(mockQCreate.mock.calls[0][0].data.content).toBe("교사질문1");
  });

  it("권한 없는 세션이면 403", async () => {
    mockSessFind.mockResolvedValue({ id: "s1", teacherId: "other", sharedQuestions: [] });
    const res = await POST(req({ sequence: [{ type: "factual", content: "A" }] }), ctx);
    expect(res.status).toBe(403);
  });
});
