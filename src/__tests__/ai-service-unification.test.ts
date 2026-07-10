import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
    // rg 등 외부 도구 없이(CI 러너에 없음) Node로 직접 순회한다
    const pattern = /@google\/generative-ai|new GoogleGenerativeAI|generateContent/;
    const matches: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && pattern.test(readFileSync(path, "utf8"))) matches.push(path);
      }
    };
    for (const dir of ["src/app", "src/components", "src/lib"]) walk(dir);

    expect(matches.sort()).toEqual(["src/lib/ai.ts"]);
  });
});
