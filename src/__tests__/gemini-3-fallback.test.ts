import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent }; },
}));
vi.mock("@/lib/resolve-ai-config", () => ({
  resolveUserAiConfig: vi.fn(async () => ({ apiKey: "test-key", model: "gemini-2.5-flash", isDemo: false })),
}));

import { generateJson, generateJsonArray, generateJsonWithMetadata, generateText, createJsonGenerationSession } from "@/lib/ai";
import { resolveGeminiModel, chooseModelAuto, chooseQualityModel } from "@/lib/api-config";

const lite = "gemini-3.1-flash-lite";
const flash = "gemini-3-flash-preview";
const models = () => generateContent.mock.calls.map(([request]) => request.model);

beforeEach(() => { generateContent.mockReset(); });

describe("새 모델 전환과 응답 복구", () => {
  it.each(["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", null])("기존 설정 %s는 새 기본 모델로 해석한다", (model) => {
    expect(resolveGeminiModel(model)).toBe(lite);
    expect(chooseModelAuto(model, 100_000)).toBe(lite);
    expect(chooseQualityModel(model)).toBe(lite);
  });

  it("긴 품질 작업도 먼저 경량 모델을 호출한다", async () => {
    generateContent.mockResolvedValue({ text: "완성" });
    await generateText({ userId: "u", prompt: "가".repeat(20_000), quality: true });
    expect(models()).toEqual([lite]);
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(1);
  });

  it.each([0, 512])("기존 사고 예산 %s를 새 사고 수준으로 변환한다", async (thinkingBudget) => {
    generateContent.mockResolvedValue({ text: "{}" });
    await generateJson({ userId: "u", prompt: "분류", thinkingBudget });
    const config = generateContent.mock.calls[0][0].config;
    expect(config.thinkingConfig).toEqual({ thinkingLevel: thinkingBudget === 0 ? "MINIMAL" : "LOW" });
    expect(config.thinkingConfig).not.toHaveProperty("thinkingBudget");
  });

  it.each([
    Object.assign(new Error("model is not found"), { status: 404 }),
    Object.assign(new Error("thinkingLevel is not supported for this model"), { status: 400 }),
  ])("모델 사용 불가나 기능 미지원은 즉시 대체 모델로 전환한다", async (error) => {
    generateContent.mockRejectedValueOnce(error).mockResolvedValueOnce({ text: '{"ok":true}' });
    await expect(generateJsonWithMetadata({ userId: "u", prompt: "분류" })).resolves.toEqual({ data: { ok: true }, model: flash });
    expect(models()).toEqual([lite, flash]);
  });

  it.each(["", "응답 형식 오류", '{"unfinished":'])("빈 응답이나 깨진 제이슨은 대체 모델로 복구한다: %s", async (text) => {
    generateContent.mockResolvedValueOnce({ text }).mockResolvedValueOnce({ text: '{"ok":true}' });
    await expect(generateJson({ userId: "u", prompt: "분류" })).resolves.toEqual({ ok: true });
    expect(models()).toEqual([lite, flash]);
  });

  it("배열 응답도 대체 모델에서 복구한다", async () => {
    generateContent.mockResolvedValueOnce({ text: "배열 누락" }).mockResolvedValueOnce({ text: '["번역"]' });
    await expect(generateJsonArray({ userId: "u", prompt: "번역" })).resolves.toEqual(["번역"]);
    expect(models()).toEqual([lite, flash]);
  });

  it("객체 요청에 배열이 오면 배열 안의 첫 객체를 정상 결과로 취급하지 않는다", async () => {
    generateContent.mockResolvedValueOnce({ text: '[{"ok":false}]' }).mockResolvedValueOnce({ text: '{"ok":true}' });
    await expect(generateJson({ userId: "u", prompt: "분류" })).resolves.toEqual({ ok: true });
    expect(models()).toEqual([lite, flash]);
  });

  it("정상 종료되지 않은 응답은 대체 모델에서 완성한 뒤 반환한다", async () => {
    generateContent.mockResolvedValueOnce({ text: '중간 문장', candidates: [{ finishReason: "OTHER" }] })
      .mockResolvedValueOnce({ text: '완성 문장', candidates: [{ finishReason: "STOP" }] });
    await expect(generateText({ userId: "u", prompt: "분석" })).resolves.toBe('완성 문장');
    expect(models()).toEqual([lite, flash]);
  });

  it("분할 분석도 제이슨 오류를 같은 설정으로 복구한다", async () => {
    const generate = await createJsonGenerationSession("u");
    generateContent.mockResolvedValueOnce({ text: "깨진 응답" }).mockResolvedValueOnce({ text: '{"ok":true}' });
    await expect(generate({ userId: "u", prompt: "분석" })).resolves.toEqual({ ok: true });
    expect(models()).toEqual([lite, flash]);
  });

  it("필수 항목이 없는 유효한 제이슨도 기능별 검사 뒤 대체 모델에서 복구한다", async () => {
    generateContent.mockResolvedValueOnce({ text: '{}' }).mockResolvedValueOnce({ text: '{"summary":"완성"}' });
    await expect(generateJsonWithMetadata({ userId: "u", prompt: "분석", validateResponse: (data) =>
      !!data && typeof data === "object" && "summary" in data && typeof data.summary === "string",
    })).resolves.toEqual({ data: { summary: "완성" }, model: flash });
    expect(models()).toEqual([lite, flash]);
  });

  it("대체 모델도 잘못된 응답이면 무한 전환하지 않고 저장 가능한 값을 반환하지 않는다", async () => {
    generateContent.mockResolvedValue({ text: '응답 오류' });
    await expect(generateJson({ userId: "u", prompt: "분석" })).rejects.toThrow();
    expect(models()).toEqual([lite, flash]);
  });

  it("경량 모델의 잘린 응답은 예산을 한 번 늘린 뒤에도 실패하면 대체 모델에서 복구한다", async () => {
    generateContent
      .mockResolvedValueOnce({ text: '{', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockResolvedValueOnce({ text: '{', candidates: [{ finishReason: "MAX_TOKENS" }] })
      .mockResolvedValueOnce({ text: '{"ok":true}', candidates: [{ finishReason: "STOP" }] });
    await expect(generateJson({ userId: "u", prompt: "분석", maxOutputTokens: 128 })).resolves.toEqual({ ok: true });
    expect(models()).toEqual([lite, lite, flash]);
    expect(generateContent.mock.calls.map(([request]) => request.config.maxOutputTokens)).toEqual([128, 256, 256]);
  });

  it("안전 차단은 프롬프트 단계에서도 재요청하지 않는다", async () => {
    generateContent.mockResolvedValue({ text: "", promptFeedback: { blockReason: "SAFETY" } });
    await expect(generateJson({ userId: "u", prompt: "차단" })).rejects.toThrow("AI_SAFETY_BLOCKED");
    expect(models()).toEqual([lite]);
  });

  it("인증 실패는 다른 모델을 호출해도 해결되지 않으므로 즉시 알린다", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("API key not valid"), { status: 400 }));
    await expect(generateText({ userId: "u", prompt: "연결" })).rejects.toThrow("API key not valid");
    expect(models()).toEqual([lite]);
  });

  it("안전 차단 응답은 대체 모델로 우회하지 않는다", async () => {
    generateContent.mockResolvedValue({ text: "", candidates: [{ finishReason: "SAFETY" }] });
    await expect(generateText({ userId: "u", prompt: "차단" })).rejects.toThrow();
    expect(models()).toEqual([lite]);
  });
});
