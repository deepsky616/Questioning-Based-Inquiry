import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/(student)/student-dashboard/page.tsx", "utf8");
const taskCardPath = "src/app/(student)/student-dashboard/StudentDashboardTasksCard.tsx";
const taskCardSource = readFileSync(taskCardPath, "utf8");

describe("student dashboard split", () => {
  it("할 일 영역을 전용 구성 요소와 공통 우선순위 목록으로 표시한다", () => {
    expect(existsSync(taskCardPath)).toBe(true);
    expect(pageSource).toContain("StudentDashboardTasksCard");
    expect(pageSource).not.toContain("visibleTeacherRequests.map");
    expect(taskCardSource).toContain("PriorityTaskList");
    expect(taskCardSource).not.toContain("progressPercent");
  });

  it("학생에게 바로 필요한 세 항목만 집계한다", () => {
    expect(pageSource).toContain("buildStudentPriorityCounts");
    expect(pageSource).not.toContain('key: "futureUnasked"');
    expect(pageSource).not.toContain('key: "shared"');
    expect(pageSource).not.toContain('key: "comments"');
    expect(pageSource).not.toContain('key: "points"');
    expect(pageSource).not.toContain('queryKey: ["student-dashboard-points"');
    expect(pageSource).not.toContain("highlightPoints");
    expect(pageSource).not.toContain("pointsSectionRef");
  });

  it("질문과 수업과 알림 조회가 모두 성공한 뒤에만 준비 상태가 된다", () => {
    expect(pageSource).toContain("questionsQuery.isSuccess");
    expect(pageSource).toContain("sessionsQuery.isSuccess");
    expect(pageSource).toContain("notificationQuery.isSuccess");
    expect(pageSource).toContain('taskStatus: "loading" | "ready" | "error"');
    expect(taskCardSource).toContain('status: "loading" | "ready" | "error"');
    expect(taskCardSource).toContain('status === "ready"');
    expect(taskCardSource).toContain('status === "error"');
  });

  it("첫 요청 수업의 중복 알림을 모두 읽고 첫 주소로 이동한다", () => {
    expect(pageSource).toContain("firstTeacherRequestGroup");
    expect(pageSource).toContain("Promise.all(");
    expect(pageSource).toContain("firstTeacherRequestGroup.map((item) => markNotificationRead(item.id))");
    expect(pageSource).toContain("firstTeacherRequest.href ??");
  });
});
