import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeContent } from "@/lib/content-normalize";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/content-normalize-db", () => ({
  normalizeContentForPersistence: vi.fn(async (content: string) =>
    content.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu, "")
  ),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    questionSession: { findUnique: vi.fn() },
    question: { findUnique: vi.fn() },
    comment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pointLog: { create: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
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
const sessionFind = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const questionFind = prisma.question.findUnique as unknown as ReturnType<typeof vi.fn>;
const commentFind = prisma.comment.findUnique as unknown as ReturnType<typeof vi.fn>;
const commentMany = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const commentFirst = prisma.comment.findFirst as unknown as ReturnType<typeof vi.fn>;
const commentCreate = prisma.comment.create as unknown as ReturnType<typeof vi.fn>;
const commentUpdate = prisma.comment.update as unknown as ReturnType<typeof vi.fn>;
const commentDelete = prisma.comment.delete as unknown as ReturnType<typeof vi.fn>;
const pointCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;
const pointCount = prisma.pointLog.count as unknown as ReturnType<typeof vi.fn>;
const pointUpdateMany = prisma.pointLog.updateMany as unknown as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const cleanup = cleanupCommentTranslations as unknown as ReturnType<typeof vi.fn>;

function rawQueryText(query: { strings?: readonly string[]; sql?: string }) {
  return query.strings?.join("?") ?? query.sql ?? "";
}

function rawQueryValues(query: { values?: unknown[] }) {
  return query.values ?? [];
}

function req(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const studentAuthor = { role: "STUDENT", school: "한빛초", grade: "5", className: "1" };
const classSession = {
  teacherId: "t1",
  targetType: "CLASS",
  targetGrade: "5",
  targetClassName: "1",
  targetStudentId: null,
  targetStudentIds: [],
  teacher: {
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  },
};
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
  commentFirst.mockResolvedValue(null);
  commentUpdate.mockImplementation(async ({ data }) => ({ id: "c1", ...data, author: { id: "s1", name: "학생" } }));
  commentDelete.mockResolvedValue({});
  pointCreate.mockResolvedValue({ id: "point-new" });
  pointCount.mockResolvedValue(0);
  pointUpdateMany.mockResolvedValue({ count: 0 });
  sessionFind.mockResolvedValue(null);
  queryRaw.mockImplementation(async (query: {
    strings?: readonly string[];
    sql?: string;
    values?: unknown[];
  }) => {
    const sql = rawQueryText(query);
    const values = rawQueryValues(query);
    if (sql.includes('FROM "questions"')) {
      return [{ id: "q1", authorId: "s1", sessionId: null }];
    }
    if (sql.includes('FROM "comments"')) {
      return [{ id: "c1", authorId: "s1", questionId: "q1" }];
    }
    if (sql.includes('FROM "question_sessions"')) {
      return [{ id: "session-1", teacherId: "t1" }];
    }
    if (sql.includes('FROM "teacher_classes"')) {
      return [{ id: "class-1", grade: "5", className: "1" }];
    }
    if (sql.includes('FROM "users"') && values.includes("t1")) {
      return [{ id: "t1", role: "TEACHER", school: "한빛초" }];
    }
    if (sql.includes('FROM "users"')) {
      return [{
        id: "s1",
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
      }];
    }
    return [];
  });
  userUpdate.mockResolvedValue({ id: "s2", totalPoints: 1 });
  transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input(prisma);
    }
    return Promise.all(input as Promise<unknown>[]);
  });
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
      session: { ...classSession, isActive: true, commentsVisibleToPeers: true },
    });

    const res = await getComments(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1" }),
    });

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
      session: { ...classSession, isActive: true, commentsVisibleToPeers: false },
    });
    commentMany.mockResolvedValue([
      { id: "c-teacher", content: "교사 댓글", author: { id: "t1", name: "교사", role: "TEACHER" } },
      { id: "c-me", content: "내 댓글", author: { id: "s2", name: "나", role: "STUDENT" } },
      { id: "c-other", content: "남의 댓글", author: { id: "s3", name: "친구", role: "STUDENT" } },
    ]);

    const res = await getComments(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.map((comment: { id: string }) => comment.id)).toEqual(["c-teacher", "c-me"]);
  });

  it("수업에 속하지 않은 공개 질문은 같은 학급 학생 댓글을 보여준다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: null,
    });
    commentMany.mockResolvedValue([
      { id: "c-other", content: "친구 댓글", author: { id: "s3", name: "친구", role: "STUDENT" } },
    ]);

    const res = await getComments(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.map((comment: { id: string }) => comment.id)).toEqual(["c-other"]);
  });
});

