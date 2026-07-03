export const GEMINI_MODELS = [
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
] as const;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export type GeminiModel = (typeof GEMINI_MODELS)[number]["value"];

export function isAllowedGeminiModel(value: string): value is GeminiModel {
  return GEMINI_MODELS.some((model) => model.value === value);
}

export function resolveGeminiModel(value: string | null | undefined): GeminiModel {
  return value && isAllowedGeminiModel(value) ? value : DEFAULT_GEMINI_MODEL;
}

/**
 * 자동 모델 선택 임계값(프롬프트 문자 수).
 * 짧고 구조화된 작업(질문 1개 분류·짧은 번역 등)은 flash-lite가 빠르고 저렴하며 충분하고,
 * 이보다 긴 작업(세션 분석·질문 묶기·리포트 등)은 flash가 품질·일관성이 좋다.
 */
export const AUTO_MODEL_CHAR_THRESHOLD = 5000;

/**
 * 프롬프트 크기에 따라 가장 효율적인 모델을 자동 선택한다.
 * - 교사가 명시적으로 pro를 설정했으면 그대로 존중(프리미엄 선택)
 * - 그 외에는 짧은 작업 → gemini-2.5-flash-lite, 긴 작업 → gemini-2.5-flash
 */
export function chooseModelAuto(configured: string | null | undefined, promptChars: number): GeminiModel {
  const base = resolveGeminiModel(configured);
  if (base === "gemini-2.5-pro") return base;
  return promptChars > AUTO_MODEL_CHAR_THRESHOLD ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";
}

/** 혼잡(503) 시 전환할 대체 모델 — lite↔flash (pro는 flash로) */
export function alternateModel(model: GeminiModel): GeminiModel {
  return model === "gemini-2.5-flash-lite" ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";
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
