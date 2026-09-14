import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
const constructorCall = vi.hoisted(() => vi.fn());
const aiState = vi.hoisted(() => ({ apiKey: "k" as string | null, model: "gemini-2.5-flash", isDemo: false }));
const consumeQuota = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("@/lib/demo-ai-quota", () => ({ consumeDemoAiQuota: consumeQuota }));

vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn(async () => ({ ...aiState })) }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(options: { apiKey: string }) {
      constructorCall(options);
    }
  },
}));

import { generateText, generateJson, generateJsonWithMetadata, AiKeyMissingError } from "@/lib/ai";
import { AiInvalidResponseError, AiOutputTruncatedError } from "@/lib/ai-errors";

const reply = (text: string) => ({ text });
const enReq = () => new Request("http://x", { headers: { cookie: "NEXT_LOCALE=en" } });

beforeEach(() => {
  generateContent.mockReset();
  constructorCall.mockClear();
  aiState.apiKey = "k";
  aiState.model = "gemini-2.5-flash";
  aiState.isDemo = false;
  consumeQuota.mockClear();
});

describe("lib/ai 서비스 계층", () => {
  it("질문놀이 외의 요청도 기본적으로 잘린 응답을 다시 생성한다", async () => {
    generateContent
      .mockResolvedValueOnce({ text: '중간 답변', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockResolvedValueOnce(reply('완성한 답변'));
    await expect(generateText({ userId: "u", prompt: "긴 글 분석", maxOutputTokens: 1024 })).resolves.toBe('완성한 답변');
    expect(generateContent.mock.calls.map(([request]) => request.config.maxOutputTokens)).toEqual([1024, 2048]);
  });

  it.each([undefined, false])("출력 상한을 더 늘릴 수 없어도 잘린 응답을 성공으로 반환하지 않는다: %s", async (retryTruncatedOutput) => {
    generateContent.mockResolvedValue({ text: '중간 답변', candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(generateText({ userId: "u", prompt: "p", retryTruncatedOutput })).rejects.toBeInstanceOf(AiOutputTruncatedError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', '  \n  '])("빈 응답을 저장 가능한 답변으로 반환하지 않는다: %s", async (text) => {
    generateContent.mockResolvedValue({ text });
    await expect(generateText({ userId: "u", prompt: "p" })).rejects.toBeInstanceOf(AiInvalidResponseError);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("Pro에 필요한 사고 예산과 출력 여유를 확보한다", async () => {
    aiState.model = "gemini-2.5-pro";
    generateContent.mockResolvedValue(reply('{}'));
    await generateJson({ userId: "u", prompt: "p", thinkingBudget: 0, maxOutputTokens: 128 });
    expect(generateContent.mock.calls[0][0]).toMatchObject({ model: "gemini-2.5-pro", config: { thinkingConfig: { thinkingBudget: 128 }, maxOutputTokens: 256 } });
  });

  it("Pro에서 대체 모델로 전환하면 해당 모델의 원래 사고 설정을 사용한다", async () => {
    aiState.model = "gemini-2.5-pro";
    generateContent.mockRejectedValueOnce(new Error('429 quota PerDay')).mockResolvedValueOnce(reply('{}'));
    await generateJson({ userId: "u", prompt: "p", thinkingBudget: 0, maxOutputTokens: 128 });
    expect(generateContent.mock.calls.map(([request]) => request.config.thinkingConfig.thinkingBudget)).toEqual([128, 0]);
    expect(generateContent.mock.calls.map(([request]) => request.config.maxOutputTokens)).toEqual([256, 128]);
  });

  it("시연 계정은 재시도해도 응답 상한을 넘기지 않고 한 번의 요청으로 계산한다", async () => {
    aiState.isDemo = true;
    generateContent
      .mockResolvedValueOnce({ text: '{', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockResolvedValueOnce({ text: '{}', candidates: [{ finishReason: "STOP" }] });
    await expect(generateJson({ userId: "demo-retry", prompt: "p", maxOutputTokens: 1536, retryTruncatedOutput: true })).resolves.toEqual({});
    expect(generateContent.mock.calls.map(([request]) => request.config.maxOutputTokens)).toEqual([1536, 2048]);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
  });

  it("시연 계정의 최대 응답도 잘리면 같은 제한으로 무한 재시도하지 않는다", async () => {
    aiState.isDemo = true;
    generateContent.mockResolvedValue({ text: '{', candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(generateJson({ userId: "demo-limit", prompt: "p", maxOutputTokens: 2048, retryTruncatedOutput: true })).rejects.toBeInstanceOf(AiOutputTruncatedError);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
  });
  it("질문놀이의 잘린 응답은 한 번만 예산을 늘려 처음부터 다시 받는다", async () => {
    generateContent
      .mockResolvedValueOnce({ text: '{"answers":[', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockResolvedValueOnce({ text: '{"answers":[{"answer":"yes"}]}', candidates: [{ finishReason: "STOP" }] });
    const result = await generateJson({ userId: "u", prompt: "p", maxOutputTokens: 768, retryTruncatedOutput: true });
    expect(result).toEqual({ answers: [{ answer: "yes" }] });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.config.maxOutputTokens)).toEqual([768, 1536]);
  });

  it("두 번 연속 잘리면 부분 응답을 성공으로 반환하지 않고 중단한다", async () => {
    generateContent.mockResolvedValue({ text: '{"a":1}', candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(generateJson({ userId: "u", prompt: "p", maxOutputTokens: 128, retryTruncatedOutput: true })).rejects.toBeInstanceOf(AiOutputTruncatedError);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("일반 텍스트 질문도 잘린 문장을 저장하지 않는다", async () => {
    generateContent.mockResolvedValue({ text: "어떤 이유로", candidates: [{ finishReason: "MAX_TOKENS" }] });
    await expect(generateText({ userId: "u", prompt: "p", maxOutputTokens: 256, retryTruncatedOutput: true })).rejects.toBeInstanceOf(AiOutputTruncatedError);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
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

  it("generateJsonWithMetadata는 실제 사용 모델을 함께 반환", async () => {
    aiState.model = "gemini-2.5-flash-lite";
    generateContent.mockResolvedValue(reply('{ "a": 1 }'));

    const result = await generateJsonWithMetadata<{ a: number }>({ userId: "u", prompt: "p", quality: true });

    expect(result).toEqual({ data: { a: 1 }, model: "gemini-2.5-flash" });
  });

  it("localize+en이면 출력 언어 지시문이 프롬프트에 덧붙는다", async () => {
    generateContent.mockResolvedValue(reply("{}"));
    await generateJson({ userId: "u", prompt: "ASK", req: enReq(), localize: true });
    const sent = generateContent.mock.calls[0][0].contents as string;
    expect(sent.startsWith("ASK")).toBe(true);
    expect(sent).toContain("English");
  });

  it("localize 없으면 프롬프트 그대로", async () => {
    generateContent.mockResolvedValue(reply("{}"));
    await generateJson({ userId: "u", prompt: "ASK" });
    expect(generateContent.mock.calls[0][0].contents).toBe("ASK");
  });

  it("quality 작업은 flash-lite 설정이어도 gemini-2.5-flash와 낮은 온도로 호출", async () => {
    aiState.model = "gemini-2.5-flash-lite";
    generateContent.mockResolvedValue(reply("{}"));

    await generateJson({ userId: "u", prompt: "ASK", quality: true });

    expect(constructorCall).toHaveBeenCalledWith({ apiKey: "k" });
    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      contents: "ASK",
      config: { temperature: 0.1 },
    });
  });

  it("system instruction과 온도를 요청 config로 전달", async () => {
    generateContent.mockResolvedValue(reply("{}"));

    await generateText({
      userId: "u",
      prompt: "ASK",
      systemInstruction: "SYSTEM",
      temperature: 0.4,
    });

    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash-lite",
      contents: "ASK",
      config: { systemInstruction: "SYSTEM", temperature: 0.4 },
    });
  });

  it("quality 작업에서 교사가 pro를 명시하면 pro 모델은 존중", async () => {
    aiState.model = "gemini-2.5-pro";
    generateContent.mockResolvedValue(reply("{}"));

    await generateJson({ userId: "u", prompt: "ASK", quality: true });

    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-pro",
      contents: "ASK",
      config: { temperature: 0.1 },
    });
  });
});