describe("POST /api/questions/[id]/comments", () => {
  it("검사 뒤 수업이 닫히면 답변과 점수를 함께 저장하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });
    queryRaw.mockResolvedValue([]);

    const res = await postComment(req({ content: "닫히는 순간의 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(403);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(commentCreate).not.toHaveBeenCalled();
    expect(pointCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("정규화하면 비는 답변은 저장하거나 점수를 주지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });

    const res = await postComment(req({ content: "...!!!" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(400);
    expect(commentCreate).not.toHaveBeenCalled();
    expect(pointCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("학생이 친구 질문에 답하면 댓글별 점수 로그와 총점을 같은 처리에서 저장한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });

    const res = await postComment(req({ content: "좋은 질문이에요" }), {
      params: Promise.resolve({ id: "q1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awardedPoints).toBe(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(pointCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "s2",
        bonusType: "COMMENT_WRITE",
        relatedCommentId: "c-new",
      }),
    });
    expect(pointCreate.mock.calls[0][0].data).not.toHaveProperty("relatedQuestionId");
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { totalPoints: { increment: 1 } },
    });
  });

  it("학생이 자기 질문에 답하면 댓글만 저장하고 점수를 지급하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: null,
      isPublic: true,
      authorId: "s2",
      author: studentAuthor,
      session: null,
    });

    const res = await postComment(req({ content: "내 질문 보충 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awardedPoints).toBe(0);
    expect(commentCreate).toHaveBeenCalledTimes(1);
    expect(pointCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("점수가 없는 자기 질문 답변도 저장 대기 중 학생 권한이 회수되면 만들지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind
      .mockResolvedValueOnce({
        id: "s2",
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
        teacherClasses: [],
      })
      .mockResolvedValue({
        id: "s2",
        role: "REVOKED",
        school: "한빛초",
        grade: "5",
        className: "1",
        teacherClasses: [],
      });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: null,
      isPublic: true,
      authorId: "s2",
      author: studentAuthor,
      session: null,
    });

    const res = await postComment(req({ content: "권한 회수와 겹친 보충 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(403);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(commentCreate).not.toHaveBeenCalled();
    expect(pointCreate).not.toHaveBeenCalled();
  });

  it("세션 역할이 늦게 갱신돼도 자료베이스 역할이 교사이면 답변 점수를 지급하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "STUDENT" } });
    userFind.mockResolvedValue(teacherViewer());
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: null,
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: null,
    });

    const res = await postComment(req({ content: "교사 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.awardedPoints).toBe(0);
    expect(pointCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("세션 역할이 교사로 남아 있어도 실제 학생은 비활성 수업에 답할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "TEACHER" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: false },
    });

    const res = await postComment(req({ content: "닫힌 수업 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(403);
    expect(commentCreate).not.toHaveBeenCalled();
    expect(pointCreate).not.toHaveBeenCalled();
  });

  it("세션 역할이 교사로 남아 있어도 실제 학생의 같은 답변 중복을 검사한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "TEACHER" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });
    commentFirst.mockResolvedValue({ id: "existing-comment" });

    const res = await postComment(req({ content: "같은 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(409);
    expect(commentFirst).toHaveBeenCalled();
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("친구 답변 점수 저장에 실패하면 댓글 저장 성공을 반환하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });
    pointCreate.mockRejectedValueOnce(new Error("point write failed"));

    const res = await postComment(req({ content: "점수와 함께 저장돼야 해요" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(500);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("저장 거래를 기다리는 동안 수업 배정에서 빠지면 답변과 점수를 만들지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    const accessible = {
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    };
    const changed = {
      ...accessible,
      session: {
        ...classSession,
        isActive: true,
        targetType: "STUDENT",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: "student-other",
        targetStudentIds: ["student-other"],
      },
    };
    questionFind.mockResolvedValueOnce(accessible).mockResolvedValue(changed);

    const res = await postComment(req({ content: "배정 변경과 경쟁하는 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(403);
    expect(commentCreate).not.toHaveBeenCalled();
    expect(pointCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("동시 같은 답변의 고유 조건 충돌은 중복 응답으로 돌려준다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      sessionId: "session-1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });
    commentCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      "duplicate comment",
      { code: "P2002", clientVersion: "5.22.0" },
    ));

    const res = await postComment(req({ content: "동시에 보낸 같은 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.code).toBe("DUPLICATE");
    expect(pointCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("다른 학급 학생은 공개 질문 id를 알아도 댓글을 작성할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s2", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s2", role: "STUDENT", school: "한빛초", grade: "6", className: "2", teacherClasses: [] });
    questionFind.mockResolvedValue({
      id: "q1",
      isPublic: true,
      authorId: "s1",
      author: studentAuthor,
      session: { ...classSession, isActive: true },
    });

    const res = await postComment(req({ content: "좋은 질문이에요" }), {
      params: Promise.resolve({ id: "q1" }),
    });

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
      session: { ...classSession, isActive: true },
    });

    const res = await postComment(req({ content: "선생님 답변" }), {
      params: Promise.resolve({ id: "q1" }),
    });

    expect(res.status).toBe(200);
    expect(commentCreate).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/questions/[id]/comments/[commentId]", () => {
  it("점수 지급 대상 학생 답변은 장부 반영 전에도 내용을 바꿀 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s2", author: studentAuthor, session: null },
    });
    pointCount.mockResolvedValue(0);
    queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      order.push("lock");
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s2", sessionId: null }];
      }
      if (sql.includes('FROM "users"')) {
        return [{ id: "s1", role: "STUDENT" }];
      }
      return [{ id: "c1", authorId: "s1", questionId: "q1" }];
    });

    const res = await patchComment(req({ content: "다른 답변으로 바꾸기" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(order).toEqual(["lock", "lock", "lock"]);
    expect(pointCount).not.toHaveBeenCalled();
    expect(commentUpdate).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("점수를 받은 학생 답변은 내용을 바꿔 원문을 다시 등록할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      order.push("lock");
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "users"')) {
        return [{ id: "s1", role: "STUDENT" }];
      }
      return [{ id: "c1", authorId: "s1", questionId: "q1" }];
    });
    pointCount.mockImplementation(async () => {
      order.push("point");
      return 1;
    });

    const res = await patchComment(req({ content: "다른 답변으로 바꾸기" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(order).toEqual(["lock", "lock", "lock", "point"]);
    expect(pointCount).toHaveBeenCalledWith({
      where: { relatedCommentId: "c1", status: { in: ["PENDING", "APPROVED"] } },
    });
    expect(commentUpdate).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("자기 질문에 쓴 답변도 대기 중인 인공지능 보너스 근거이면 내용을 바꿀 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    pointCount.mockResolvedValue(1);

    const res = await patchComment(req({ content: "보너스 근거를 바꾸기" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(pointCount).toHaveBeenCalledWith({
      where: {
        relatedCommentId: "c1",
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    expect(commentUpdate).not.toHaveBeenCalled();
  });

  it("댓글 내용 수정 시 정규화·부적절 플래그·번역 캐시를 함께 갱신한다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor },
    });
    queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      order.push("lock");
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "users"')) {
        return [{ id: "s1", role: "STUDENT" }];
      }
      return [{ id: "c1", authorId: "s1", questionId: "q1" }];
    });
    pointCount.mockImplementation(async () => {
      order.push("point");
      return 0;
    });
    commentUpdate.mockImplementation(async ({ data }) => {
      order.push("update");
      return { id: "c1", ...data, author: { id: "s1", name: "학생" } };
    });

    const res = await patchComment(req({ content: "  수정한 댓글  " }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(order).toEqual(["lock", "lock", "lock", "point", "update"]);
    expect(rawQueryText(queryRaw.mock.calls[0][0])).toContain('FROM "questions"');
    expect(rawQueryText(queryRaw.mock.calls[1][0])).toContain('FROM "comments"');
    expect(rawQueryText(queryRaw.mock.calls[2][0])).toContain('FROM "users"');
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

  it("정규화하면 비는 내용으로 학생 답변을 바꿀 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });

    const res = await patchComment(req({ content: "...!!!" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(400);
    expect(commentUpdate).not.toHaveBeenCalled();
  });

  it("답변 수정이 다른 같은 내용과 겹치면 중복 안내를 돌려준다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    commentUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      "duplicate comment",
      { code: "P2002", clientVersion: "5.22.0" },
    ));

    const res = await patchComment(req({ content: "이미 있는 보충 답변" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.code).toBe("DUPLICATE");
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("다른 학급 교사는 댓글 플래그를 수정할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer([{ grade: "6", className: "2" }]));
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor },
    });

    const res = await patchComment(req({ flagged: false }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(commentUpdate).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 교사 역할이 회수되면 답변 플래그를 수정할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer());
    commentFind.mockResolvedValue({
      authorId: "s2",
      questionId: "q1",
      question: {
        isPublic: true,
        authorId: "s1",
        author: studentAuthor,
        session: classSession,
      },
    });
    queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{ id: "q1", authorId: "s1", sessionId: "session-1" }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comment");
        return [{ id: "c1", authorId: "s2", questionId: "q1" }];
      }
      if (sql.includes('FROM "question_sessions"')) {
        order.push("session");
        return [{ id: "session-1", teacherId: "t1" }];
      }
      if (sql.includes('FROM "users"') && values.includes("t1")) {
        order.push("teacher");
        return [{ id: "t1", role: "STUDENT", school: "한빛초" }];
      }
      return [];
    });

    const res = await patchComment(req({ flagged: false }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "comment", "session", "teacher"]);
    expect(commentUpdate).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 학생 역할이 회수되면 자기 답변도 수정할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    const activeStudent = {
      id: "s1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
      teacherClasses: [],
    };
    userFind
      .mockResolvedValueOnce(activeStudent)
      .mockResolvedValue({ ...activeStudent, role: "TEACHER" });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
    }) => {
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comment");
        return [{ id: "c1", authorId: "s1", questionId: "q1" }];
      }
      if (sql.includes('FROM "users"')) {
        order.push("user");
        return [{ id: "s1", role: "TEACHER" }];
      }
      return [];
    });

    const res = await patchComment(req({ content: "수정 시도" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "comment", "user"]);
    expect(pointCount).not.toHaveBeenCalled();
    expect(commentUpdate).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("현재 수업 대상에서 제외된 학생은 자기 댓글을 수정할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: {
        isPublic: true,
        authorId: "s2",
        author: studentAuthor,
        session: {
          ...classSession,
          targetType: "STUDENT",
          targetGrade: null,
          targetClassName: null,
          targetStudentId: "s2",
          targetStudentIds: ["s2"],
        },
      },
    });

    const res = await patchComment(req({ content: "수정 시도" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(commentUpdate).not.toHaveBeenCalled();
  });

  it("검사 뒤 잠금 대기 중 수업 대상에서 제외되면 자기 댓글도 수정할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: classSession },
    });
    sessionFind
      .mockResolvedValueOnce({ teacherId: "t1" })
      .mockResolvedValue({
        ...classSession,
        isActive: true,
        defaultQuestionPublic: false,
        targetType: "STUDENT",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: "s2",
        targetStudentIds: ["s2"],
      });
    queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) return [{ id: "q1", authorId: "s1", sessionId: "session-1" }];
      if (sql.includes('FROM "comments"')) return [{ id: "c1", authorId: "s1", questionId: "q1" }];
      if (sql.includes('FROM "question_sessions"')) return [{ id: "session-1" }];
      if (sql.includes('FROM "teacher_classes"')) return [{ id: "class-1" }];
      if (sql.includes('FROM "users"') && values.includes("t1")) return [{ id: "t1", role: "TEACHER" }];
      if (sql.includes('FROM "users"')) return [{ id: "s1", role: "STUDENT" }];
      return [];
    });

    const res = await patchComment(req({ content: "수정 시도" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(pointCount).not.toHaveBeenCalled();
    expect(commentUpdate).not.toHaveBeenCalled();
  });

  it("알 수 없는 역할은 작성자 번호가 같아도 댓글을 수정할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "UNKNOWN" } });
    userFind.mockResolvedValue({ id: "s1", role: "UNKNOWN", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s2", author: studentAuthor, session: null },
    });

    const res = await patchComment(req({ content: "수정 시도" }), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(commentUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/questions/[id]/comments/[commentId]", () => {
  it("지급되지 않은 답변도 행 잠금과 지급 확인 뒤 같은 트랜잭션에서 삭제한다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    queryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      order.push("lock");
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "users"')) {
        return [{ id: "s1", role: "STUDENT" }];
      }
      return [{ id: "c1", authorId: "s1", questionId: "q1" }];
    });
    pointCount.mockImplementation(async () => {
      order.push("point");
      return 0;
    });
    commentDelete.mockImplementation(async () => {
      order.push("delete");
      return {};
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(order).toEqual(["lock", "lock", "lock", "point", "delete"]);
  });

  it("답변을 지우기 전에 관련 대기 보너스를 거부한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer());
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: classSession },
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(200);
    expect(pointUpdateMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        bonusType: { in: expect.arrayContaining(["AI_DEEP_QUESTION", "AI_APT_ANSWER"]) },
        OR: [{ relatedCommentId: { in: ["c1"] } }],
      },
      data: { status: "REJECTED", decidedAt: expect.any(Date) },
    });
    expect(pointUpdateMany).toHaveBeenCalledBefore(commentDelete);
  });

  it("잠금 대기 중 질문 작성자가 담당 학급 밖으로 옮겨지면 교사는 답변을 삭제할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer());
    commentFind.mockResolvedValue({
      authorId: "s2",
      questionId: "q1",
      question: {
        isPublic: true,
        authorId: "s1",
        author: studentAuthor,
        session: classSession,
      },
    });
    queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{ id: "q1", authorId: "s1", sessionId: "session-1" }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comment");
        return [{ id: "c1", authorId: "s2", questionId: "q1" }];
      }
      if (sql.includes('FROM "question_sessions"')) {
        order.push("session");
        return [{ id: "session-1", teacherId: "t1" }];
      }
      if (sql.includes('FROM "teacher_classes"')) {
        order.push("classes");
        return [{ id: "class-1", grade: "5", className: "1" }];
      }
      if (sql.includes('FROM "users"') && values.includes("t1")) {
        order.push("teacher");
        return [{ id: "t1", role: "TEACHER", school: "한빛초" }];
      }
      if (sql.includes('FROM "users"') && values.includes("s1")) {
        order.push("student");
        return [{
          id: "s1",
          role: "STUDENT",
          school: "한빛초",
          grade: "5",
          className: "2",
        }];
      }
      return [];
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(order).toEqual([
      "question",
      "comment",
      "session",
      "teacher",
      "classes",
      "student",
    ]);
    expect(pointUpdateMany).not.toHaveBeenCalled();
    expect(commentDelete).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("잠그려던 답변이 이미 사라졌으면 삭제 성공으로 꾸미지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    queryRaw.mockResolvedValue([]);

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(404);
    expect(commentDelete).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("점수를 받은 학생 답변은 삭제해서 반복 지급을 만들 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s2", author: studentAuthor, session: null },
    });
    pointCount.mockResolvedValue(1);

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(pointCount).toHaveBeenCalledWith({
      where: { relatedCommentId: "c1", status: { in: ["PENDING", "APPROVED"] } },
    });
    expect(commentDelete).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "APPROVED"])(
    "자기 질문 답변에 %s 인공지능 보너스가 있으면 삭제해 반복 후보를 만들 수 없다",
    async () => {
      mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
      userFind.mockResolvedValue({
        id: "s1",
        role: "STUDENT",
        school: "한빛초",
        grade: "5",
        className: "1",
        teacherClasses: [],
      });
      commentFind.mockResolvedValue({
        authorId: "s1",
        questionId: "q1",
        question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
      });
      pointCount.mockImplementation(async (args: { where?: { status?: { in?: string[] } } }) =>
        args.where?.status?.in?.includes("PENDING") ? 1 : 0
      );

      const res = await deleteComment(new Request("http://localhost/api/test"), {
        params: Promise.resolve({ id: "q1", commentId: "c1" }),
      });

      expect(res.status).toBe(403);
      expect(pointCount).toHaveBeenCalledWith({
        where: { relatedCommentId: "c1", status: { in: ["PENDING", "APPROVED"] } },
      });
      expect(pointUpdateMany).not.toHaveBeenCalled();
      expect(commentDelete).not.toHaveBeenCalled();
    },
  );

  it("다른 학급 교사는 댓글을 삭제할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    userFind.mockResolvedValue(teacherViewer([{ grade: "6", className: "2" }]));
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor },
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(commentDelete).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 학생 역할이 회수되면 자기 답변도 삭제할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    const activeStudent = {
      id: "s1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
      teacherClasses: [],
    };
    userFind
      .mockResolvedValueOnce(activeStudent)
      .mockResolvedValue({ ...activeStudent, role: "TEACHER" });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s1", author: studentAuthor, session: null },
    });
    queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
    }) => {
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comment");
        return [{ id: "c1", authorId: "s1", questionId: "q1" }];
      }
      if (sql.includes('FROM "users"')) {
        order.push("user");
        return [{ id: "s1", role: "TEACHER" }];
      }
      return [];
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "comment", "user"]);
    expect(pointCount).not.toHaveBeenCalled();
    expect(pointUpdateMany).not.toHaveBeenCalled();
    expect(commentDelete).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("경로의 질문 id와 댓글의 질문 id가 다르면 삭제하지 않는다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q-other",
      question: { isPublic: true, authorId: "s2", author: studentAuthor },
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(404);
    expect(commentDelete).not.toHaveBeenCalled();
  });

  it("현재 수업 대상에서 제외된 학생은 자기 댓글도 삭제할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: {
        isPublic: true,
        authorId: "s2",
        author: studentAuthor,
        session: {
          ...classSession,
          targetType: "STUDENT",
          targetGrade: null,
          targetClassName: null,
          targetStudentId: "s2",
          targetStudentIds: ["s2"],
        },
      },
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(commentDelete).not.toHaveBeenCalled();
  });

  it("검사 뒤 잠금 대기 중 수업 대상에서 제외되면 자기 댓글도 삭제할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    userFind.mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1", teacherClasses: [] });
    commentFind.mockResolvedValue({
      authorId: "s1",
      questionId: "q1",
      question: { isPublic: true, authorId: "s2", author: studentAuthor, session: classSession },
    });
    sessionFind
      .mockResolvedValueOnce({ teacherId: "t1" })
      .mockResolvedValue({
        ...classSession,
        isActive: true,
        defaultQuestionPublic: false,
        targetType: "STUDENT",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: "s2",
        targetStudentIds: ["s2"],
      });
    queryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) return [{ id: "q1", authorId: "s2", sessionId: "session-1" }];
      if (sql.includes('FROM "comments"')) return [{ id: "c1", authorId: "s1", questionId: "q1" }];
      if (sql.includes('FROM "question_sessions"')) return [{ id: "session-1" }];
      if (sql.includes('FROM "teacher_classes"')) return [{ id: "class-1" }];
      if (sql.includes('FROM "users"') && values.includes("t1")) return [{ id: "t1", role: "TEACHER" }];
      if (sql.includes('FROM "users"')) return [{ id: "s1", role: "STUDENT" }];
      return [];
    });

    const res = await deleteComment(new Request("http://localhost/api/test"), {
      params: Promise.resolve({ id: "q1", commentId: "c1" }),
    });

    expect(res.status).toBe(403);
    expect(pointCount).not.toHaveBeenCalled();
    expect(pointUpdateMany).not.toHaveBeenCalled();
    expect(commentDelete).not.toHaveBeenCalled();
  });
});
