import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    teacherClass: { findMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
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
});
