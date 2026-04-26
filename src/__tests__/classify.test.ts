import { describe, it, expect } from "vitest";
import {
  fallbackClassification,
  isValidClosureType,
  isValidCognitiveType,
  parseClassificationResponse,
} from "@/lib/classify";

describe("fallbackClassification", () => {
  it("폐쇄형 키워드가 있으면 closed를 반환한다", () => {
    const result = fallbackClassification("광합성이 무엇인지 설명해주세요");
    expect(result.closure).toBe("closed");
    expect(result.closureScore).toBeGreaterThan(0.5);
  });

  it("개방형 키워드가 있으면 open을 반환한다", () => {
    const result = fallbackClassification("왜 식물은 광합성을 하나요");
    expect(result.closure).toBe("open");
    expect(result.closureScore).toBeLessThan(0.5);
  });

  it("폐쇄형과 개방형 키워드가 모두 있으면 더 많은 키워드 쪽으로 결정한다", () => {
    const result = fallbackClassification("무엇이 왜 어디서 어떻게 일어났나요");
    // 폐쇄형 2개(무엇, 어디), 개방형 2개(왜, 어떻게) → 동률이면 open
    expect(result.closure).toBeDefined();
    // closureScore와 closure가 일치해야 함
    if (result.closure === "closed") {
      expect(result.closureScore).toBeGreaterThan(0.5);
    } else {
      expect(result.closureScore).toBeLessThanOrEqual(0.5);
    }
  });

  it("closureScore는 0과 1 사이여야 한다", () => {
    const result = fallbackClassification("무엇 언제 몇 어디 누구 얼마 왜 어떻게 무슨 어떤 그래서");
    expect(result.closureScore).toBeGreaterThanOrEqual(0);
    expect(result.closureScore).toBeLessThanOrEqual(1);
  });

  it("cognitiveScore는 0과 1 사이여야 한다", () => {
    const result = fallbackClassification("어떻게 생각해 판단해 평가해 의견 어떻게 비교해 분석해 추론해");
    expect(result.cognitiveScore).toBeGreaterThanOrEqual(0);
    expect(result.cognitiveScore).toBeLessThanOrEqual(1);
  });

  it("평가적 키워드가 있으면 evaluative를 반환한다", () => {
    const result = fallbackClassification("이 작품에 대해 어떻게 생각해요?");
    expect(result.cognitive).toBe("evaluative");
  });

  it("해석적 키워드만 있으면 interpretive를 반환한다", () => {
    const result = fallbackClassification("두 현상을 비교해 보세요");
    expect(result.cognitive).toBe("interpretive");
  });

  it("키워드 없이 빈 문자열이면 기본값을 반환한다", () => {
    const result = fallbackClassification("");
    expect(result.closure).toBe("open");
    expect(result.cognitive).toBe("factual");
    expect(result.closureScore).toBe(0.5);
    expect(result.cognitiveScore).toBe(0.5);
    expect(result.reasoning).toBe("키워드 기반 자동 분류");
  });

  it("fallback 분류는 항상 feedback 문자열을 반환한다", () => {
    const result = fallbackClassification("광합성이 무엇인지 설명해주세요");
    expect(typeof result.feedback).toBe("string");
    expect(result.feedback!.length).toBeGreaterThan(0);
  });

  it("닫힌+사실적 질문이면 개방형으로 바꾸길 권장하는 피드백을 반환한다", () => {
    const result = fallbackClassification("광합성이 무엇인지 설명해주세요");
    expect(result.closure).toBe("closed");
    expect(result.cognitive).toBe("factual");
    expect(result.feedback).toContain("왜");
  });

  it("열린+평가적 질문이면 긍정 피드백을 반환한다", () => {
    const result = fallbackClassification("왜 이 작품에 대해 어떻게 생각해요?");
    expect(result.closure).toBe("open");
    expect(result.cognitive).toBe("evaluative");
    expect(result.feedback).toBeDefined();
  });

  it("평가적 키워드가 있을 때 interpretive로 잘못 분류되지 않는다", () => {
    // "어떻게 생각해"는 평가적이지만 "어떻게"도 포함되어 있어
    // 순서에 따라 interpretive로 잘못 분류될 수 있음
    const result = fallbackClassification("이 내용에 대해 어떻게 생각해요?");
    expect(result.cognitive).toBe("evaluative");
  });
});

