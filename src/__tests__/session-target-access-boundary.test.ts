import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    unitDesign: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    questionSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
    },
    questionLike: {
      findMany: vi.fn(),
    },
    appNotification: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST as createSession } from "@/app/api/sessions/route";
import { PATCH as updateSession } from "@/app/api/sessions/[id]/route";
import { POST as remindSession } from "@/app/api/sessions/[id]/remind/route";
import { GET as getParticipation } from "@/app/api/sessions/[id]/participation/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockUserFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockUnitDesignFindUnique = prisma.unitDesign.findUnique as ReturnType<typeof vi.fn>;
const mockUnitDesignFindFirst = prisma.unitDesign.findFirst as ReturnType<typeof vi.fn>;
const mockSessionFindUnique = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockSessionCreate = prisma.questionSession.create as ReturnType<typeof vi.fn>;
const mockSessionUpdate = prisma.questionSession.update as ReturnType<typeof vi.fn>;
const mockQuestionFindMany = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockCommentFindMany = prisma.comment.findMany as ReturnType<typeof vi.fn>;
const mockLikeFindMany = prisma.questionLike.findMany as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const teacherSession = {
  user: { id: "teacher-1", role: "TEACHER", school: "한빛초" },
};

const teacherScope = {
  role: "TEACHER",
  school: "한빛초",
  teacherClasses: [{ grade: "5", className: "1" }],
};

const otherSchoolStudent = {
  id: "student-other-school",
  role: "STUDENT",
  school: "새봄초",
  grade: "5",
  className: "1",
};

const ownedSession = {
  id: "session-1",
  teacherId: "teacher-1",
  isActive: true,
  date: "2026-07-14",
  subject: "과학",
  topic: "물질의 변화",
  targetType: "ALL",
  targetGrade: null,
  targetClassName: null,
  targetStudentId: null,
  targetStudentIds: [],
  teacher: { name: "시험 교사" },
};

function request(body: Record<string, unknown>, path = "/api/sessions") {
  return new Request(`http://localhost${path}`, {
    method: path === "/api/sessions" ? "POST" : "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context() {
  return { params: Promise.resolve({ id: "session-1" }) };
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-07-14",
    subject: "과학",
    topic: "물질의 변화",
    ...overrides,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function flattenAnd(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  if (!record) return [];
  const nested = Array.isArray(record.AND)
    ? record.AND.flatMap((item) => flattenAnd(item))
    : record.AND
      ? flattenAnd(record.AND)
      : [];
  return [record, ...nested];
}

function hasClassConstraint(record: Record<string, unknown>) {
  if (record.grade === "5" && record.className === "1") return true;
  return Array.isArray(record.OR) && record.OR.some((item) => {
    const branch = asRecord(item);
    return branch?.grade === "5" && branch.className === "1";
  });
}

function hasTargetId(record: Record<string, unknown>, targetId: string) {
  if (record.id === targetId) return true;
  const idFilter = asRecord(record.id);
  return Array.isArray(idFilter?.in) && idFilter.in.includes(targetId);
}

function expectScopedStudentRead(targetId: string) {
  const where = mockUserFindMany.mock.calls.at(-1)?.[0]?.where;
  const conjuncts = flattenAnd(where);
  expect(conjuncts.some((item) => item.role === "STUDENT")).toBe(true);
  expect(conjuncts.some((item) => item.school === "한빛초")).toBe(true);
  expect(conjuncts.some(hasClassConstraint)).toBe(true);
  expect(conjuncts.some((item) => hasTargetId(item, targetId))).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(teacherSession);
  mockUserFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === "teacher-1") return teacherScope;
    if (where.id === otherSchoolStudent.id) return otherSchoolStudent;
    return null;
  });
  mockUserFindMany.mockResolvedValue([]);
  mockUnitDesignFindUnique.mockResolvedValue({
    id: "design-other",
    teacherId: "teacher-other",
  });
  mockUnitDesignFindFirst.mockResolvedValue(null);
  mockQueryRaw.mockResolvedValue([
    { id: "design-other", teacher_id: "teacher-other" },
  ]);
  mockSessionFindUnique.mockResolvedValue(ownedSession);
  mockSessionCreate.mockResolvedValue({ id: "session-new" });
  mockSessionUpdate.mockResolvedValue({ id: "session-1" });
  mockQuestionFindMany.mockResolvedValue([]);
  mockCommentFindMany.mockResolvedValue([]);
  mockLikeFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (callback) => callback(prisma));
});

