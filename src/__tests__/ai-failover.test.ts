import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));

import { generateText, AiBusyError, AiKeyMissingError, AiQuotaError, CONSISTENT_TEMPERATURE } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";

const mResolve = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const ok = (text: string) => ({ text });
const busyErr = () => new Error("[503 Service Unavailable] This model is currently experiencing high demand.");
const quotaErr = () =>
  new Error(
    '[429 Too Many Requests] You exceeded your current quota. * Quota exceeded for metric: generate_content_free_tier_requests, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier',
  );
const calledModels = () => generateContent.mock.calls.map(([request]) => request.model);

beforeEach(() => {
  vi.clearAllMocks();
  mResolve.mockResolvedValue({ apiKey: "k", model: "gemini-2.5-flash-lite" });
});

describe("callGemini — 재시도·페일오버·모델 선택", () => {
  it("키가 없으면 AiKeyMissingError", async () => {
    mResolve.mockResolvedValue({ apiKey: null, model: "gemini-2.5-flash" });
    await expect(generateText({ userId: "u1", prompt: "짧은 작업" })).rejects.toBeInstanceOf(AiKeyMissingError);
  });

  it("짧은 프롬프트는 flash-lite로 호출한다(자동 선택)", async () => {
    generateContent.mockResolvedValue(ok("답"));
    await generateText({ userId: "u1", prompt: "짧은 작업" });
    expect(calledModels()).toEqual(["gemini-2.5-flash-lite"]);
  });

  it("quality 작업은 크기와 무관하게 flash + 낮은 온도로 호출한다", async () => {
    generateContent.mockResolvedValue(ok("분석"));
    await generateText({ userId: "u1", prompt: "짧아도 품질", quality: true });
    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      contents: "짧아도 품질",
      config: { temperature: CONSISTENT_TEMPERATURE },
    });
  });

  it("일시 오류(503) 후 재시도로 성공한다", async () => {
    vi.useFakeTimers();
    generateContent.mockRejectedValueOnce(busyErr()).mockResolvedValueOnce(ok("복구"));
    const p = generateText({ userId: "u1", prompt: "재시도" });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("복구");
    vi.useRealTimers();
  });

  it("주 모델이 계속 혼잡하면 대체 모델(lite→flash)로 페일오버한다", async () => {
    vi.useFakeTimers();
    generateContent
      .mockRejectedValueOnce(busyErr())
      .mockRejectedValueOnce(busyErr())
      .mockResolvedValueOnce(ok("대체 성공"));
    const p = generateText({ userId: "u1", prompt: "혼잡" });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("대체 성공");
    expect(calledModels()).toEqual([
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ]);
    vi.useRealTimers();
  });

  it("대체 모델까지 혼잡하면 AiBusyError를 던진다", async () => {
    vi.useFakeTimers();
    generateContent.mockRejectedValue(busyErr());
    const p = generateText({ userId: "u1", prompt: "전부 혼잡" });
    p.catch(() => {}); // 타이머 진행 중 unhandled rejection 방지
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(AiBusyError);
    vi.useRealTimers();
  });

  it("일시적이지 않은 오류는 재시도 없이 그대로 던진다", async () => {
    generateContent.mockRejectedValue(new Error("Invalid API key"));
    await expect(generateText({ userId: "u1", prompt: "인증 오류" })).rejects.toThrow("Invalid API key");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("callGemini — 무료 일일 한도(quota) 처리", () => {
  it("일일 한도 초과는 같은 모델을 재시도하지 않고 즉시 대체 모델로 넘어간다", async () => {
    generateContent
      .mockRejectedValueOnce(quotaErr()) // lite: 1회 만에 중단(잔여 한도 소모 방지)
      .mockResolvedValueOnce(ok("대체 성공"));
    const text = await generateText({ userId: "u1", prompt: "짧은 작업" });
    expect(text).toBe("대체 성공");
    expect(calledModels()).toEqual(["gemini-2.5-flash-lite", "gemini-2.5-flash"]);
  });

  it("두 모델 모두 일일 한도면 AiQuotaError로 사용자에게 정확히 안내한다", async () => {
    generateContent.mockRejectedValue(quotaErr());
    await expect(generateText({ userId: "u1", prompt: "짧은 작업" })).rejects.toBeInstanceOf(AiQuotaError);
    expect(calledModels()).toEqual(["gemini-2.5-flash-lite", "gemini-2.5-flash"]);
  });

  it("분당 한도(PerDay 아님) 429는 기존대로 재시도한다", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("[429 Too Many Requests] rate limit, quotaId: GenerateRequestsPerMinute"))
      .mockResolvedValueOnce(ok("재시도 성공"));
    const text = await generateText({ userId: "u1", prompt: "짧은 작업" });
    expect(text).toBe("재시도 성공");
    expect(calledModels()).toEqual(["gemini-2.5-flash-lite", "gemini-2.5-flash-lite"]);
  });
});
