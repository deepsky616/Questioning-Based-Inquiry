import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const routeSource = readFileSync("src/app/api/questions/[id]/route.ts", "utf8");

describe("question detail route service split", () => {
  it("keeps detail permission and reaction guards in a service module", () => {
    expect(existsSync("src/lib/question-detail-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/question-detail-service.ts", "utf8");

    expect(serviceSource).toContain("canTeacherManageQuestion");
    expect(serviceSource).toContain("canEditQuestionForUser");
    expect(serviceSource).toContain("canDeleteQuestionForUser");
    expect(serviceSource).toContain("getStudentQuestionEditBlockReason");
    expect(serviceSource).toContain("getStudentQuestionDeleteBlockReason");
    expect(serviceSource).toContain("updateQuestionWithGuard");
    expect(serviceSource).toContain("deleteQuestionWithGuard");

    expect(routeSource).toContain("canEditQuestionForUser");
    expect(routeSource).toContain("canDeleteQuestionForUser");
    expect(routeSource).toContain("updateQuestionWithGuard");
    expect(routeSource).toContain("deleteQuestionWithGuard");
    expect(routeSource.split("\n").length).toBeLessThan(225);
  });
});
