import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    teacherClass: { findMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    unitDesign: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/sessions/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mTeacherFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mTeacherClassFindMany = prisma.teacherClass.findMany as unknown as ReturnType<typeof vi.fn>;
const mSessionFindMany = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const mUnitDesignFindMany = prisma.unitDesign.findMany as unknown as ReturnType<typeof vi.fn>;

function containsSchoolScope(value: unknown, school: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSchoolScope(item, school));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.school === school) return true;
  return Object.values(record).some((item) => containsSchoolScope(item, school));
}

function containsTeacherWithoutClassesScope(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsTeacherWithoutClassesScope);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const teacherClasses = record.teacherClasses;
  if (teacherClasses && typeof teacherClasses === "object" && "none" in teacherClasses) {
    return true;
  }
  return Object.values(record).some(containsTeacherWithoutClassesScope);
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({
    user: {
      id: "student-1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
    },
  });
  mUserFind.mockResolvedValue({
    id: "student-1",
    school: "한빛초",
    grade: "5",
    className: "1",
  });
  mTeacherFindMany.mockResolvedValue([]);
  // 현재 구현처럼 학년·반만 찾으면 다른 학교 교사도 섞일 수 있다.
  mTeacherClassFindMany.mockResolvedValue([
    { teacherId: "teacher-same-school" },
    { teacherId: "teacher-other-school" },
  ]);
  mSessionFindMany.mockResolvedValue([]);
  mUnitDesignFindMany.mockResolvedValue([]);
});

describe("학생 질문수업 목록 권한", () => {
  it("알 수 없는 역할은 질문수업을 조회하기 전에 거부한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "unknown-1", role: "UNKNOWN" } });

    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(403);
    expect(mUserFind).not.toHaveBeenCalled();
    expect(mSessionFindMany).not.toHaveBeenCalled();
  });

  it("같은 학년 반이라도 같은 학교 교사의 수업만 조회하도록 학교 조건을 강제한다", async () => {
    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(200);
    const teacherClassQuery = mTeacherClassFindMany.mock.calls[0]?.[0]?.where;
    const sessionQuery = mSessionFindMany.mock.calls[0]?.[0]?.where;
    expect(containsSchoolScope([teacherClassQuery, sessionQuery], "한빛초")).toBe(true);
  });

  it("학교 정보가 없으면 교사나 수업을 조회하지 않는다", async () => {
    mUserFind.mockResolvedValue({
      id: "student-1",
      school: null,
      grade: "5",
      className: "1",
    });

    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mTeacherClassFindMany).not.toHaveBeenCalled();
    expect(mSessionFindMany).not.toHaveBeenCalled();
  });

  it("담당 학급이 없는 같은 학교 교사의 전체 대상 수업도 학생 목록에 포함한다", async () => {
    mTeacherClassFindMany.mockResolvedValue([]);
    mTeacherFindMany.mockResolvedValue([{ id: "teacher-school-wide" }]);
    mSessionFindMany.mockResolvedValue([
      {
        id: "session-school-wide",
        teacherId: "teacher-school-wide",
        targetType: "ALL",
        teacher: { name: "학교 전체 교사" },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "session-school-wide", targetType: "ALL" }),
    ]);
    const teacherQuery = mTeacherFindMany.mock.calls[0]?.[0]?.where;
    const teacherClassQuery = mTeacherClassFindMany.mock.calls[0]?.[0]?.where;
    const sessionQuery = mSessionFindMany.mock.calls[0]?.[0]?.where;
    const accessQueries = [teacherQuery, teacherClassQuery, sessionQuery];
    expect(containsSchoolScope(accessQueries, "한빛초")).toBe(true);
    expect(containsTeacherWithoutClassesScope(accessQueries)).toBe(true);
  });

  it("학생 질문 화면에서 탐구질문 수업의 개별 학년을 함께 반환한다", async () => {
    mTeacherFindMany.mockResolvedValue([{ id: "teacher-1" }]);
    mSessionFindMany.mockResolvedValue([
      {
        id: "session-1",
        date: "2026-07-28",
        subject: "수학",
        topic: "6. 평면도형의 둘레와 넓이",
        unitDesignId: "design-1",
        targetGrade: null,
        teacher: { name: "김교사" },
      },
    ]);
    mUnitDesignFindMany.mockResolvedValue([{ id: "design-1", grade: "5" }]);

    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "session-1", grade: "5" }),
    ]);
  });

  it("일반 질문수업은 현재 학생의 학년을 보완해 반환한다", async () => {
    mTeacherFindMany.mockResolvedValue([{ id: "teacher-1" }]);
    mSessionFindMany.mockResolvedValue([
      {
        id: "session-2",
        date: "2026-07-28",
        subject: "국어",
        topic: "이야기 읽기",
        unitDesignId: null,
        targetGrade: null,
        teacher: { name: "김교사" },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "session-2", grade: "5" }),
    ]);
    expect(mUnitDesignFindMany).not.toHaveBeenCalled();
  });
});

describe("교사 질문수업 목록 학년", () => {
  it("탐구질문 수업은 연결된 단원 설계의 개별 학년을 반환한다", async () => {
    mAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    mUserFind.mockResolvedValue({
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });
    mSessionFindMany.mockResolvedValue([
      {
        id: "session-1",
        date: "2026-07-28",
        subject: "수학",
        topic: "6. 평면도형의 둘레와 넓이",
        unitDesignId: "design-1",
        targetGrade: null,
        teacher: { name: "김교사" },
      },
    ]);
    mUnitDesignFindMany.mockResolvedValue([{ id: "design-1", grade: "5" }]);

    const response = await GET(new Request("http://localhost/api/sessions"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "session-1", grade: "5" }),
    ]);
    expect(mUnitDesignFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["design-1"] }, teacherId: "teacher-1" },
      select: { id: true, grade: true },
    });
  });
});
