import { describe, expect, it } from "vitest";
import {
  buildDashboardQuestionClassSchedule,
  localDateKey,
} from "@/lib/dashboard-question-class-schedule";

const sessions = [
  {
    id: "past",
    date: "2026-07-12",
    subject: "국어",
    topic: "지난 수업",
    isActive: true,
  },
  {
    id: "today-complete",
    date: "2026-07-13",
    subject: "과학",
    topic: "완료한 수업",
    isActive: true,
  },
  {
    id: "today-needed",
    date: "2026-07-13",
    subject: "사회",
    topic: "질문할 수업",
    isActive: true,
  },
  {
    id: "near-future",
    date: "2026-07-15",
    subject: "수학",
    topic: "가까운 예정 수업",
    isActive: true,
  },
  {
    id: "inactive-today",
    date: "2026-07-13",
    subject: "영어",
    topic: "비활성 수업",
    isActive: false,
  },
  {
    id: "invalid",
    date: "2026-02-30",
    subject: "음악",
    topic: "잘못된 날짜",
    isActive: true,
  },
];

describe("대시보드 질문수업 일정", () => {
  it("활성 오늘 수업만 세고 질문이 필요한 수업을 대표로 고른다", () => {
    const result = buildDashboardQuestionClassSchedule({
      sessions,
      today: "2026-07-13",
      completedSessionIds: new Set(["today-complete"]),
    });

    expect(result.kind).toBe("today");
    expect(result.date).toBe("2026-07-13");
    expect(result.totalCount).toBe(2);
    expect(result.needsQuestionCount).toBe(1);
    expect(result.primarySession?.id).toBe("today-needed");
  });

  it("오늘 수업이 없으면 지난 수업과 비활성 수업을 빼고 가장 가까운 예정일을 고른다", () => {
    const result = buildDashboardQuestionClassSchedule({
      sessions: [
        ...sessions,
        {
          id: "far-future",
          date: "2026-07-20",
          subject: "미술",
          topic: "먼 예정 수업",
          isActive: true,
        },
      ],
      today: "2026-07-14",
    });

    expect(result.kind).toBe("upcoming");
    expect(result.date).toBe("2026-07-15");
    expect(result.totalCount).toBe(1);
    expect(result.needsQuestionCount).toBeNull();
    expect(result.primarySession?.id).toBe("near-future");
  });

  it("오늘과 예정 수업이 없으면 빈 일정을 반환한다", () => {
    const result = buildDashboardQuestionClassSchedule({
      sessions,
      today: "2026-07-21",
    });

    expect(result).toMatchObject({
      kind: "empty",
      date: null,
      totalCount: 0,
      needsQuestionCount: null,
      primarySession: null,
    });
  });

  it("현지 날짜를 날짜 이동 없이 일정 식별값으로 바꾼다", () => {
    expect(localDateKey(new Date(2026, 6, 13, 23, 30))).toBe("2026-07-13");
  });
});
