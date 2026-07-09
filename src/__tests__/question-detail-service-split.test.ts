import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const routeSource = readFileSync("src/app/api/questions/[id]/route.ts", "utf8");

describe("question detail route service split", () => {
  it("keeps detail permission and reaction guards in a service module", () => {
    expect(existsSync("src/lib/question-detail-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/question-detail-service.ts", "utf8");

    expect(serviceSource).toContain("canTeacherManageQuestion");
    expect(serviceSource).toContain("getStudentQuestionEditBlockReason");
    expect(serviceSource).toContain("getStudentQuestionDeleteBlockReason");

    expect(routeSource).toContain("canTeacherManageQuestion");
    expect(routeSource).toContain("getStudentQuestionEditBlockReason");
    expect(routeSource).toContain("getStudentQuestionDeleteBlockReason");
    expect(routeSource.split("\n").length).toBeLessThan(225);
  });
});
