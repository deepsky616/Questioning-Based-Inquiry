import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
const getGenerativeModel = vi.hoisted(() => vi.fn(() => ({ generateContent })));
const aiState = vi.hoisted(() => ({ apiKey: "k" as string | null, model: "gemini-2.5-flash" }));

vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn(async () => ({ ...aiState })) }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModel;
  },
}));

import { generateText, generateJson, AiKeyMissingError } from "@/lib/ai";

const reply = (text: string) => ({ response: { text: () => text } });
const enReq = () => new Request("http://x", { headers: { cookie: "NEXT_LOCALE=en" } });

beforeEach(() => {
  generateContent.mockReset();
  getGenerativeModel.mockClear();
  aiState.apiKey = "k";
  aiState.model = "gemini-2.5-flash";
});

describe("lib/ai 서비스 계층", () => {
  it("키 없으면 AiKeyMissingError", async () => {
    aiState.apiKey = null;
    await expect(generateText({ userId: "u", prompt: "p" })).rejects.toBeInstanceOf(AiKeyMissingError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("generateText는 트림된 응답 텍스트 반환", async () => {
    generateContent.mockResolvedValue(reply("  hello  "));
    expect(await generateText({ userId: "u", prompt: "p" })).toBe("hello");
  });

  it("generateJson은 공통 파서로 파싱(코드펜스 포함)", async () => {
    generateContent.mockResolvedValue(reply('```json\n{ "a": 1 }\n```'));
    expect(await generateJson({ userId: "u", prompt: "p" })).toEqual({ a: 1 });
  });

  it("localize+en이면 출력 언어 지시문이 프롬프트에 덧붙는다", async () => {
    generateContent.mockResolvedValue(reply("{}"));
    await generateJson({ userId: "u", prompt: "ASK", req: enReq(), localize: true });
    const sent = generateContent.mock.calls[0][0] as string;
    expect(sent.startsWith("ASK")).toBe(true);
    expect(sent).toContain("English");
  });

  it("localize 없으면 프롬프트 그대로", async () => {
    generateContent.mockResolvedValue(reply("{}"));
    await generateJson({ userId: "u", prompt: "ASK" });
    expect(generateContent.mock.calls[0][0]).toBe("ASK");
  });

  it("quality 작업은 flash-lite 설정이어도 gemini-2.5-flash와 낮은 온도로 호출", async () => {
    aiState.model = "gemini-2.5-flash-lite";
    generateContent.mockResolvedValue(reply("{}"));

    await generateJson({ userId: "u", prompt: "ASK", quality: true });

    expect(getGenerativeModel).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.1 },
    });
  });

  it("quality 작업에서 교사가 pro를 명시하면 pro 모델은 존중", async () => {
    aiState.model = "gemini-2.5-pro";
    generateContent.mockResolvedValue(reply("{}"));

    await generateJson({ userId: "u", prompt: "ASK", quality: true });

    expect(getGenerativeModel).toHaveBeenCalledWith({
      model: "gemini-2.5-pro",
      generationConfig: { temperature: 0.1 },
    });
  });
});
