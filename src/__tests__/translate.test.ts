import { describe, it, expect, vi, beforeEach } from "vitest";
import { contentHash, translateTexts } from "@/lib/translate";

// Gemini SDK를 모킹해 translateTexts의 프롬프트→파싱 계약만 검증(실제 호출 없음)
const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

const reply = (text: string) => ({ response: { text: () => text } });

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
  beforeEach(() => generateContent.mockReset());

  it("빈 입력은 호출 없이 빈 배열", async () => {
    expect(await translateTexts([], "en", "key", "m")).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("JSON 배열 응답을 순서대로 파싱한다", async () => {
    generateContent.mockResolvedValue(reply('["Why is the sky blue?", "Good question!"]'));
    const out = await translateTexts(["왜 하늘은 파랄까?", "좋은 질문!"], "en", "key", "m");
    expect(out).toEqual(["Why is the sky blue?", "Good question!"]);
  });

  it("코드펜스/잡텍스트가 섞여도 배열을 추출한다", async () => {
    generateContent.mockResolvedValue(reply('```json\n["A", "B"]\n```'));
    expect(await translateTexts(["가", "나"], "en", "key", "m")).toEqual(["A", "B"]);
  });

  it("개수가 안 맞으면 예외", async () => {
    generateContent.mockResolvedValue(reply('["only one"]'));
    await expect(translateTexts(["가", "나"], "en", "key", "m")).rejects.toThrow();
  });

  it("배열이 아니면 예외", async () => {
    generateContent.mockResolvedValue(reply("그냥 텍스트"));
    await expect(translateTexts(["가"], "en", "key", "m")).rejects.toThrow();
  });
});
