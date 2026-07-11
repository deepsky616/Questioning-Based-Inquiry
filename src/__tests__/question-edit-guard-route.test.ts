import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/translation-cleanup", () => ({ cleanupQuestionTranslations: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    question: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    pointLog: { count: vi.fn(), deleteMany: vi.fn() },
    comment: { count: vi.fn(), deleteMany: vi.fn() },
    questionLike: { count: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PATCH, DELETE } from "@/app/api/questions/[id]/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFind = prisma.question.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUpdate = prisma.question.update as unknown as ReturnType<typeof vi.fn>;
const mPointCount = prisma.pointLog.count as unknown as ReturnType<typeof vi.fn>;
const mCommentCount = prisma.comment.count as unknown as ReturnType<typeof vi.fn>;
const mLikeCount = prisma.questionLike.count as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const patchReq = (body: unknown) =>
  new Request("http://localhost/api/questions/q1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "q1" }) };

// 반응 없는 학생 본인 질문
const cleanQuestion = (overrides = {}) => ({
  id: "q1",
  authorId: "s1",
  content: "원래 질문",
  _count: { likes: 0, comments: 0 },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mFind.mockResolvedValue(cleanQuestion());
  mPointCount.mockResolvedValue(0);
  mUpdate.mockResolvedValue({ id: "q1", author: { id: "s1", name: "학생", className: "1" } });
  mTx.mockResolvedValue([]);
});

describe("학생 질문 내용 수정 가드 (반응 전까지만)", () => {
  it("반응이 없으면 내용+재분류 수정이 허용되고 정규화 키가 갱신된다", async () => {
    const res = await PATCH(
      patchReq({ content: "다듬은 질문", closure: "open", cognitive: "conceptual", closureScore: 0.4, cognitiveScore: 0.6 }),
      ctx,
    );
    expect(res.status).toBe(200);
    const data = mUpdate.mock.calls[0][0].data;
    expect(data.content).toBe("다듬은 질문");
    expect(data.normalizedContent).toBeTruthy();
    expect(data.closure).toBe("open");
  });

  it("좋아요가 달린 질문의 내용 수정은 403", async () => {
    mFind.mockResolvedValue(cleanQuestion({ _count: { likes: 1, comments: 0 } }));
    const res = await PATCH(patchReq({ content: "수정 시도" }), ctx);
    expect(res.status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("댓글이 달린 질문의 내용 수정은 403", async () => {
    mFind.mockResolvedValue(cleanQuestion({ _count: { likes: 0, comments: 2 } }));
    expect((await PATCH(patchReq({ content: "수정 시도" }), ctx)).status).toBe(403);
  });

  it("포인트가 지급된 질문의 내용 수정은 403", async () => {
    mPointCount.mockResolvedValue(1);
    expect((await PATCH(patchReq({ content: "수정 시도" }), ctx)).status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("학생은 isPublic을 수정할 수 없다(교사 전용)", async () => {
    expect((await PATCH(patchReq({ isPublic: false }), ctx)).status).toBe(403);
  });

  it("다른 학생의 질문 내용은 수정할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({ authorId: "s2" }));
    expect((await PATCH(patchReq({ content: "남의 질문" }), ctx)).status).toBe(403);
  });

  it("200자를 넘는 내용은 400", async () => {
    expect((await PATCH(patchReq({ content: "가".repeat(201) }), ctx)).status).toBe(400);
  });
});

describe("학생 질문 삭제 가드 (반응 전까지만)", () => {
  const delReq = new Request("http://localhost/api/questions/q1", { method: "DELETE" });

  beforeEach(() => {
    mLikeCount.mockResolvedValue(0);
    mCommentCount.mockResolvedValue(0);
  });

  it("반응이 없으면 본인 질문을 삭제할 수 있다(연관 데이터 캐스케이드)", async () => {
    const res = await DELETE(delReq, ctx);
    expect(res.status).toBe(200);
    expect(mTx).toHaveBeenCalledTimes(1);
  });

  it("좋아요·댓글·포인트가 하나라도 있으면 403", async () => {
    mLikeCount.mockResolvedValue(1);
    expect((await DELETE(delReq, ctx)).status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();

    mLikeCount.mockResolvedValue(0);
    mCommentCount.mockResolvedValue(3);
    expect((await DELETE(delReq, ctx)).status).toBe(403);

    mCommentCount.mockResolvedValue(0);
    mPointCount.mockResolvedValue(2);
    expect((await DELETE(delReq, ctx)).status).toBe(403);
  });

  it("다른 학생의 질문은 삭제할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({ authorId: "s2" }));
    expect((await DELETE(delReq, ctx)).status).toBe(403);
  });
});
