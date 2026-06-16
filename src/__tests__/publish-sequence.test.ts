import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn(), update: vi.fn() },
    question: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
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
const mockQDelete = prisma.question.deleteMany as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest("http://localhost/api/sessions/s1/publish-questions", {
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
  mockQDelete.mockResolvedValue({ count: 0 });
  mockSessUpdate.mockResolvedValue({});
});

describe("POST publish-questions (sequence 분기)", () => {
  it("sequence를 받으면 모든 질문을 배포하고 sharedQuestions에 그룹/순서를 저장한다", async () => {
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
    // 학생·교사 질문 모두 TEACHER_SHARED로 배포되어 좋아요·댓글 대상이 된다
    expect(mockQCreate).toHaveBeenCalledTimes(2);
    const created = mockQCreate.mock.calls.map((c) => c[0].data.content);
    expect(created).toEqual(expect.arrayContaining(["학생질문1", "교사질문1"]));
  });

  it("재배포 시 이미 배포된 질문은 재사용하고 좋아요·댓글을 보존한다(새로 만들지 않음)", async () => {
    // "학생질문1"은 이미 배포되어 좋아요 3개가 달려 있음
    mockQFind.mockResolvedValue([
      { id: "q-old", content: "학생질문1", _count: { likes: 3, comments: 0 } },
    ]);
    const res = await POST(
      req({
        sequence: [
          { type: "factual", content: "학생질문1", priority: 1, source: "student" },
          { type: "conceptual", content: "교사질문1", priority: 2, source: "teacher" },
        ],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    // 기존 질문(q-old)은 재사용 → 새 질문(교사질문1)만 생성
    expect(mockQCreate).toHaveBeenCalledTimes(1);
    expect(mockQCreate.mock.calls[0][0].data.content).toBe("교사질문1");
    // 좋아요가 있는 기존 질문은 삭제되지 않는다
    expect(mockQDelete).not.toHaveBeenCalled();
  });

  it("새 시퀀스에서 빠졌고 참여 기록이 전혀 없는 질문만 정리한다", async () => {
    mockQFind.mockResolvedValue([
      { id: "q-keep", content: "좋아요있는질문", _count: { likes: 1, comments: 0 } },
      { id: "q-drop", content: "참여없는질문", _count: { likes: 0, comments: 0 } },
    ]);
    const res = await POST(
      req({ sequence: [{ type: "factual", content: "새질문", priority: 1, source: "student" }] }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mockQDelete).toHaveBeenCalledTimes(1);
    const ids = mockQDelete.mock.calls[0][0].where.id.in;
    expect(ids).toEqual(["q-drop"]); // 참여 없는 것만 삭제, 좋아요 있는 q-keep은 보존
  });

  it("권한 없는 세션이면 403", async () => {
    mockSessFind.mockResolvedValue({ id: "s1", teacherId: "other", sharedQuestions: [] });
    const res = await POST(req({ sequence: [{ type: "factual", content: "A" }] }), ctx);
    expect(res.status).toBe(403);
  });
});
