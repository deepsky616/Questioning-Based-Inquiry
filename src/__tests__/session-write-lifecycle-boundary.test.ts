import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  unitDesignFindFirst: vi.fn(),
  unitDesignFindUnique: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionCreate: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionDelete: vi.fn(),
  questionFindMany: vi.fn(),
  questionCreate: vi.fn(),
  commentFindMany: vi.fn(),
  notificationUpdateMany: vi.fn(),
  notificationDeleteMany: vi.fn(),
  pointLogUpdateMany: vi.fn(),
  sessionAnalysisDeleteMany: vi.fn(),
  loggerError: vi.fn(),
  state: {
    teacherRole: "TEACHER",
    designOwnerId: "teacher-1",
    missingStudentIds: new Set<string>(),
    currentSession: null as null | Record<string, unknown>,
    designInquiryQuestions: [] as Array<{ type: string; content: string }>,
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findMany: mocks.userFindMany,
    },
    unitDesign: {
      findFirst: mocks.unitDesignFindFirst,
      findUnique: mocks.unitDesignFindUnique,
    },
    questionSession: {
      findUnique: mocks.sessionFindUnique,
      create: mocks.sessionCreate,
      update: mocks.sessionUpdate,
      delete: mocks.sessionDelete,
    },
    question: {
      findMany: mocks.questionFindMany,
      create: mocks.questionCreate,
    },
    comment: {
      findMany: mocks.commentFindMany,
    },
    appNotification: {
      updateMany: mocks.notificationUpdateMany,
      deleteMany: mocks.notificationDeleteMany,
    },
    pointLog: {
      updateMany: mocks.pointLogUpdateMany,
    },
    sessionAnalysis: {
      deleteMany: mocks.sessionAnalysisDeleteMany,
    },
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST as createSession } from "@/app/api/sessions/route";
import {
  DELETE as deleteSession,
  PATCH as updateSession,
} from "@/app/api/sessions/[id]/route";
import { POST as createSessionFromDesign } from
  "@/app/api/unit-design/[id]/session/route";

const teacherSession = {
  user: { id: "teacher-1", role: "TEACHER", school: "한빛초" },
};

function sqlText(query: unknown) {
  if (Array.isArray(query)) return query.join("?");
  if (!query || typeof query !== "object") return "";
  const candidate = query as { strings?: readonly string[]; sql?: string };
  return candidate.strings?.join("?") ?? candidate.sql ?? "";
}

function queryValues(args: unknown[]) {
  const first = args[0];
  const embedded = first && typeof first === "object" && !Array.isArray(first)
    ? (first as { values?: unknown[] }).values ?? []
    : [];
  return [...embedded, ...args.slice(1)];
}

function teacherRecord() {
  return {
    id: "teacher-1",
    role: mocks.state.teacherRole,
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  };
}

function studentRecord(id: string) {
  return {
    id,
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  };
}

function designRecord() {
  return {
    id: "design-1",
    teacherId: mocks.state.designOwnerId,
    teacher_id: mocks.state.designOwnerId,
    title: "물질의 변화",
    subject: "과학",
    inquiryQuestions: mocks.state.designInquiryQuestions,
    inquiry_questions: mocks.state.designInquiryQuestions,
  };
}

function defaultSession() {
  return {
    id: "session-1",
    teacherId: "teacher-1",
    date: "2026-07-14",
    subject: "과학",
    topic: "물질의 변화",
    targetType: "STUDENT",
    targetGrade: null,
    targetClassName: null,
    targetStudentId: "student-old",
    targetStudentIds: ["student-old"],
    unitDesignId: null,
    sharedQuestions: [],
    defaultQuestionPublic: true,
    likesVisibleToPeers: true,
    commentsVisibleToPeers: true,
    isActive: true,
  };
}

