import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const pageSource = readFileSync("src/app/(student)/student-dashboard/page.tsx", "utf8");
const taskCardPath = "src/app/(student)/student-dashboard/StudentDashboardTasksCard.tsx";

describe("student dashboard split", () => {
  it("keeps the task panel in a dedicated component instead of the page file", () => {
    expect(existsSync(taskCardPath)).toBe(true);
    expect(pageSource).toContain("StudentDashboardTasksCard");
    expect(pageSource).not.toContain("visibleTeacherRequests.map");
  });
});
