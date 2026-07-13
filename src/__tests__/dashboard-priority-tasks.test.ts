import { describe, expect, it } from "vitest";
import {
  buildStudentPriorityCounts,
  buildTeacherPriorityCounts,
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
      { key: "todayUnasked", count: 1 },
      { key: "pastUnasked", count: 1 },
    ]);
  });
});