describe("질문수업 대상 저장 경계", () => {
  it("새 수업의 담당 밖 학급을 저장 전에 거부한다", async () => {
    const response = await createSession(request(validCreateBody({
      targetType: "CLASS",
      targetGrade: "6",
      targetClassName: "2",
    })));

    expect(response.status).toBe(403);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("새 수업의 다른 학교 학생 번호를 저장 전에 거부한다", async () => {
    const response = await createSession(request(validCreateBody({
      targetType: "STUDENT",
      targetStudentId: otherSchoolStudent.id,
      targetStudentIds: [otherSchoolStudent.id],
    })));

    expect(response.status).toBe(403);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("수정할 수업의 담당 밖 학급을 저장 전에 거부한다", async () => {
    const response = await updateSession(
      request({
        targetType: "CLASS",
        targetGrade: "6",
        targetClassName: "2",
      }, "/api/sessions/session-1"),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("수정할 수업의 다른 학교 학생 번호를 저장 전에 거부한다", async () => {
    const response = await updateSession(
      request({
        targetType: "CUSTOM",
        targetStudentIds: [otherSchoolStudent.id],
      }, "/api/sessions/session-1"),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("다른 교사의 탐구설계 번호를 수업에 연결하기 전에 거부한다", async () => {
    const response = await updateSession(
      request({ unitDesignId: "design-other" }, "/api/sessions/session-1"),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });
});

describe("악성 질문수업 대상 조회 경계", () => {
  it("개별 대상 알림 조회에도 교사 학교와 담당 학급을 함께 강제한다", async () => {
    mockSessionFindUnique.mockResolvedValue({
      ...ownedSession,
      targetType: "STUDENT",
      targetStudentId: otherSchoolStudent.id,
    });

    const response = await remindSession(
      new Request("http://localhost/api/sessions/session-1/remind", { method: "POST" }),
      context(),
    );

    expect(response.status).toBe(200);
    expectScopedStudentRead(otherSchoolStudent.id);
  });

  it("일부 대상 알림 조회에도 교사 학교와 담당 학급을 함께 강제한다", async () => {
    mockSessionFindUnique.mockResolvedValue({
      ...ownedSession,
      targetType: "CUSTOM",
      targetStudentIds: [otherSchoolStudent.id],
    });

    const response = await remindSession(
      new Request("http://localhost/api/sessions/session-1/remind", { method: "POST" }),
      context(),
    );

    expect(response.status).toBe(200);
    expectScopedStudentRead(otherSchoolStudent.id);
  });

  it("개별 대상 참여 조회에도 교사 학교와 담당 학급을 함께 강제한다", async () => {
    mockSessionFindUnique.mockResolvedValue({
      ...ownedSession,
      targetType: "STUDENT",
      targetStudentId: otherSchoolStudent.id,
    });

    const response = await getParticipation(
      new Request("http://localhost/api/sessions/session-1/participation"),
      context(),
    );

    expect(response.status).toBe(200);
    expectScopedStudentRead(otherSchoolStudent.id);
  });

  it("일부 대상 참여 조회에도 교사 학교와 담당 학급을 함께 강제한다", async () => {
    mockSessionFindUnique.mockResolvedValue({
      ...ownedSession,
      targetType: "CUSTOM",
      targetStudentIds: [otherSchoolStudent.id],
    });

    const response = await getParticipation(
      new Request("http://localhost/api/sessions/session-1/participation"),
      context(),
    );

    expect(response.status).toBe(200);
    expectScopedStudentRead(otherSchoolStudent.id);
  });

  it("현재 대상 밖 과거 제출자는 참여 현황 제출 수에서 제외한다", async () => {
    mockSessionFindUnique.mockResolvedValue({
      ...ownedSession,
      targetType: "STUDENT",
      targetStudentId: "student-current",
      targetStudentIds: ["student-current"],
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: "student-current",
        name: "현재 학생",
        grade: "5",
        className: "1",
        studentNumber: "1",
      },
    ]);
    mockQuestionFindMany.mockResolvedValue([
      {
        id: "question-old",
        authorId: "student-old",
        content: "예전 제출",
        createdAt: new Date("2026-07-14T00:00:00.000Z"),
      },
    ]);

    const response = await getParticipation(
      new Request("http://localhost/api/sessions/session-1/participation"),
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalStudents).toBe(1);
    expect(body.submittedCount).toBe(0);
    expect(body.students[0].hasQuestion).toBe(false);
  });
});
