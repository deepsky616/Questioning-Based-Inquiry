import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const pointAwardRoute = readFileSync("src/app/api/points/award/route.ts", "utf8");
const publishRoute = readFileSync("src/app/api/sessions/[id]/publish-questions/route.ts", "utf8");

describe("award and publish route service split", () => {
  it("keeps point award logic in a service module", () => {
    expect(existsSync("src/lib/point-award-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/point-award-service.ts", "utf8");
    expect(serviceSource).toContain("awardGamePoints");
    expect(serviceSource).toContain("buildAwardList");
    expect(pointAwardRoute).toContain("awardGamePoints");
    expect(pointAwardRoute.split("\n").length).toBeLessThan(90);
  });

  it("keeps published inquiry question logic in a service module", () => {
    expect(existsSync("src/lib/publish-questions-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/publish-questions-service.ts", "utf8");
    expect(serviceSource).toContain("getPublishedQuestions");
    expect(serviceSource).toContain("publishQuestionsToSession");
    expect(serviceSource).toContain("deletePublishedQuestions");
    expect(publishRoute).toContain("publishQuestionsToSession");
    expect(publishRoute.split("\n").length).toBeLessThan(120);
  });
});