describe("isValidClosureType", () => {
  it("closed는 유효하다", () => {
    expect(isValidClosureType("closed")).toBe(true);
  });

  it("open은 유효하다", () => {
    expect(isValidClosureType("open")).toBe(true);
  });

  it("다른 값은 유효하지 않다", () => {
    expect(isValidClosureType("other")).toBe(false);
    expect(isValidClosureType("")).toBe(false);
    expect(isValidClosureType(undefined)).toBe(false);
  });
});

describe("isValidCognitiveType", () => {
  it("factual, interpretive, evaluative는 유효하다", () => {
    expect(isValidCognitiveType("factual")).toBe(true);
    expect(isValidCognitiveType("interpretive")).toBe(true);
    expect(isValidCognitiveType("evaluative")).toBe(true);
  });

  it("다른 값은 유효하지 않다", () => {
    expect(isValidCognitiveType("other")).toBe(false);
    expect(isValidCognitiveType("")).toBe(false);
    expect(isValidCognitiveType(undefined)).toBe(false);
  });
});

describe("parseClassificationResponse", () => {
  it("유효한 JSON 응답을 파싱한다", () => {
    const text = `{"closure":"closed","cognitive":"factual","closureScore":0.8,"cognitiveScore":0.7,"reasoning":"테스트"}`;
    const result = parseClassificationResponse(text);
    expect(result).not.toBeNull();
    expect(result!.closure).toBe("closed");
    expect(result!.cognitive).toBe("factual");
    expect(result!.closureScore).toBe(0.8);
    expect(result!.cognitiveScore).toBe(0.7);
  });

  it("feedback 필드가 있으면 포함해서 반환한다", () => {
    const text = `{"closure":"closed","cognitive":"factual","closureScore":0.8,"cognitiveScore":0.7,"reasoning":"테스트","feedback":"왜로 시작하면 더 좋은 질문이 됩니다"}`;
    const result = parseClassificationResponse(text);
    expect(result).not.toBeNull();
    expect(result!.feedback).toBe("왜로 시작하면 더 좋은 질문이 됩니다");
  });

  it("feedback 필드가 없어도 정상 파싱된다", () => {
    const text = `{"closure":"closed","cognitive":"factual","closureScore":0.8,"cognitiveScore":0.7,"reasoning":"테스트"}`;
    const result = parseClassificationResponse(text);
    expect(result).not.toBeNull();
    expect(result!.feedback).toBeUndefined();
  });

  it("마크다운 코드블록 안의 JSON도 파싱한다", () => {
    const text = `\`\`\`json\n{"closure":"open","cognitive":"evaluative","closureScore":0.3,"cognitiveScore":0.9,"reasoning":"이유"}\n\`\`\``;
    const result = parseClassificationResponse(text);
    expect(result).not.toBeNull();
    expect(result!.closure).toBe("open");
  });

  it("유효하지 않은 closure 값이면 null을 반환한다", () => {
    const text = `{"closure":"invalid","cognitive":"factual","closureScore":0.8,"cognitiveScore":0.7,"reasoning":"테스트"}`;
    const result = parseClassificationResponse(text);
    expect(result).toBeNull();
  });

  it("유효하지 않은 cognitive 값이면 null을 반환한다", () => {
    const text = `{"closure":"closed","cognitive":"wrong","closureScore":0.8,"cognitiveScore":0.7,"reasoning":"테스트"}`;
    const result = parseClassificationResponse(text);
    expect(result).toBeNull();
  });

  it("범위를 벗어난 score가 있으면 null을 반환한다", () => {
    const text = `{"closure":"closed","cognitive":"factual","closureScore":1.5,"cognitiveScore":0.7,"reasoning":"테스트"}`;
    const result = parseClassificationResponse(text);
    expect(result).toBeNull();
  });

  it("JSON이 없으면 null을 반환한다", () => {
    const result = parseClassificationResponse("JSON 없는 텍스트");
    expect(result).toBeNull();
  });
});
