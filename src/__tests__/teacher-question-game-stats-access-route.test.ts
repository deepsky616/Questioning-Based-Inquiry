import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    pointLog: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/teacher/question-games/stats/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockTeacher = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mockLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
  mockTeacher.mockResolvedValue({
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockStudents.mockResolvedValue([]);
  mockLogs.mockResolvedValue([]);
});

describe("교사 질문놀이 통계 접근 경계", () => {
  it("로그인 후 교사 역할이 회수되면 현재 자료 범위를 거부한다", async () => {
    mockTeacher.mockResolvedValue({
      role: "STUDENT",
      school: "한빛초",
      teacherClasses: [{ grade: "5", className: "1" }],
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockStudents).not.toHaveBeenCalled();
    expect(mockLogs).not.toHaveBeenCalled();
  });

  it("학생 조회에 교사의 학교와 담당 학급을 함께 적용한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        role: "STUDENT",
        school: "한빛초",
        OR: [{ grade: "5", className: "1" }],
      },
    }));
  });

  it("담당 학급이 없으면 같은 학교 학생 전체를 조회한다", async () => {
    mockTeacher.mockResolvedValue({ role: "TEACHER", school: "한빛초", teacherClasses: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockStudents).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: "STUDENT", school: "한빛초" },
    }));
  });

  it("학교가 없는 교사는 학생 자료를 조회하기 전에 거부한다", async () => {
    mockTeacher.mockResolvedValue({
      role: "TEACHER",
      school: null,
      teacherClasses: [{ grade: "5", className: "1" }],
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockStudents).not.toHaveBeenCalled();
    expect(mockLogs).not.toHaveBeenCalled();
  });

  it("확정된 포인트만 질문놀이 통계에 포함한다", async () => {
    mockStudents.mockResolvedValue([
      { id: "student-1", name: "학생", studentNumber: "1" },
    ]);

    await GET();

    expect(mockLogs).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "APPROVED" }),
    }));
  });

  it("혼자·도움 실행과 상한에 걸린 친구 방을 실제 놀이의 완료 한 판으로 집계한다", async () => {
    mockStudents.mockResolvedValue([
      { id: "student-1", name: "학생1", studentNumber: "1" },
      { id: "student-2", name: "학생2", studentNumber: "2" },
    ]);
    mockLogs.mockResolvedValue([
      {
        studentId: "student-1",
        gameId: "ACTIVITY_SOLO",
        bonusType: "ACTIVITY_SOLO_relay",
        points: 4,
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
      },
      {
        studentId: "student-1",
        gameId: "ACTIVITY_AI",
        bonusType: "ACTIVITY_AI_dice",
        points: 7,
        createdAt: new Date("2026-07-17T01:00:00.000Z"),
      },
      {
        studentId: "student-1",
        gameId: "relay",
        bonusType: "FRIEND_DAILY_LIMIT",
        points: 0,
        createdAt: new Date("2026-07-17T02:00:00.000Z"),
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.byGame).not.toHaveProperty("ACTIVITY_SOLO");
    expect(body.byGame).not.toHaveProperty("ACTIVITY_AI");
    expect(body.byGame.relay).toEqual(expect.objectContaining({
      participants: 1,
      plays: 2,
      completions: 2,
      lastPlayedAt: "2026-07-17T02:00:00.000Z",
    }));
    expect(body.byGame.relay.students).toEqual([
      expect.objectContaining({
        id: "student-1",
        plays: 2,
        completions: 2,
        points: 4,
      }),
    ]);
    expect(body.byGame.dice.students).toEqual([
      expect.objectContaining({
        id: "student-1",
        plays: 1,
        completions: 1,
        points: 7,
      }),
    ]);
  });
});
