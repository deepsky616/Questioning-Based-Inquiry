import { describe, it, expect } from "vitest";
import {
  alternateModel,
  chooseModelAuto,
  chooseQualityModel,
} from "@/lib/api-config";
import { isTransientAiError } from "@/lib/ai-errors";

describe("chooseModelAuto — 새 경량 모델 우선 선택", () => {
  it("짧은 프롬프트는 flash-lite", () => {
    expect(chooseModelAuto("gemini-2.5-flash", 1000)).toBe("gemini-3.1-flash-lite");
    expect(chooseModelAuto("gemini-3.1-flash-lite", 5000)).toBe("gemini-3.1-flash-lite");
  });

  it("긴 프롬프트도 먼저 새 경량 모델을 사용한다", () => {
    expect(chooseModelAuto("gemini-2.5-flash-lite", 5001)).toBe("gemini-3.1-flash-lite");
    expect(chooseModelAuto(null, 20000)).toBe("gemini-3.1-flash-lite");
  });

  it("새 Flash를 명시하면 크기와 무관하게 선택값을 존중한다", () => {
    expect(chooseModelAuto("gemini-3-flash-preview", 100)).toBe("gemini-3-flash-preview");
    expect(chooseModelAuto("gemini-3-flash-preview", 100000)).toBe("gemini-3-flash-preview");
  });

  it("알 수 없는 모델 설정은 기본값 기준으로 자동 선택", () => {
    expect(chooseModelAuto("gpt-4", 100)).toBe("gemini-3.1-flash-lite");
    expect(chooseModelAuto(undefined, 100000)).toBe("gemini-3.1-flash-lite");
  });
});

describe("chooseQualityModel — 품질 우선 작업(질문 묶기 등)", () => {
  it("기존 품질 작업도 새 경량 모델로 시작한다", () => {
    expect(chooseQualityModel("gemini-2.5-flash-lite")).toBe("gemini-3.1-flash-lite");
    expect(chooseQualityModel("gemini-2.5-flash")).toBe("gemini-3.1-flash-lite");
    expect(chooseQualityModel(null)).toBe("gemini-3.1-flash-lite");
  });

  it("새 Flash의 명시적 선택을 존중한다", () => {
    expect(chooseQualityModel("gemini-3-flash-preview")).toBe("gemini-3-flash-preview");
  });
});

describe("alternateModel — 혼잡 시 대체 모델", () => {
  it("새 경량 모델과 Flash 사이에서 전환한다", () => {
    expect(alternateModel("gemini-3.1-flash-lite")).toBe("gemini-3-flash-preview");
    expect(alternateModel("gemini-3-flash-preview")).toBe("gemini-3.1-flash-lite");
  });
});

describe("isTransientAiError — 일시 오류 판별", () => {
  it("혼잡·리밋 오류를 재시도 대상으로 판별", () => {
    expect(isTransientAiError(new Error("[503 Service Unavailable] This model is currently experiencing high demand."))).toBe(true);
    expect(isTransientAiError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isTransientAiError(new Error("The model is overloaded"))).toBe(true);
  });

  it("일반 오류는 재시도하지 않음", () => {
    expect(isTransientAiError(new Error("Invalid API key"))).toBe(false);
    expect(isTransientAiError(new Error("JSON 파싱 실패"))).toBe(false);
  });
});