function sessionRequest(body: Record<string, unknown>, method = "POST") {
  return new Request("http://localhost/api/sessions", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionContext() {
  return { params: Promise.resolve({ id: "session-1" }) };
}

function designRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/unit-design/design-1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.teacherRole = "TEACHER";
  mocks.state.designOwnerId = "teacher-1";
  mocks.state.missingStudentIds = new Set();
  mocks.state.currentSession = defaultSession();
  mocks.state.designInquiryQuestions = [];

  (auth as ReturnType<typeof vi.fn>).mockResolvedValue(teacherSession);
  mocks.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === "teacher-1") return teacherRecord();
    if (mocks.state.missingStudentIds.has(where.id)) return null;
    return studentRecord(where.id);
  });
  mocks.userFindMany.mockImplementation(async ({ where }: {
    where?: { id?: { in?: string[] } };
  }) => (where?.id?.in ?? [])
    .filter((id) => !mocks.state.missingStudentIds.has(id))
    .map(studentRecord));
  mocks.unitDesignFindFirst.mockImplementation(async () =>
    mocks.state.designOwnerId === "teacher-1" ? designRecord() : null
  );
  mocks.unitDesignFindUnique.mockImplementation(async () => designRecord());
  mocks.sessionFindUnique.mockImplementation(async () => mocks.state.currentSession);
  mocks.sessionCreate.mockResolvedValue({ id: "session-new" });
  mocks.sessionUpdate.mockResolvedValue({ id: "session-1" });
  mocks.sessionDelete.mockResolvedValue({ id: "session-1" });
  mocks.questionFindMany.mockResolvedValue([]);
  mocks.questionCreate.mockResolvedValue({ id: "question-new" });
  mocks.commentFindMany.mockResolvedValue([]);
  mocks.notificationUpdateMany.mockResolvedValue({ count: 0 });
  mocks.notificationDeleteMany.mockResolvedValue({ count: 0 });
  mocks.pointLogUpdateMany.mockResolvedValue({ count: 0 });
  mocks.sessionAnalysisDeleteMany.mockResolvedValue({ count: 0 });
  mocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
    const sql = sqlText(args[0]);
    const values = queryValues(args).filter((value): value is string => typeof value === "string");
    if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
    if (sql.includes("FROM unit_designs") || sql.includes('FROM "unit_designs"')) {
      return [designRecord()];
    }
    if (sql.includes('FROM "question_sessions"')) {
      const session = mocks.state.currentSession;
      return session ? [{ id: session.id, teacherId: session.teacherId }] : [];
    }
    if (sql.includes('FROM "questions"') || sql.includes('FROM "comments"')) return [];
    if (sql.includes('FROM "teacher_classes"')) return [];
    if (sql.includes('FROM "users"')) {
      return values
        .filter((id) => !mocks.state.missingStudentIds.has(id))
        .map((id) => ({ id }));
    }
    return [];
  });
  mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma)
  );
});

describe("질문수업 쓰기 계정 생명주기 경계", () => {
  it("거래 시작 직후 교사 역할이 바뀌면 새 수업을 저장하지 않는다", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      mocks.state.teacherRole = "STUDENT";
      return callback(prisma);
    });

    const response = await createSession(sessionRequest({
      date: "2026-07-14",
      subject: "과학",
      topic: "물질의 변화",
    }));

    expect(response.status).toBe(403);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("교사와 대상 학생 생명주기를 먼저 잠그고 학생 식별값을 정규화해 저장한다", async () => {
    const response = await createSession(sessionRequest({
      date: "2026-07-14",
      subject: "과학",
      topic: "물질의 변화",
      targetType: "STUDENT",
      targetStudentId: "student-1",
      targetStudentIds: ["student-1", "", "student-1"],
    }));

    expect(response.status).toBe(201);
    const lifecycleCallOrders = mocks.queryRaw.mock.calls.flatMap(([query], index) =>
      sqlText(query).includes("pg_advisory_xact_lock")
        ? [mocks.queryRaw.mock.invocationCallOrder[index]]
        : []
    );
    expect(lifecycleCallOrders).toHaveLength(2);
    expect(mocks.sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherId: "teacher-1",
        targetType: "STUDENT",
        targetStudentId: "student-1",
        targetStudentIds: ["student-1"],
      }),
    });
    expect(Math.max(...lifecycleCallOrders)).toBeLessThan(
      mocks.sessionCreate.mock.invocationCallOrder[0],
    );
  });

  it("대상을 전체로 바꾸면 예전 학생 식별값을 모두 지운다", async () => {
    const response = await updateSession(
      sessionRequest({ targetType: "ALL" }, "PATCH"),
      sessionContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({
        targetType: "ALL",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: null,
        targetStudentIds: [],
      }),
    });
  });

  it("학생 목록만 바꾸어도 예전 단일 학생 식별값을 새 대상으로 정규화한다", async () => {
    const response = await updateSession(
      sessionRequest({ targetStudentIds: ["student-new"] }, "PATCH"),
      sessionContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: expect.objectContaining({
        targetType: "STUDENT",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: "student-new",
        targetStudentIds: ["student-new"],
      }),
    });
  });

  it("수정 거래에서 현재 교사 역할이 바뀌면 저장하지 않는다", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      mocks.state.teacherRole = "STUDENT";
      return callback(prisma);
    });

    const response = await updateSession(
      sessionRequest({ topic: "바뀐 주제" }, "PATCH"),
      sessionContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("생명주기 잠금 전에 수업 대상이 바뀌면 새 대상을 잠그지 않은 채 저장하지 않는다", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      mocks.state.currentSession = {
        ...defaultSession(),
        targetStudentId: "student-new",
        targetStudentIds: ["student-new"],
      };
      return callback(prisma);
    });

    const response = await updateSession(
      sessionRequest({ topic: "바뀐 주제" }, "PATCH"),
      sessionContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("수정 거래 안에서 탐구설계 소유가 바뀌면 연결하지 않는다", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      mocks.state.designOwnerId = "teacher-other";
      return callback(prisma);
    });

    const response = await updateSession(
      sessionRequest({ unitDesignId: "design-1" }, "PATCH"),
      sessionContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });
});

