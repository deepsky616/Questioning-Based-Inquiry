import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeContent } from "@/lib/content-normalize";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    question: { findUnique: vi.fn() },
    comment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pointLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops) => ops),
  },
}));
vi.mock("@/lib/translation-cleanup", () => ({ cleanupCommentTranslations: vi.fn() }));

import { GET as getComments, POST as postComment } from "@/app/api/questions/[id]/comments/route";
import { PATCH as patchComment, DELETE as deleteComment } from "@/app/api/questions/[id]/comments/[commentId]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanupCommentTranslations } from "@/lib/translation-cleanup";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const questionFind = prisma.question.findUnique as unknown as ReturnType<typeof vi.fn>;
const commentFind = prisma.comment.findUnique as unknown as ReturnType<typeof vi.fn>;
const commentMany = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const commentCreate = prisma.comment.create as unknown as ReturnType<typeof vi.fn>;
const commentUpdate = prisma.comment.update as unknown as ReturnType<typeof vi.fn>;
const commentDelete = prisma.comment.delete as unknown as ReturnType<typeof vi.fn>;
const cleanup = cleanupCommentTranslations as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const studentAuthor = { role: "STUDENT", school: "한빛초", grade: "5", className: "1" };
const teacherViewer = (classes = [{ grade: "5", className: "1" }]) => ({
  id: "t1",
  role: "TEACHER",
  school: "한빛초",
  grade: null,
  className: null,
  teacherClasses: classes,
});

beforeEach(() => {
  vi.clearAllMocks();
  commentCreate.mockResolvedValue({ id: "c-new", content: "댓글", author: { id: "s2", name: "학생" } });
  commentMany.mockResolvedValue([]);
  commentUpdate.mockImplementation(async ({ data }) => ({ id: "c1", ...data, author: { id: "s1", name: "학생" } }));
  commentDelete.mockResolvedValue({});
});

describe("GET /api/questions/[id]/comments", () => {
  it("다른 학급 학생은 공개 질문 id를 알아도 댓글 목록을 볼 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "6", className: "2", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { isActive: true, commentsVisibleToPeers: true },
    });

    const res = await getComments(new Request("http://localhost/api/test"), { params: { id: "q1" } });

    expect(res.status).toBe(403);
    expect(commentMany).not.toHaveBeenCalled();
  });

  it("댓글 비공개 세션에서는 학생에게 보이는 댓글만 반환한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { isActive: true, commentsVisibleToPeers: false },
    });
    commentMany.mockResolvedValue([
      { id: "c-teacher", content: "교사 댓글", author: { id: "t1", name: "교사", role: "TEACHER" } },
      { id: "c-me", content: "내 댓글", author: { id: "s2", name: "나", role: "STUDENT" } },
      { id: "c-other", content: "남의 댓글", author: { id: "s3", name: "친구", role: "STUDENT" } },
    ]);

    const res = await getComments(new Request("http://localhost/api/test"), { params: { id: "q1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.map((comment: { id: string }) => comment.id)).toEqual(["c-teacher", "c-me"]);
  });
});

describe("POST /api/questions/[id]/comments", () => {
  it("다른 학급 학생은 공개 질문 id를 알아도 댓글을 작성할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "6", className: "2", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { isActive: true },
    });

    const res = await postComment(req({ content: "좋은 질문이에요" }), { params: { id: "q1" } });

    expect(res.status).toBe(403);
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("담당 학급 교사는 공개 여부와 관계없이 담당 학생 질문에 댓글을 작성할 수 있다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer());
    questionFind.mockResolvedValue({
      id: "q1",
      isPublic: false,
      authorId: "s1",
      author: studentAuthor,
      session: { isActive: true },
    });

    const res = await postComment(req({ content: "선생님 답변" }), { params: { id: "q1" } });

    expect(res.status).toBe(200);
    expect(commentCreate).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/questions/[id]/comments/[commentId]", () => {
  it("댓글 내용 수정 시 정규화·부적절 플래그·번역 캐시를 함께 갱신한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s2", author: studentAuthor },
    });

    const res = await patchComment(req({ content: "  수정한 댓글  " }), { params: { id: "q1", commentId: "c1" } });

    expect(res.status).toBe(200);
    expect(commentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c1" },
      data: expect.objectContaining({
        content: "수정한 댓글",
        normalizedContent: normalizeContent("수정한 댓글"),
        flagged: false,
        flagReason: null,
      }),
    }));
    expect(cleanup).toHaveBeenCalledWith(["c1"]);
  });

  it("다른 학급 교사는 댓글 플래그를 수정할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer([{ grade: "6", className: "2" }]));
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor },
    });

    const res = await patchComment(req({ flagged: false }), { params: { id: "q1", commentId: "c1" } });

    expect(res.status).toBe(403);
    expect(commentUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/questions/[id]/comments/[commentId]", () => {
  it("다른 학급 교사는 댓글을 삭제할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer([{ grade: "6", className: "2" }]));
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor },
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), { params: { id: "q1", commentId: "c1" } });

    expect(res.status).toBe(403);
    expect(commentDelete).not.toHaveBeenCalled();
  });

  it("경로의 질문 id와 댓글의 질문 id가 다르면 삭제하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q-other",
      question: { isPublic: true, authorId: "s2", author: studentAuthor },
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), { params: { id: "q1", commentId: "c1" } });

    expect(res.status).toBe(404);
    expect(commentDelete).not.toHaveBeenCalled();
  });
});
