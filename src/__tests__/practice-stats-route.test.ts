import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    pointLog: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { practiceDayStartUtc } from "@/lib/practice-points";
import { GET } from "@/app/api/teacher/practice-stats/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mTeacher = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mStudents = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mLogs = prisma.pointLog.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mTeacher.mockResolvedValue({
    school: "테스트초",
    teacherClasses: [{ grade: "4", className: "1" }],
  });
  mStudents.mockResolvedValue([
    { id: "s2", name: "나학생", grade: "4", className: "1", studentNumber: "10" },
    { id: "s1", name: "가학생", grade: "4", className: "1", studentNumber: "2" },
  ]);
  mLogs.mockResolvedValue([]);
});

describe("학생 연습 현황 API", () => {
  it("교사만 접근할 수 있다 (학생 403, 비로그인 401)", async () => {
    mAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await GET()).status).toBe(403);
  });

  it("오늘/주간 포인트와 모드별 성공 횟수를 학생별로 집계한다", async () => {
    const today = new Date(practiceDayStartUtc().getTime() + 60_000);
    const threeDaysAgo = new Date(practiceDayStartUtc().getTime() - 3 * 24 * 60 * 60 * 1000);
    mLogs.mockResolvedValue([
      { studentId: "s1", bonusType: "PRACTICE_QUIZ", points: 1, createdAt: today },
      { studentId: "s1", bonusType: "PRACTICE_TRANSFORM", points: 3, createdAt: today },
      { studentId: "s1", bonusType: "PRACTICE_CREATE", points: 3, createdAt: threeDaysAgo },
    ]);
    const data = await (await GET()).json();
    const s1 = data.students.find((s: { id: string }) => s.id === "s1");
    expect(s1.todayPoints).toBe(4);
    expect(s1.weekPoints).toBe(7);
    expect(s1.quizCount).toBe(1);
    expect(s1.transformCount).toBe(1);
    expect(s1.createCount).toBe(1);
  });

  it("연습 기록이 없는 학생도 0으로 포함하고 번호순으로 정렬한다", async () => {
    const data = await (await GET()).json();
    expect(data.students).toHaveLength(2);
    // 2번(가학생)이 10번(나학생)보다 먼저 — 숫자 기준 정렬
    expect(data.students[0].name).toBe("가학생");
    expect(data.students[0].weekPoints).toBe(0);
  });

  it("담당 학급이 있으면 해당 학년·반으로 학생을 좁힌다", async () => {
    await GET();
    const where = mStudents.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ grade: "4", className: "1" }]);
    expect(where.school).toBe("테스트초");
  });

  it("학교 미설정 교사는 빈 목록을 받는다", async () => {
    mTeacher.mockResolvedValue({ school: null, teacherClasses: [] });
    const data = await (await GET()).json();
    expect(data.students).toEqual([]);
    expect(mStudents).not.toHaveBeenCalled();
  });
});
