export const GEMINI_MODELS = [
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
] as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const FALLBACK_GEMINI_MODEL = "gemini-3-flash-preview";

export type GeminiModel = (typeof GEMINI_MODELS)[number]["value"];

export function isAllowedGeminiModel(value: string): value is GeminiModel {
  return GEMINI_MODELS.some((model) => model.value === value);
}

export function resolveGeminiModel(value: string | null | undefined): GeminiModel {
  return value && isAllowedGeminiModel(value) ? value : DEFAULT_GEMINI_MODEL;
}

/** 이미 열린 설정 화면의 이전 모델 값도 받아 새 기본값으로 저장한다. */
export function isSupportedGeminiModelInput(value: string): boolean {
  return isAllowedGeminiModel(value) || [
    "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite",
  ].includes(value);
}

/** 모든 작업에서 경량 모델을 먼저 사용하되, 새 Flash를 직접 선택한 설정은 존중한다. */
export function chooseModelAuto(configured: string | null | undefined, _promptChars: number): GeminiModel {
  return resolveGeminiModel(configured);
}

/** 모델별 장애·한도·응답 실패 시 한 번만 다른 모델로 전환한다. */
export function alternateModel(model: GeminiModel): GeminiModel {
  return model === DEFAULT_GEMINI_MODEL ? FALLBACK_GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
}

/** 품질 작업도 경량 모델로 시작하고 사고 수준·응답 검증으로 품질을 확보한다. */
export function chooseQualityModel(configured: string | null | undefined): GeminiModel {
  return resolveGeminiModel(configured);
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length < 12) return "*".repeat(key.length);
  return key.slice(0, 4) + "*".repeat(key.length - 8) + key.slice(-4);
}

export function resolveApiKey(
  requestKey: string | undefined,
  serverKey: string | undefined
): string | null {
  if (requestKey && requestKey.length > 0) return requestKey;
  if (serverKey && serverKey.length > 0) return serverKey;
  return null;
}
