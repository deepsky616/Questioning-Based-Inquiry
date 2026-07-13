import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    pointLog: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
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
const mAttempts = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

const attempt = (
  id: string,
  studentId = "s1",
  createdAt = new Date("2026-07-13T01:00:00Z"),
  overrides: Record<string, unknown> = {},
) => ({
  id,
  studentId,
  mode: "quiz",
  itemId: "q01",
  quizType: "closure",
  correct: true,
  createdAt,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
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
  mAttempts.mockResolvedValue([]);
});

describe("학생 연습 현황 API", () => {
  it("교사만 접근할 수 있다", async () => {
    mAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await GET()).status).toBe(403);
  });

  it("오늘과 주간 포인트, 성공 횟수, 최근 진단을 함께 집계한다", async () => {
    const today = new Date(practiceDayStartUtc().getTime() + 60_000);
    const threeDaysAgo = new Date(practiceDayStartUtc().getTime() - 3 * 24 * 60 * 60 * 1000);
    mLogs.mockResolvedValue([
      { studentId: "s1", bonusType: "PRACTICE_QUIZ", points: 1, createdAt: today },
      { studentId: "s1", bonusType: "PRACTICE_TRANSFORM", points: 3, createdAt: today },
      { studentId: "s1", bonusType: "PRACTICE_CREATE", points: 3, createdAt: threeDaysAgo },
    ]);
    mAttempts.mockResolvedValue([attempt("a1")]);

    const data = await (await GET()).json();
    const s1 = data.students.find((student: { id: string }) => student.id === "s1");

    expect(data.summary).toMatchObject({ activityAttempts: 1, diagnosticAttempts: 1 });
    expect(s1).toMatchObject({
      todayPoints: 4,
      weekPoints: 7,
      quizCount: 1,
      transformCount: 1,
      createCount: 1,
      activityAttempts: 1,
      diagnosticAttempts: 1,
      capped: false,
    });
  });

  it("연습 기록이 없는 학생도 영으로 포함하고 번호순으로 정렬한다", async () => {
    const data = await (await GET()).json();

    expect(data.students).toHaveLength(2);
    expect(data.students[0].name).toBe("가학생");
    expect(data.students[0]).toMatchObject({
      weekPoints: 0,
      activityAttempts: 0,
      diagnosticAttempts: 0,
      capped: false,
    });
  });

  it("담당 학급이 있으면 해당 학년과 반으로 학생을 좁힌다", async () => {
    await GET();

    const where = mStudents.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ grade: "4", className: "1" }]);
    expect(where.school).toBe("테스트초");
  });

  it("최근 서른 날의 담당 학생을 학생마다 백한 개까지 안정된 순서로 조회한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));

    await GET();

    expect(mAttempts).toHaveBeenCalledTimes(1);
    const query = mAttempts.mock.calls[0][0] as {
      text: string;
      values: unknown[];
    };
    expect(query.text).toContain("ROW_NUMBER() OVER");
    expect(query.text).toContain("PARTITION BY student_id ORDER BY created_at DESC, id DESC");
    expect(query.text).toContain("row_number <= 101");
    expect(query.text).toContain("ORDER BY created_at DESC, id DESC");
    expect(query.values).toEqual(
      expect.arrayContaining(["s1", "s2", new Date("2026-06-13T12:00:00Z")]),
    );
  });

  it("원시 조회에 섞인 담당 밖 학생 행은 응용 코드에서 다시 제외한다", async () => {
    mAttempts.mockResolvedValue([
      attempt("allowed", "s1"),
      attempt("outside", "not-assigned"),
    ]);

    const data = await (await GET()).json();

    expect(data.summary.activityAttempts).toBe(1);
    expect(data.students.find((student: { id: string }) => student.id === "s1")).toMatchObject({
      activityAttempts: 1,
      diagnosticAttempts: 1,
    });
    expect(data.students.some((student: { id: string }) => student.id === "not-assigned")).toBe(false);
  });

  it("학생별 백한 번째 시도는 상한 판단에만 쓰고 앞 백 개만 학급 진단에 합친다", async () => {
    mStudents.mockResolvedValue([
      { id: "s1", name: "가학생", grade: "4", className: "1", studentNumber: "2" },
    ]);
    mAttempts.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) =>
        attempt(
          `a-${String(index).padStart(3, "0")}`,
          "s1",
          new Date("2026-07-13T01:00:00Z"),
          { itemId: `raw-${index}`, correct: index !== 0 },
        ),
      ),
    );

    const data = await (await GET()).json();

    expect(data.summary.activityAttempts).toBe(100);
    expect(data.summary).toMatchObject({ diagnosticAttempts: 100 });
    expect(data.summary.overall).toMatchObject({ attempts: 100, correct: 100, accuracy: 100 });
    expect(data.students[0]).toMatchObject({
      activityAttempts: 100,
      diagnosticAttempts: 100,
      capped: true,
    });
  });

  it("학교가 없어도 같은 빈 성공 응답 모양을 유지한다", async () => {
    mTeacher.mockResolvedValue({ school: null, teacherClasses: [] });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      summary: { activityAttempts: 0, diagnosticAttempts: 0 },
      students: [],
    });
    expect(mStudents).not.toHaveBeenCalled();
    expect(mAttempts).not.toHaveBeenCalled();
  });

  it("담당 학생이 없어도 같은 빈 성공 응답 모양을 유지한다", async () => {
    mStudents.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { activityAttempts: 0, diagnosticAttempts: 0 },
      students: [],
    });
    expect(mAttempts).not.toHaveBeenCalled();
  });
});