describe("탐구설계 수업 생성 거래 경계", () => {
  it("거래 안에서 탐구설계 소유가 바뀌면 수업을 만들지 않는다", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      mocks.state.designOwnerId = "teacher-other";
      return callback(prisma);
    });

    const response = await createSessionFromDesign(
      designRequest({ date: "2026-07-14" }),
      { params: Promise.resolve({ id: "design-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
    expect(mocks.questionCreate).not.toHaveBeenCalled();
  });

  it("수업과 배포 질문을 같은 거래 클라이언트로 저장한다", async () => {
    mocks.state.designInquiryQuestions = [{ type: "conceptual", content: "물질은 왜 변할까?" }];
    const transactionSessionCreate = vi.fn().mockResolvedValue({ id: "session-new" });
    const transactionQuestionCreate = vi.fn().mockResolvedValue({ id: "question-new" });
    mocks.sessionCreate.mockRejectedValue(new Error("거래 밖 저장"));
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback({
        ...prisma,
        questionSession: {
          ...prisma.questionSession,
          create: transactionSessionCreate,
        },
        question: {
          ...prisma.question,
          create: transactionQuestionCreate,
        },
      } as unknown as typeof prisma)
    );

    const response = await createSessionFromDesign(
      designRequest({
        date: "2026-07-14",
        sharedQuestions: [{ type: "conceptual", content: "물질은 왜 변할까?" }],
      }),
      { params: Promise.resolve({ id: "design-1" }) },
    );

    expect(response.status).toBe(201);
    expect(transactionSessionCreate).toHaveBeenCalledTimes(1);
    expect(transactionQuestionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });
});

describe("질문수업 삭제 계정 생명주기 경계", () => {
  it("삭제 거래에서 현재 교사 역할이 바뀌면 수업을 보존한다", async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
      mocks.state.teacherRole = "STUDENT";
      return callback(prisma);
    });

    const response = await deleteSession(
      new Request("http://localhost/api/sessions/session-1", { method: "DELETE" }),
      sessionContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.sessionDelete).not.toHaveBeenCalled();
  });

  it("교사 생명주기를 다른 삭제 대상보다 먼저 잠근다", async () => {
    const response = await deleteSession(
      new Request("http://localhost/api/sessions/session-1", { method: "DELETE" }),
      sessionContext(),
    );

    expect(response.status).toBe(204);
    expect(sqlText(mocks.queryRaw.mock.calls[0]?.[0])).toContain("pg_advisory_xact_lock");
    expect(mocks.sessionDelete).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });
});
