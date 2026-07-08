import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const routeSource = readFileSync("src/app/api/questions/route.ts", "utf8");

describe("question route service split", () => {
  it("keeps question list and create logic in a service module", () => {
    expect(existsSync("src/lib/question-route-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/question-route-service.ts", "utf8");

    expect(serviceSource).toContain("listQuestionsForUser");
    expect(serviceSource).toContain("createQuestionForUser");
    expect(routeSource).toContain("listQuestionsForUser");
    expect(routeSource).toContain("createQuestionForUser");
    expect(routeSource.split("\n").length).toBeLessThan(120);
  });
});
