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
