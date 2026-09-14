import { describe, it, expect, vi, beforeEach } from "vitest";
import { contentHash, translateTexts } from "@/lib/translate";

const mocks = vi.hoisted(() => ({
  generateJsonArray: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({ generateJsonArray: mocks.generateJsonArray }));

describe("contentHash", () => {
  it("같은 입력은 같은 해시를 낸다(결정적)", () => {
    expect(contentHash("왜 하늘은 파랄까?")).toBe(contentHash("왜 하늘은 파랄까?"));
  });

  it("입력이 달라지면 해시도 달라진다(원문 수정 감지)", () => {
    expect(contentHash("원문")).not.toBe(contentHash("원문 수정"));
  });

  it("32자 hex 문자열을 반환한다", () => {
    const h = contentHash("테스트 콘텐츠");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("translateTexts (Gemini 모킹)", () => {
  beforeEach(() => mocks.generateJsonArray.mockReset());

  it("빈 입력은 호출 없이 빈 배열", async () => {
    expect(await translateTexts([], "en", "u1", "key", "m")).toEqual([]);
    expect(mocks.generateJsonArray).not.toHaveBeenCalled();
  });

  it("JSON 배열 응답을 순서대로 파싱한다", async () => {
    mocks.generateJsonArray.mockResolvedValue(["Why is the sky blue?", "Good question!"]);
    const out = await translateTexts(["왜 하늘은 파랄까?", "좋은 질문!"], "en", "u1", "key", "m");
    expect(out).toEqual(["Why is the sky blue?", "Good question!"]);
  });

  it("공통 AI 서비스에 키와 모델을 전달한다", async () => {
    mocks.generateJsonArray.mockResolvedValue(["A", "B"]);
    expect(await translateTexts(["가", "나"], "en", "u1", "key", "m")).toEqual(["A", "B"]);
    expect(mocks.generateJsonArray).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        apiKeyOverride: "key",
        modelOverride: "m",
        temperature: 0,
      }),
    );
  });

  it("개수가 안 맞으면 예외", async () => {
    mocks.generateJsonArray.mockResolvedValue(["only one"]);
    await expect(translateTexts(["가", "나"], "en", "u1", "key", "m")).rejects.toThrow();
  });

  it("긴 글 묶음은 응답 상한 안에서 나누어 번역하고 순서를 유지한다", async () => {
    const texts = ["첫째 글 ".repeat(220), "둘째 글 ".repeat(220), "셋째 글 ".repeat(220)];
    mocks.generateJsonArray.mockResolvedValueOnce(["First text"]).mockResolvedValueOnce(["Second text"]).mockResolvedValueOnce(["Third text"]);
    expect(await translateTexts(texts, "en", "u1", "key", "m")).toEqual(["First text", "Second text", "Third text"]);
    expect(mocks.generateJsonArray).toHaveBeenCalledTimes(3);
    expect(mocks.generateJsonArray.mock.calls[1][0]).toMatchObject({ prompt: expect.stringContaining(texts[1]), thinkingBudget: 0, maxOutputTokens: 2048 });
  });

  it("나중 번역이 잘못되면 먼저 번역한 일부 결과로 원문을 덮어쓰지 않는다", async () => {
    mocks.generateJsonArray.mockResolvedValueOnce(["First text"]).mockResolvedValueOnce([null]);
    await expect(translateTexts(["가".repeat(1500), "나".repeat(1500)], "en", "u1", "key", "m")).rejects.toThrow("AI_INVALID_RESPONSE");
    expect(mocks.generateJsonArray).toHaveBeenCalledTimes(2);
  });

  it("배열이 아니면 예외", async () => {
    mocks.generateJsonArray.mockResolvedValue({ text: "그냥 텍스트" });
    await expect(translateTexts(["가"], "en", "u1", "key", "m")).rejects.toThrow();
  });

  it.each([null, 12, {}, [], '', '   '])("번역 문장이 아닌 값은 원문을 덮어쓸 수 없다: %j", async (invalid) => {
    mocks.generateJsonArray.mockResolvedValue([invalid]);
    await expect(translateTexts(["색깔이 주황색인가요?"], "en", "u1", "key", "m")).rejects.toThrow('AI_INVALID_RESPONSE');
  });
});
