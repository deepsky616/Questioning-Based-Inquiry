import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/content-normalize-db", () => ({
  normalizeContentForPersistence: vi.fn(async (content: string) =>
    content.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu, "")
  ),
}));
vi.mock("@/lib/translation-cleanup", () => ({ cleanupQuestionTranslations: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    question: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    pointLog: { count: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    comment: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    questionLike: { count: vi.fn(), deleteMany: vi.fn() },
    translation: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    questionSession: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanupQuestionTranslations } from "@/lib/translation-cleanup";
import { PATCH, DELETE } from "@/app/api/questions/[id]/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFind = prisma.question.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUpdate = prisma.question.update as unknown as ReturnType<typeof vi.fn>;
const mPointCount = prisma.pointLog.count as unknown as ReturnType<typeof vi.fn>;
const mPointDelete = prisma.pointLog.deleteMany as unknown as ReturnType<typeof vi.fn>;
const mPointUpdate = prisma.pointLog.updateMany as unknown as ReturnType<typeof vi.fn>;
const mCommentCount = prisma.comment.count as unknown as ReturnType<typeof vi.fn>;
const mCommentFind = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const mLikeCount = prisma.questionLike.count as unknown as ReturnType<typeof vi.fn>;
const mTranslationDelete = prisma.translation.deleteMany as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionFind = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const mCleanupQuestionTranslations = cleanupQuestionTranslations as unknown as ReturnType<typeof vi.fn>;

function rawQueryText(query: { strings?: readonly string[]; sql?: string }) {
  return query.strings?.join("?") ?? query.sql ?? "";
}

function rawQueryValues(query: { values?: unknown[] }) {
  return query.values ?? [];
}

let transactionOpen = false;
let translationDeleteInsideTransaction = false;

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
  isPublic: false,
  author: {
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  },
  session: null,
  _count: { likes: 0, comments: 0 },
  ...overrides,
});

const removedSession = {
  teacherId: "t1",
  targetType: "STUDENT",
  targetGrade: null,
  targetClassName: null,
  targetStudentId: "s2",
  targetStudentIds: ["s2"],
  teacher: {
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mUserFind.mockResolvedValue({
    id: "s1",
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
    teacherClasses: [],
  });
  mSessionFind.mockResolvedValue(null);
  mFind.mockResolvedValue(cleanQuestion());
  mPointCount.mockResolvedValue(0);
  mPointUpdate.mockResolvedValue({ count: 0 });
  mCommentCount.mockResolvedValue(0);
  mCommentFind.mockResolvedValue([]);
  mLikeCount.mockResolvedValue(0);
  mUpdate.mockResolvedValue({ id: "q1", author: { id: "s1", name: "학생", className: "1" } });
  mQueryRaw.mockImplementation(async (query: {
    strings?: readonly string[];
    sql?: string;
  }) => {
    const sql = rawQueryText(query);
    if (sql.includes('FROM "questions"')) {
      return [{
        id: "q1",
        authorId: "s1",
        sessionId: null,
        source: "STUDENT",
        authorRole: "STUDENT",
      }];
    }
    if (sql.includes('FROM "users"')) {
      return [{ id: "s1", role: "STUDENT" }];
    }
    return [];
  });
  transactionOpen = false;
  translationDeleteInsideTransaction = false;
  mTranslationDelete.mockImplementation(async () => {
    translationDeleteInsideTransaction = transactionOpen;
    return { count: 0 };
  });
  mTx.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      transactionOpen = true;
      try {
        return await input(prisma);
      } finally {
        transactionOpen = false;
      }
    }
    return Promise.all(input as Promise<unknown>[]);
  });
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
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mQueryRaw).toHaveBeenCalled();
  });

  it("정규화하면 비는 내용으로 학생 질문을 바꿀 수 없다", async () => {
    const res = await PATCH(patchReq({ content: "...!!!" }), ctx);

    expect(res.status).toBe(400);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("점수 지급 대상 수업 질문은 장부 반영 전에도 내용을 바꿀 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({
      sessionId: "session-1",
      source: "STUDENT",
      session: null,
    }));
    mPointCount.mockResolvedValue(0);

    const res = await PATCH(patchReq({ content: "지급 전 바꾸기" }), ctx);

    expect(res.status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("좋아요가 달린 질문의 내용 수정은 403", async () => {
    mLikeCount.mockResolvedValue(1);
    const res = await PATCH(patchReq({ content: "수정 시도" }), ctx);
    expect(res.status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("댓글이 달린 질문의 내용 수정은 403", async () => {
    mCommentCount.mockResolvedValue(2);
    expect((await PATCH(patchReq({ content: "수정 시도" }), ctx)).status).toBe(403);
  });

  it("포인트가 지급된 질문의 내용 수정은 403", async () => {
    mPointCount.mockResolvedValue(1);
    expect((await PATCH(patchReq({ content: "수정 시도" }), ctx)).status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("교사도 포인트 지급 대상 학생 질문의 내용을 바꿀 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mUserFind.mockResolvedValue({
      id: "t1",
      role: "TEACHER",
      school: "한빛초",
      grade: null,
      className: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });
    mFind.mockResolvedValue(cleanQuestion({
      sessionId: "session-1",
      source: "STUDENT",
    }));
    mQueryRaw.mockResolvedValue([{
      id: "q1",
      sessionId: "session-1",
      source: "STUDENT",
      authorRole: "STUDENT",
    }]);

    const res = await PATCH(patchReq({ content: "교사가 바꾼 질문" }), ctx);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: expect.stringContaining("포인트 지급 대상 학생 질문"),
    });
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 담당 학급이 바뀐 교사는 질문 분류를 수정할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mUserFind.mockResolvedValue({
      id: "t1",
      role: "TEACHER",
      school: "한빛초",
      grade: null,
      className: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });
    mFind.mockResolvedValue(cleanQuestion({ sessionId: "session-1" }));
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{
          id: "q1",
          authorId: "s1",
          sessionId: "session-1",
          source: "STUDENT",
          authorRole: "STUDENT",
        }];
      }
      if (sql.includes('FROM "question_sessions"')) {
        order.push("session");
        return [{ id: "session-1", teacherId: "t1" }];
      }
      if (sql.includes('FROM "teacher_classes"')) {
        order.push("classes");
        return [{ id: "class-2", grade: "6", className: "2" }];
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
          className: "1",
        }];
      }
      return [];
    });

    const res = await PATCH(patchReq({ closure: "closed" }), ctx);

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "session", "teacher", "classes", "student"]);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 질문 작성자가 바뀌면 학생은 질문을 수정할 수 없다", async () => {
    const order: string[] = [];
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{
          id: "q1",
          authorId: "s2",
          sessionId: null,
          source: "STUDENT",
          authorRole: "STUDENT",
        }];
      }
      if (sql.includes('FROM "users"')) {
        order.push("user");
        return [{ id: "s1", role: "STUDENT" }];
      }
      return [];
    });

    const res = await PATCH(patchReq({ closure: "closed" }), ctx);

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "user"]);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 학생 역할이 회수되면 자기 질문도 수정할 수 없다", async () => {
    const order: string[] = [];
    const activeStudent = {
      id: "s1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
      teacherClasses: [],
    };
    mUserFind
      .mockResolvedValueOnce(activeStudent)
      .mockResolvedValueOnce(activeStudent)
      .mockResolvedValue({ ...activeStudent, role: "TEACHER" });
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{
          id: "q1",
          authorId: "s1",
          sessionId: null,
          source: "STUDENT",
          authorRole: "STUDENT",
        }];
      }
      if (sql.includes('FROM "users"')) {
        order.push("user");
        return [{ id: "s1", role: "TEACHER" }];
      }
      return [];
    });

    const res = await PATCH(patchReq({ closure: "closed" }), ctx);

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "user"]);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("학생은 isPublic을 수정할 수 없다(교사 전용)", async () => {
    expect((await PATCH(patchReq({ isPublic: false }), ctx)).status).toBe(403);
  });

  it("다른 학생의 질문 내용은 수정할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({ authorId: "s2" }));
    expect((await PATCH(patchReq({ content: "남의 질문" }), ctx)).status).toBe(403);
  });

  it("현재 수업 대상에서 제외되면 자기 질문 분류도 수정할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({ session: removedSession }));

    expect((await PATCH(patchReq({ closure: "closed" }), ctx)).status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("검사 뒤 잠금 대기 중 수업 대상에서 제외되면 자기 질문도 수정할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({
      sessionId: "session-1",
      source: "TEACHER_SHARED",
      session: {
        ...removedSession,
        targetStudentId: "s1",
        targetStudentIds: ["s1"],
        teacher: { ...removedSession.teacher, role: "TEACHER" },
      },
    }));
    mSessionFind
      .mockResolvedValueOnce({ teacherId: "t1" })
      .mockResolvedValue({ ...removedSession, isActive: true, defaultQuestionPublic: false });
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) {
        return [{
          id: "q1",
          authorId: "s1",
          sessionId: "session-1",
          source: "STUDENT",
          authorRole: "STUDENT",
        }];
      }
      if (sql.includes('FROM "question_sessions"')) return [{ id: "session-1" }];
      if (sql.includes('FROM "teacher_classes"')) return [{ id: "class-1" }];
      if (sql.includes('FROM "users"') && values.includes("t1")) return [{ id: "t1", role: "TEACHER" }];
      if (sql.includes('FROM "users"')) return [{ id: "s1", role: "STUDENT" }];
      return [];
    });

    const res = await PATCH(patchReq({ closure: "closed" }), ctx);

    expect(res.status).toBe(403);
    expect(mUpdate).not.toHaveBeenCalled();
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
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mQueryRaw).toHaveBeenCalled();
  });

  it("잠그려던 질문이 이미 사라졌으면 삭제 성공으로 꾸미지 않는다", async () => {
    mQueryRaw.mockResolvedValue([]);

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(404);
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });

  it("점수 지급 대상 수업 질문은 장부 반영 전에도 학생이 삭제할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({
      sessionId: "session-1",
      source: "STUDENT",
      session: null,
    }));
    mPointCount.mockResolvedValue(0);

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(403);
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });

  it("질문을 삭제해도 이미 확정된 점수 장부는 지우지 않는다", async () => {
    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(200);
    expect(mPointDelete).not.toHaveBeenCalled();
  });

  it("질문과 자식 답변을 지우기 전에 관련 대기 보너스를 거부한다", async () => {
    mCommentFind.mockResolvedValue([{ id: "c2" }, { id: "c1" }]);
    mQueryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = query.strings?.join("?") ?? query.sql ?? "";
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "comments"')) return [{ id: "c1" }, { id: "c2" }];
      if (sql.includes('FROM "users"')) return [{ id: "s1", role: "STUDENT" }];
      return [];
    });

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(200);
    expect(mPointUpdate).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        bonusType: { in: expect.arrayContaining(["AI_DEEP_QUESTION", "AI_APT_ANSWER"]) },
        OR: [
          { relatedQuestionId: { in: ["q1"] } },
          { relatedCommentId: { in: ["c1", "c2"] } },
        ],
      },
      data: { status: "REJECTED", decidedAt: expect.any(Date) },
    });
    expect(mPointUpdate).toHaveBeenCalledBefore(prisma.comment.deleteMany as unknown as ReturnType<typeof vi.fn>);
    expect(mPointUpdate).toHaveBeenCalledBefore(prisma.question.delete as unknown as ReturnType<typeof vi.fn>);
  });

  it("잠금 대기 중 질문 작성자가 담당 학급 밖으로 옮겨지면 교사는 삭제할 수 없다", async () => {
    const order: string[] = [];
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    mUserFind.mockResolvedValue({
      id: "t1",
      role: "TEACHER",
      school: "한빛초",
      grade: null,
      className: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });
    mFind.mockResolvedValue(cleanQuestion({ sessionId: "session-1" }));
    mCommentFind.mockResolvedValue([{ id: "c1" }]);
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{
          id: "q1",
          authorId: "s1",
          sessionId: "session-1",
          source: "STUDENT",
        }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comments");
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

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(403);
    expect(order).toEqual([
      "question",
      "comments",
      "session",
      "teacher",
      "classes",
      "student",
    ]);
    expect(mPointUpdate).not.toHaveBeenCalled();
    expect(mTranslationDelete).not.toHaveBeenCalled();
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 질문 작성자가 바뀌면 학생은 질문을 삭제할 수 없다", async () => {
    const order: string[] = [];
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{ id: "q1", authorId: "s2", sessionId: null }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comments");
        return [];
      }
      if (sql.includes('FROM "users"')) {
        order.push("user");
        return [{ id: "s1", role: "STUDENT" }];
      }
      return [];
    });

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "comments", "user"]);
    expect(mPointUpdate).not.toHaveBeenCalled();
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });

  it("잠금 대기 중 학생 역할이 회수되면 자기 질문도 삭제할 수 없다", async () => {
    const order: string[] = [];
    const activeStudent = {
      id: "s1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
      teacherClasses: [],
    };
    mUserFind
      .mockResolvedValueOnce(activeStudent)
      .mockResolvedValueOnce(activeStudent)
      .mockResolvedValue({ ...activeStudent, role: "TEACHER" });
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      if (sql.includes('FROM "questions"')) {
        order.push("question");
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "comments"')) {
        order.push("comments");
        return [];
      }
      if (sql.includes('FROM "users"')) {
        order.push("user");
        return [{ id: "s1", role: "TEACHER" }];
      }
      return [];
    });

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(403);
    expect(order).toEqual(["question", "comments", "user"]);
    expect(mPointUpdate).not.toHaveBeenCalled();
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });

  it("삭제가 금지되면 질문과 답변 번역을 먼저 지우지 않는다", async () => {
    mLikeCount.mockResolvedValue(1);

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(403);
    expect(mCleanupQuestionTranslations).not.toHaveBeenCalled();
    expect(mTranslationDelete).not.toHaveBeenCalled();
  });

  it("삭제 허용 뒤 질문과 답변 번역을 같은 거래 안에서 먼저 정리한다", async () => {
    mCommentFind.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    mQueryRaw.mockImplementation(async (query: { strings?: readonly string[]; sql?: string }) => {
      const sql = query.strings?.join("?") ?? query.sql ?? "";
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s1", sessionId: null }];
      }
      if (sql.includes('FROM "comments"')) return [{ id: "c1" }, { id: "c2" }];
      if (sql.includes('FROM "users"')) return [{ id: "s1", role: "STUDENT" }];
      return [];
    });

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(200);
    expect(mCleanupQuestionTranslations).not.toHaveBeenCalled();
    expect(translationDeleteInsideTransaction).toBe(true);
    expect(mTranslationDelete).toHaveBeenCalledWith({
      where: {
        OR: [
          { sourceType: "QUESTION", sourceId: "q1" },
          { sourceType: "COMMENT", sourceId: { in: ["c1", "c2"] } },
        ],
      },
    });
    expect(mTranslationDelete.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(
        mLikeCount.mock.invocationCallOrder[0],
        mCommentCount.mock.invocationCallOrder[0],
        mPointCount.mock.invocationCallOrder[0],
      ),
    );
    expect(prisma.comment.deleteMany).toHaveBeenCalledAfter(mTranslationDelete);
    expect(prisma.question.delete).toHaveBeenCalledAfter(mTranslationDelete);
  });

  it("좋아요·댓글·포인트가 하나라도 있으면 403", async () => {
    mLikeCount.mockResolvedValue(1);
    expect((await DELETE(delReq, ctx)).status).toBe(403);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));

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

  it("현재 수업 대상에서 제외되면 자기 질문도 삭제할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({ session: removedSession }));

    expect((await DELETE(delReq, ctx)).status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("검사 뒤 잠금 대기 중 수업 대상에서 제외되면 자기 질문도 삭제할 수 없다", async () => {
    mFind.mockResolvedValue(cleanQuestion({
      sessionId: "session-1",
      source: "TEACHER_SHARED",
      session: {
        ...removedSession,
        targetStudentId: "s1",
        targetStudentIds: ["s1"],
        teacher: { ...removedSession.teacher, role: "TEACHER" },
      },
    }));
    mSessionFind
      .mockResolvedValueOnce({ teacherId: "t1" })
      .mockResolvedValue({ ...removedSession, isActive: true, defaultQuestionPublic: false });
    mQueryRaw.mockImplementation(async (query: {
      strings?: readonly string[];
      sql?: string;
      values?: unknown[];
    }) => {
      const sql = rawQueryText(query);
      const values = rawQueryValues(query);
      if (sql.includes('FROM "questions"')) {
        return [{ id: "q1", authorId: "s1", sessionId: "session-1" }];
      }
      if (sql.includes('FROM "comments"')) return [];
      if (sql.includes('FROM "question_sessions"')) return [{ id: "session-1" }];
      if (sql.includes('FROM "teacher_classes"')) return [{ id: "class-1" }];
      if (sql.includes('FROM "users"') && values.includes("t1")) return [{ id: "t1", role: "TEACHER" }];
      if (sql.includes('FROM "users"')) return [{ id: "s1", role: "STUDENT" }];
      return [];
    });

    const res = await DELETE(delReq, ctx);

    expect(res.status).toBe(403);
    expect(mTx).toHaveBeenCalledWith(expect.any(Function));
    expect(mPointUpdate).not.toHaveBeenCalled();
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });

  it("알 수 없는 역할은 작성자 번호가 같아도 질문을 삭제할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "UNKNOWN" } });

    expect((await DELETE(delReq, ctx)).status).toBe(403);
    expect(mTx).not.toHaveBeenCalled();
  });
});
