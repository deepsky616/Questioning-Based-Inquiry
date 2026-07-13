import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/points/class-ranks/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockMe = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;

const request = (grade = "5", className = "1") =>
  new NextRequest(`http://localhost/api/points/class-ranks?grade=${grade}&className=${className}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockMe.mockResolvedValue({
    id: "teacher-1",
    role: "TEACHER",
    school: "한빛초",
    grade: null,
    className: null,
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockFindMany.mockResolvedValue([]);
});

describe("학급 점수 순위 접근 경계", () => {
  it("교사는 담당하지 않는 학급의 명단을 조회할 수 없다", async () => {
    const response = await GET(request("5", "2"));

    expect(response.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("담당 학급이 없는 교사는 같은 학교의 요청 학급을 조회할 수 있다", async () => {
    mockMe.mockResolvedValue({
      id: "teacher-1",
      role: "TEACHER",
      school: "한빛초",
      grade: null,
      className: null,
      teacherClasses: [],
    });

    const response = await GET(request("6", "2"));

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { role: "STUDENT", school: "한빛초", grade: "6", className: "2" },
    }));
  });

  it("학생은 요청 주소가 아니라 데이터베이스 본인 학급을 사용한다", async () => {
    mockAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    mockMe.mockResolvedValue({
      id: "student-1",
      role: "STUDENT",
      school: "한빛초",
      grade: "5",
      className: "1",
      teacherClasses: [],
    });

    const response = await GET(request("6", "9"));

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { role: "STUDENT", school: "한빛초", grade: "5", className: "1" },
    }));
  });

  it("학교가 없는 계정은 전역 학급 명단을 조회할 수 없다", async () => {
    mockMe.mockResolvedValue({
      id: "teacher-1",
      role: "TEACHER",
      school: null,
      grade: null,
      className: null,
      teacherClasses: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
