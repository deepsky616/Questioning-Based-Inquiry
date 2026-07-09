import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const bulkAiAnswersRoute = readFileSync("src/app/api/questions/bulk-ai-answers/route.ts", "utf8");
const unitSequenceRoute = readFileSync("src/app/api/unit-design/sequence/route.ts", "utf8");
const pointAwardService = readFileSync("src/lib/point-award-service.ts", "utf8");

describe("AI service unification", () => {
  it("keeps bulk answer generation on the shared AI service", () => {
    expect(bulkAiAnswersRoute).toContain("generateText");
    expect(bulkAiAnswersRoute).not.toContain("@google/generative-ai");
    expect(bulkAiAnswersRoute).not.toContain("new GoogleGenerativeAI");
  });

  it("keeps unit sequence generation on the shared AI service", () => {
    expect(unitSequenceRoute).toContain("generateJson");
    expect(unitSequenceRoute).toContain("quality: true");
    expect(unitSequenceRoute).not.toContain("@google/generative-ai");
    expect(unitSequenceRoute).not.toContain("new GoogleGenerativeAI");
  });

  it("keeps point award analysis on the shared AI service", () => {
    expect(pointAwardService).toContain("generateJson");
    expect(pointAwardService).toContain("systemInstruction: AI_SYSTEM");
    expect(pointAwardService).not.toContain("@google/generative-ai");
    expect(pointAwardService).not.toContain("new GoogleGenerativeAI");
  });
});
