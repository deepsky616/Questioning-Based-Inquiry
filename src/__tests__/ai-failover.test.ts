import { describe, it, expect, vi, beforeEach } from "vitest";

// Gemini SDK 모킹 — 호출된 모델명·generationConfig를 기록하고 응답을 제어한다
const generateMock = vi.fn();
const modelCalls: Array<{ model: string; generationConfig?: { temperature?: number } }> = [];
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(opts: { model: string; generationConfig?: { temperature?: number } }) {
      modelCalls.push(opts);
      return { generateContent: generateMock };
    }
  },
}));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));

import { generateText, AiBusyError, AiKeyMissingError, CONSISTENT_TEMPERATURE } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";

const mResolve = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const ok = (text: string) => ({ response: { text: () => text } });
const busyErr = () => new Error("[503 Service Unavailable] This model is currently experiencing high demand.");

beforeEach(() => {
  vi.clearAllMocks();
  modelCalls.length = 0;
  mResolve.mockResolvedValue({ apiKey: "k", model: "gemini-2.5-flash-lite" });
});

describe("callGemini — 재시도·페일오버·모델 선택", () => {
  it("키가 없으면 AiKeyMissingError", async () => {
    mResolve.mockResolvedValue({ apiKey: null, model: "gemini-2.5-flash" });
    await expect(generateText({ userId: "u1", prompt: "짧은 작업" })).rejects.toBeInstanceOf(AiKeyMissingError);
  });

  it("짧은 프롬프트는 flash-lite로 호출한다(자동 선택)", async () => {
    generateMock.mockResolvedValue(ok("답"));
    await generateText({ userId: "u1", prompt: "짧은 작업" });
    expect(modelCalls[0].model).toBe("gemini-2.5-flash-lite");
  });

  it("quality 작업은 크기와 무관하게 flash + 낮은 온도로 호출한다", async () => {
    generateMock.mockResolvedValue(ok("분석"));
    await generateText({ userId: "u1", prompt: "짧아도 품질", quality: true });
    expect(modelCalls[0].model).toBe("gemini-2.5-flash");
    expect(modelCalls[0].generationConfig?.temperature).toBe(CONSISTENT_TEMPERATURE);
  });

  it("일시 오류(503) 후 재시도로 성공한다", async () => {
    vi.useFakeTimers();
    generateMock.mockRejectedValueOnce(busyErr()).mockResolvedValueOnce(ok("복구"));
    const p = generateText({ userId: "u1", prompt: "재시도" });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("복구");
    vi.useRealTimers();
  });

  it("주 모델이 계속 혼잡하면 대체 모델(lite→flash)로 페일오버한다", async () => {
    vi.useFakeTimers();
    generateMock
      .mockRejectedValueOnce(busyErr())
      .mockRejectedValueOnce(busyErr())
      .mockResolvedValueOnce(ok("대체 성공"));
    const p = generateText({ userId: "u1", prompt: "혼잡" });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("대체 성공");
    expect(modelCalls.map((c) => c.model)).toEqual(["gemini-2.5-flash-lite", "gemini-2.5-flash"]);
    vi.useRealTimers();
  });

  it("대체 모델까지 혼잡하면 AiBusyError를 던진다", async () => {
    vi.useFakeTimers();
    generateMock.mockRejectedValue(busyErr());
    const p = generateText({ userId: "u1", prompt: "전부 혼잡" });
    p.catch(() => {}); // 타이머 진행 중 unhandled rejection 방지
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(AiBusyError);
    vi.useRealTimers();
  });

  it("일시적이지 않은 오류는 재시도 없이 그대로 던진다", async () => {
    generateMock.mockRejectedValue(new Error("Invalid API key"));
    await expect(generateText({ userId: "u1", prompt: "인증 오류" })).rejects.toThrow("Invalid API key");
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});
