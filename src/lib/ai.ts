import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { resolveUserAiConfig, type ResolvedAiConfig } from "@/lib/resolve-ai-config";
import { extractJsonArray, extractJsonObject, JsonExtractionError } from "@/lib/json-extract";
import { getRequestLocale, languageDirective } from "@/lib/locale";
import { alternateModel, chooseModelAuto, chooseQualityModel, resolveGeminiModel } from "@/lib/api-config";
import { AiBusyError, AiInvalidResponseError, AiKeyMissingError, AiOutputTruncatedError, AiQuotaError, AiSafetyBlockedError, DemoAiQuotaError, isDailyQuotaError, isTransientAiError, isModelUnavailableError } from "@/lib/ai-errors";
import type { GeminiModel } from "@/lib/api-config";
import { rateLimit } from "@/lib/rate-limit";

// 기존 import 경로 호환을 위해 재노출 (라우트들은 @/lib/ai에서 가져온다)
export { AiBusyError, AiKeyMissingError, AiQuotaError, DemoAiQuotaError, isDailyQuotaError, isTransientAiError };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GenerateOptions {
  /** 기본 true. 출력 길이 제한에 걸리면 한 번만 예산을 늘려 처음부터 다시 생성한다. */
  retryTruncatedOutput?: boolean;
  /** AI 설정(키·모델)을 결정할 사용자 id (교사 본인 또는 학생의 담당 교사 키) */
  userId: string;
  prompt: string;
  /** localize=true + req 제공 시, 프롬프트 끝에 출력 언어 지시문(languageDirective)을 덧붙인다 */
  req?: Request;
  localize?: boolean;
  /** 모델 system instruction (역할·규칙 고정용) */
  systemInstruction?: string;
  /** 분석·수업자료 생성처럼 사고가 필요한 작업에 사용한다. */
  quality?: boolean;
  /** 특정 요청에서만 사용할 AI 키. 없으면 사용자/담당 교사 설정을 사용한다. */
  apiKeyOverride?: string;
  /** 특정 요청에서만 사용할 모델. 없으면 사용자/담당 교사 설정을 사용한다. */
  modelOverride?: string;
  /** 특정 요청의 최대 응답 토큰 수. 없으면 모델 기본값을 쓴다. */
  maxOutputTokens?: number;
  /** 이전 호출부 호환용 사고 예산. 0은 최소 수준, 그 외 값은 낮은 수준으로 변환한다. */
  thinkingBudget?: number;
  /** Gemini 3의 사고 수준. 기존 사고 예산보다 우선한다. */
  thinkingLevel?: ThinkingLevel;
  /** 특정 요청의 통신 시간 제한. 밀리초 단위이다. */
  timeoutMs?: number;
  /** 구조화 응답에 사용할 응답 형식. */
  responseMimeType?: string;
  /** 구조화 응답에 사용할 제이슨 틀. */
  responseJsonSchema?: unknown;
  /** 파싱된 응답을 기능별로 검사한다. false 또는 예외이면 대체 모델로 전환한다. */
  validateResponse?: (data: unknown) => boolean | void;
  /**
   * 샘플링 온도(0~2). Gemini 3 권장값 1 미만인 기존 설정은 1로 보정한다.
   */
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  model: GeminiModel;
}

/** Gemini 3 권장 온도. 낮은 온도에 따른 반복·추론 품질 저하를 방지한다. */
export const CONSISTENT_TEMPERATURE = 1;

function checkDemoRateLimit(userId: string): void {
  const { success } = rateLimit(`demo-ai:${userId}`, { limit: 10, windowMs: 60_000 });
  if (!success) throw new AiBusyError();
}

interface GenerationSession {
  userId: string;
  config: ResolvedAiConfig;
  deadline: number;
}

/**
 * 통합 AI 호출 계층. resolveUserAiConfig로 키를 결정하고 Gemini를 호출한다.
 * - 기본 모델은 Gemini 3.1 Flash-Lite, 대체 모델은 Gemini 3 Flash
 * - 기존 사고 예산은 Gemini 3의 사고 수준으로 변환한다
 * - 혼잡·모델 종료·비어 있거나 잘린 응답·제이슨 오류는 제한된 재시도와 모델 전환으로 복구한다
 * - 키가 없으면 AiKeyMissingError, 대체 모델까지 혼잡하면 AiBusyError를 던진다
 */
