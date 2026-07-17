import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    pointLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/teacher/points/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockUserFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockUserUpdate = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const mockPointLogCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

type TeacherRow = {
  role: string;
  school: string | null;
  teacherClasses: Array<{ grade: string; className: string }>;
};

type TargetRow = {
  id: string;
  role: string;
  school: string | null;
  grade: string | null;
  className: string | null;
  totalPoints: number;
};

const request = (studentId = "student-1", points = 3) =>
  new NextRequest("http://localhost/api/teacher/points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId, points, reason: "질문 참여" }),
  });

const baseTeacher: TeacherRow = {
  role: "TEACHER",
  school: "한빛초",
  teacherClasses: [{ grade: "5", className: "1" }],
};

const baseStudent: TargetRow = {
  id: "student-1",
  role: "STUDENT",
  school: "한빛초",
  grade: "5",
  className: "1",
  totalPoints: 10,
};

function mockUsers(teacher: TeacherRow, target: TargetRow | null) {
  mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
    if (where.id === "teacher-1") return Promise.resolve(teacher);
    if (where.id === "student-1") return Promise.resolve(target);
    return Promise.resolve(null);
  });
}

function expectNoPointWrite() {
  expect(mockPointLogCreate).not.toHaveBeenCalled();
  expect(mockUserUpdate).not.toHaveBeenCalled();
  expect(mockTransaction).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockPointLogCreate.mockResolvedValue({ id: "point-1" });
  mockUserFindMany.mockResolvedValue([]);
  mockUserUpdate.mockResolvedValue({ id: "student-1" });
  mockQueryRaw.mockResolvedValue([{ id: "student-1" }]);
  mockTransaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") return input(prisma);
    return Promise.all(input as Promise<unknown>[]);
  });
  mockUsers(baseTeacher, baseStudent);
});

describe("교사 수동 점수 변경 권한", () => {
  it("다른 학교 학생은 점수를 쓰기 전에 거부한다", async () => {
    mockUsers(baseTeacher, { ...baseStudent, school: "새봄초" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expectNoPointWrite();
  });

  it("담당 학급 밖 학생은 점수를 쓰기 전에 거부한다", async () => {
    mockUsers(baseTeacher, { ...baseStudent, className: "2" });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expectNoPointWrite();
  });

  it("학생이 아닌 계정은 점수를 쓰기 전에 찾을 수 없음으로 처리한다", async () => {
    mockUsers(baseTeacher, { ...baseStudent, role: "TEACHER" });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expectNoPointWrite();
  });

  it("세션은 교사여도 현재 계정 역할이 학생이면 수동 변경을 403으로 거부한다", async () => {
    mockUsers({ ...baseTeacher, role: "STUDENT" }, baseStudent);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expectNoPointWrite();
  });

  it("세션은 교사여도 현재 계정 역할이 학생이면 목록 조회를 403으로 거부한다", async () => {
    mockUsers({ ...baseTeacher, role: "STUDENT" }, baseStudent);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("같은 학교의 담당 학급 학생은 점수 변경을 허용한다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("담당 학급이 비어 있으면 같은 학교 학생의 점수 변경을 허용한다", async () => {
    mockUsers({ ...baseTeacher, teacherClasses: [] }, baseStudent);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("사전 확인 뒤 교사 역할이 회수되면 거래 안에서 다시 확인해 점수를 쓰지 않는다", async () => {
    let inTransaction = false;
    mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "teacher-1") {
        return Promise.resolve(
          inTransaction ? { ...baseTeacher, role: "STUDENT" } : baseTeacher,
        );
      }
      if (where.id === "student-1") return Promise.resolve(baseStudent);
      return Promise.resolve(null);
    });
    mockTransaction.mockImplementation(async (input: unknown) => {
      if (typeof input !== "function") return Promise.all(input as Promise<unknown>[]);
      inTransaction = true;
      try {
        return await input(prisma);
      } finally {
        inTransaction = false;
      }
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(mockPointLogCreate).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("총점 오 점에서 동시 회수 두 건을 잠금 순서대로 다시 계산해 음수를 만들지 않는다", async () => {
    let totalPoints = 5;
    let transactionOpen = false;
    let transactionTail = Promise.resolve();
    const events: string[] = [];
    const ledgerPoints: number[] = [];
    const balances: number[] = [];

    mockUserFindUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === "teacher-1") {
        if (transactionOpen) events.push("read:teacher");
        return Promise.resolve(baseTeacher);
      }
      if (where.id === "student-1") {
        if (transactionOpen) events.push(`read:${totalPoints}`);
        return Promise.resolve({ ...baseStudent, totalPoints });
      }
      return Promise.resolve(null);
    });
    mockQueryRaw.mockImplementation(async (query: { sql: string; values: unknown[] }) => {
      if (query.sql.includes('FROM "teacher_classes"')) {
        events.push("lock:classes");
      } else if (query.values.includes("teacher-1")) {
        events.push("lock:teacher");
      } else {
        events.push("lock:student");
      }
      return [{ id: "student-1" }];
    });
    mockPointLogCreate.mockImplementation(async ({ data }: { data: { points: number } }) => {
      ledgerPoints.push(data.points);
      events.push(`log:${data.points}`);
      return { id: `point-${ledgerPoints.length}` };
    });
    mockUserUpdate.mockImplementation(async ({ data }: {
      data: { totalPoints: { increment: number } };
    }) => {
      const increment = data.totalPoints.increment;
      totalPoints += increment;
      balances.push(totalPoints);
      events.push(`update:${increment}`);
      return { id: "student-1", totalPoints };
    });
    mockTransaction.mockImplementation((input: unknown) => {
      if (typeof input !== "function") {
        return Promise.all(input as Promise<unknown>[]);
      }
      const previous = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      return (async () => {
        await previous;
        transactionOpen = true;
        try {
          return await input(prisma);
        } finally {
          transactionOpen = false;
          release();
        }
      })();
    });

    const responses = await Promise.all([
      POST(request("student-1", -5)),
      POST(request("student-1", -5)),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies.map((body) => body.adjusted).sort((a, b) => a - b)).toEqual([-5, 0]);
    expect(totalPoints).toBe(0);
    expect(balances.every((balance) => balance >= 0)).toBe(true);
    expect(ledgerPoints).toEqual([-5, 0]);
    expect(events).toEqual([
      "lock:teacher", "lock:classes", "read:teacher", "lock:student",
      "read:5", "log:-5", "update:-5",
      "lock:teacher", "lock:classes", "read:teacher", "lock:student",
      "read:0", "log:0", "update:0",
    ]);
  });
});
