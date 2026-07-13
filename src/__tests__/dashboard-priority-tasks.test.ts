import { describe, expect, it } from "vitest";
import {
  buildStudentPriorityCounts,
  buildTeacherPriorityCounts,
  selectActionableSessionReminders,
} from "@/lib/dashboard-priority-tasks";

describe("dashboard priority tasks", () => {
  it("교사 할 일을 정해진 우선순위로 집계한다", () => {
    expect(
      buildTeacherPriorityCounts({
        flaggedCount: 2,
        pendingPointCount: 4,
        students: [
          { id: "s1", hasQuestion: false, remainingSessionCount: 1 },
          { id: "s2", hasQuestion: true, remainingSessionCount: 2 },
        ],
      }),
    ).toEqual([
      { key: "flagged", count: 2 },
      { key: "points", count: 4 },
      { key: "attention", count: 2 },
    ]);
  });

  it("학생의 교사 요청은 수업별로 한 번만 세고 미작성 수업과 겹치지 않게 집계한다", () => {
    expect(
      buildStudentPriorityCounts({
        teacherRequests: [
          { id: "n1", sessionId: "today-1" },
          { id: "n2", sessionId: "today-1" },
        ],
        todayUnaskedSessionIds: ["today-1", "today-2"],
        pastUnaskedSessionIds: ["past-1"],
      }),
    ).toEqual([
      { key: "teacherRequest", count: 1 },
      { key: "pastUnasked", count: 1 },
    ]);
  });

  it("모든 우선 확인 값이 0이면 빈 목록을 반환한다", () => {
    expect(
      buildTeacherPriorityCounts({
        flaggedCount: 0,
        pendingPointCount: 0,
        students: [],
      }),
    ).toEqual([]);
    expect(
      buildStudentPriorityCounts({
        teacherRequests: [],
        todayUnaskedSessionIds: [],
        pastUnaskedSessionIds: [],
      }),
    ).toEqual([]);
  });

  it("같은 교사 학생은 지도 필요 조건이 겹쳐도 한 번만 센다", () => {
    expect(
      buildTeacherPriorityCounts({
        flaggedCount: 0,
        pendingPointCount: 0,
        students: [
          { id: "s1", hasQuestion: false, remainingSessionCount: 0 },
          { id: "s1", hasQuestion: true, remainingSessionCount: 2 },
        ],
      }),
    ).toEqual([{ key: "attention", count: 1 }]);
  });

  it("수업 식별값이 없는 요청은 알림 식별값으로 겹침을 제거한다", () => {
    expect(
      buildStudentPriorityCounts({
        teacherRequests: [
          { id: "n1", sessionId: null },
          { id: "n1" },
          { id: "n2", sessionId: null },
        ],
        todayUnaskedSessionIds: [],
        pastUnaskedSessionIds: [],
      }),
    ).toEqual([{ key: "teacherRequest", count: 2 }]);
  });

  it("오늘 미작성 수업은 일정 줄로 넘기고 지난 목록과도 겹치지 않게 센다", () => {
    expect(
      buildStudentPriorityCounts({
        teacherRequests: [],
        todayUnaskedSessionIds: ["shared", "today"],
        pastUnaskedSessionIds: ["shared", "past"],
      }),
    ).toEqual([{ key: "pastUnasked", count: 1 }]);
  });

  it("현재 배정된 활성 수업의 미작성 요청만 학생 할 일로 고른다", () => {
    const result = selectActionableSessionReminders({
      reminders: [
        { id: "current", sessionId: "session-current", href: "/current" },
        { id: "removed", sessionId: "session-removed", href: "/removed" },
        { id: "completed", sessionId: "session-completed", href: "/completed" },
        { id: "missing", sessionId: null, href: "/missing" },
      ],
      availableSessionIds: new Set(["session-current", "session-completed"]),
      completedSessionIds: new Set(["session-completed"]),
    });

    expect(result).toEqual([
      { id: "current", sessionId: "session-current", href: "/current" },
    ]);
  });
});