async function callGeminiWithMetadata({
  retryTruncatedOutput = true,
  userId,
  prompt,
  req,
  localize,
  systemInstruction,
  quality,
  temperature,
  apiKeyOverride,
  modelOverride,
  maxOutputTokens,
  thinkingBudget,
  thinkingLevel,
  timeoutMs,
  responseMimeType,
  responseJsonSchema,
  validateResponse,
}: GenerateOptions, session?: GenerationSession, responseKind: "text" | "object" | "array" = "text"): Promise<GenerateTextResult> {
  const resolved = session?.config ?? await resolveUserAiConfig(userId);
  const cfg = resolved.isDemo || !apiKeyOverride
    ? resolved
    : {
        apiKey: apiKeyOverride,
        model: resolveGeminiModel(modelOverride),
        isDemo: false,
      };
  if (!cfg.apiKey) throw new AiKeyMissingError();
  if (cfg.isDemo) {
    if (!session) checkDemoRateLimit(userId);
    const { consumeDemoAiQuota } = await import("@/lib/demo-ai-quota");
    await consumeDemoAiQuota(userId);
  }

  const fullPrompt = localize && req ? prompt + languageDirective(getRequestLocale(req)) : prompt;
  const configuredModel = resolveGeminiModel(
    cfg.isDemo ? cfg.model : modelOverride ?? cfg.model,
  );
  const primary = quality ? chooseQualityModel(configuredModel) : chooseModelAuto(configuredModel, fullPrompt.length);
  const temp = temperature === undefined ? (quality ? CONSISTENT_TEMPERATURE : undefined)
    : Math.max(1, temperature);
  const modelThinkingLevel = thinkingLevel ?? (thinkingBudget === 0
    ? ThinkingLevel.MINIMAL
    : thinkingBudget !== undefined || quality ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL);
  let effectiveMaxOutputTokens = cfg.isDemo
    ? Math.min(maxOutputTokens ?? 2_048, 2_048)
    : maxOutputTokens;
  let retriedTruncatedOutput = false;

  const genAI = new GoogleGenAI({ apiKey: cfg.apiKey });
  const runWith = async (modelName: GeminiModel, attempts: number): Promise<GenerateTextResult> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const requestTimeout = session
          ? Math.min(timeoutMs ?? 45_000, session.deadline - Date.now())
          : timeoutMs ?? 45_000;
        if (requestTimeout !== undefined && requestTimeout <= 0) throw new AiBusyError();
        const modelOutputLimit = effectiveMaxOutputTokens;
        const config = {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(temp != null ? { temperature: temp } : {}),
          ...(modelOutputLimit !== undefined
            ? { maxOutputTokens: modelOutputLimit }
            : {}),
          thinkingConfig: { thinkingLevel: modelThinkingLevel },
          ...(requestTimeout !== undefined
            ? { httpOptions: { timeout: requestTimeout } }
            : {}),
          ...(responseMimeType !== undefined ? { responseMimeType } : {}),
          ...(responseJsonSchema !== undefined ? { responseJsonSchema } : {}),
        };
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: fullPrompt,
          ...(Object.keys(config).length > 0 ? { config } : {}),
        });
        const finishReason = response.candidates?.[0]?.finishReason;
        const blockReason = response.promptFeedback?.blockReason;
        if ((blockReason && String(blockReason) !== "BLOCKED_REASON_UNSPECIFIED") ||
          ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "RECITATION"].includes(finishReason ?? "")) {
          throw new AiSafetyBlockedError();
        }
        if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
          const expandedLimit = modelOutputLimit === undefined ? undefined
            : Math.min(modelOutputLimit * 2, cfg.isDemo ? 2_048 : 8_192);
          if (retryTruncatedOutput && !retriedTruncatedOutput && modelOutputLimit !== undefined && expandedLimit !== undefined && expandedLimit > modelOutputLimit) {
            retriedTruncatedOutput = true;
            effectiveMaxOutputTokens = expandedLimit;
            continue;
          }
          throw new AiOutputTruncatedError();
        }
        const text = (response.text ?? "").trim();
        if (!text) throw new AiInvalidResponseError();
        if (finishReason && finishReason !== "STOP") throw new AiInvalidResponseError();
        const normalizedText = text.replace(/^```(?:json)?\s*/i, "").trimStart();
        const kind = responseKind === "text" && responseMimeType === "application/json"
          ? (normalizedText.startsWith("[") ? "array" : "object")
          : responseKind;
        if (kind !== "text") {
          if ((kind === "object" && normalizedText.startsWith("[")) ||
            (kind === "array" && normalizedText.startsWith("{"))) throw new AiInvalidResponseError();
          const data = kind === "array" ? extractJsonArray(text) : extractJsonObject(text);
          if (validateResponse) {
            try {
              if (validateResponse(data) === false) throw new AiInvalidResponseError();
            } catch {
              throw new AiInvalidResponseError();
            }
          }
        }
        return { text, model: modelName };
      } catch (err) {
        // 일일 한도 초과는 같은 모델 재시도가 무의미(잔여 한도만 소모) — 즉시 중단
        if (isDailyQuotaError(err)) throw new AiQuotaError();
        if (!isTransientAiError(err)) throw err;
        if (attempt >= attempts) throw new AiBusyError();
        await sleep(800 * attempt);
      }
    }
  };

  try {
    return await runWith(primary, 2);
  } catch (err) {
    if (err instanceof AiSafetyBlockedError) throw err;
    if (!(err instanceof AiBusyError || err instanceof AiQuotaError ||
      err instanceof AiInvalidResponseError || err instanceof JsonExtractionError || isModelUnavailableError(err))) throw err;
    return runWith(alternateModel(primary), 2);
  }
}

/** 자유 텍스트 응답을 반환한다. */
export async function generateText(opts: GenerateOptions): Promise<string> {
  const result = await callGeminiWithMetadata(opts);
  return result.text;
}

/** JSON 응답을 공통 파서(extractJsonObject)로 파싱해 반환한다. */
export async function generateJson<T = unknown>(opts: GenerateOptions): Promise<T> {
  const result = await callGeminiWithMetadata(opts, undefined, "object");
  return extractJsonObject(result.text) as T;
}

/**
 * 서버에서 한 분석을 분할할 때 사용하는 제한된 생성기.
 * 분당 제한은 사용자 실행 단위로, 일일 사용량과 출력 상한은 각 묶음에 적용한다.
 * 계정·수명·호출 횟수를 고정하여 일반 요청의 제한을 우회하는 데 재사용하지 못한다.
 */
export async function createJsonGenerationSession(userId: string) {
  const config = await resolveUserAiConfig(userId);
  if (!config.apiKey) throw new AiKeyMissingError();
  if (config.isDemo) checkDemoRateLimit(userId);
  const deadline = Date.now() + 240_000;
  const session: GenerationSession = { userId, config, deadline };
  let calls = 0;
  return async <T = unknown>(opts: GenerateOptions): Promise<T> => {
    if (opts.userId !== session.userId) throw new Error("AI_GENERATION_USER_MISMATCH");
    const remaining = deadline - Date.now();
    if (calls >= 64 || remaining <= 0) throw new AiBusyError();
    calls++;
    const result = await callGeminiWithMetadata({
      ...opts,
      timeoutMs: Math.min(opts.timeoutMs ?? 45_000, remaining),
    }, session, "object");
    return extractJsonObject(result.text) as T;
  };
}

/** JSON 배열 응답을 공통 파서(extractJsonArray)로 파싱해 반환한다. */
export async function generateJsonArray<T = unknown>(opts: GenerateOptions): Promise<T[]> {
  const result = await callGeminiWithMetadata(opts, undefined, "array");
  return extractJsonArray(result.text) as T[];
}

/** JSON 응답과 실제 사용 모델을 함께 반환한다. */
export async function generateJsonWithMetadata<T = unknown>(opts: GenerateOptions): Promise<{
  data: T;
  model: GeminiModel;
}> {
  const result = await callGeminiWithMetadata(opts, undefined, "object");
  return {
    data: extractJsonObject(result.text) as T,
    model: result.model,
  };
}
