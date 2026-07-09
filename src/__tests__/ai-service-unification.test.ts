import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const bulkAiAnswersRoute = readFileSync("src/app/api/questions/bulk-ai-answers/route.ts", "utf8");
const unitSequenceRoute = readFileSync("src/app/api/unit-design/sequence/route.ts", "utf8");
const pointAwardService = readFileSync("src/lib/point-award-service.ts", "utf8");
const translateService = readFileSync("src/lib/translate.ts", "utf8");
const geminiTestRoute = readFileSync("src/app/api/gemini/test/route.ts", "utf8");
const aiService = readFileSync("src/lib/ai.ts", "utf8");

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

  it("keeps translation and Gemini connection tests on the shared AI service", () => {
    expect(aiService).toContain("generateJsonArray");
    expect(translateService).toContain("generateJsonArray");
    expect(translateService).not.toContain("@google/generative-ai");
    expect(translateService).not.toContain("new GoogleGenerativeAI");

    expect(geminiTestRoute).toContain("generateText");
    expect(geminiTestRoute).not.toContain("@google/generative-ai");
    expect(geminiTestRoute).not.toContain("new GoogleGenerativeAI");
  });

  it("does not leave direct Gemini SDK imports outside the shared AI service", () => {
    const matches = execSync("rg -l '@google/generative-ai|new GoogleGenerativeAI|generateContent' src/app src/components src/lib", {
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(matches).toEqual(["src/lib/ai.ts"]);
  });
});
