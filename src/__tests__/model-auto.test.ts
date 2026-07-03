import { describe, it, expect } from "vitest";
import {
  AUTO_MODEL_CHAR_THRESHOLD,
  alternateModel,
  chooseModelAuto,
} from "@/lib/api-config";
import { isTransientAiError } from "@/lib/ai-errors";

describe("chooseModelAuto — 프롬프트 크기 기반 자동 모델 선택", () => {
  it("짧은 프롬프트는 flash-lite", () => {
    expect(chooseModelAuto("gemini-2.5-flash", 1000)).toBe("gemini-2.5-flash-lite");
    expect(chooseModelAuto("gemini-2.5-flash-lite", AUTO_MODEL_CHAR_THRESHOLD)).toBe("gemini-2.5-flash-lite");
  });

  it("긴 프롬프트는 flash", () => {
    expect(chooseModelAuto("gemini-2.5-flash-lite", AUTO_MODEL_CHAR_THRESHOLD + 1)).toBe("gemini-2.5-flash");
    expect(chooseModelAuto(null, 20000)).toBe("gemini-2.5-flash");
  });

  it("교사가 pro를 명시하면 크기와 무관하게 pro 유지", () => {
    expect(chooseModelAuto("gemini-2.5-pro", 100)).toBe("gemini-2.5-pro");
    expect(chooseModelAuto("gemini-2.5-pro", 100000)).toBe("gemini-2.5-pro");
  });

  it("알 수 없는 모델 설정은 기본값 기준으로 자동 선택", () => {
    expect(chooseModelAuto("gpt-4", 100)).toBe("gemini-2.5-flash-lite");
    expect(chooseModelAuto(undefined, 100000)).toBe("gemini-2.5-flash");
  });
});

describe("alternateModel — 혼잡 시 대체 모델", () => {
  it("lite↔flash 상호 전환, pro는 flash-lite로", () => {
    expect(alternateModel("gemini-2.5-flash-lite")).toBe("gemini-2.5-flash");
    expect(alternateModel("gemini-2.5-flash")).toBe("gemini-2.5-flash-lite");
    expect(alternateModel("gemini-2.5-pro")).toBe("gemini-2.5-flash-lite");
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
