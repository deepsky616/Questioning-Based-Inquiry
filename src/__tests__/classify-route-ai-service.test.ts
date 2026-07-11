import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("src/app/api/classify/route.ts", "utf8");

describe("classify route AI service integration", () => {
  it("uses the shared AI service instead of constructing the Gemini client directly", () => {
    expect(routeSource).toContain("generateJsonWithMetadata");
    expect(routeSource).toContain("AiKeyMissingError");
    expect(routeSource).toContain("quality: true");
    expect(routeSource).not.toContain("@google/generative-ai");
    expect(routeSource).not.toContain("new GoogleGenerativeAI");
    expect(routeSource).not.toContain("@google/genai");
    expect(routeSource).not.toContain("new GoogleGenAI");
  });
});
