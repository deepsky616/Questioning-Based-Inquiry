import { GoogleGenAI } from "@google/genai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { extractJsonArray, extractJsonObject } from "@/lib/json-extract";
import { getRequestLocale, languageDirective } from "@/lib/locale";
import { alternateModel, chooseModelAuto, chooseQualityModel, resolveGeminiModel } from "@/lib/api-config";
import { AiBusyError, AiKeyMissingError, AiQuotaError, isDailyQuotaError, isTransientAiError } from "@/lib/ai-errors";
import type { GeminiModel } from "@/lib/api-config";

// 기존 import 경로 호환을 위해 재노출 (라우트들은 @/lib/ai에서 가져온다)
export { AiBusyError, AiKeyMissingError, AiQuotaError, isDailyQuotaError, isTransientAiError };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GenerateOptions {
  /** AI 설정(키·모델)을 결정할 사용자 id (교사 본인 또는 학생의 담당 교사 키) */
  userId: string;
  prompt: string;
  /** localize=true + req 제공 시, 프롬프트 끝에 출력 언어 지시문(languageDirective)을 덧붙인다 */
  req?: Request;
  localize?: boolean;
  /** 모델 system instruction (역할·규칙 고정용) */
  systemInstruction?: string;
  /** true면 크기와 무관하게 품질 우선 모델(flash 이상)을 사용 — 분석·수업자료 생성 등 */
  quality?: boolean;
  /** 특정 요청에서만 사용할 AI 키. 없으면 사용자/담당 교사 설정을 사용한다. */
  apiKeyOverride?: string;
  /** 특정 요청에서만 사용할 모델. 없으면 사용자/담당 교사 설정을 사용한다. */
  modelOverride?: string;
  /** 특정 요청의 최대 응답 토큰 수. 없으면 모델 기본값을 쓴다. */
  maxOutputTokens?: number;
  /** 특정 요청의 통신 시간 제한. 밀리초 단위이다. */
  timeoutMs?: number;
  /** 구조화 응답에 사용할 응답 형식. */
  responseMimeType?: string;
  /** 구조화 응답에 사용할 제이슨 틀. */
  responseJsonSchema?: unknown;
  /**
   * 샘플링 온도(0~2). 미지정 시 quality 작업은 0.1(같은 입력 → 최대한 일관된 결과),
   * 그 외에는 모델 기본값을 쓴다. 다양성이 필요한 작업(질문 게임 등)은 명시적으로 높인다.
   */
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  model: GeminiModel;
}

/** 분석·수업자료 생성 등 일관성이 중요한 작업의 기본 온도 */
export const CONSISTENT_TEMPERATURE = 0.1;

/**
 * 통합 AI 호출 계층. resolveUserAiConfig로 키를 결정하고 Gemini를 호출한다.
 * - 모델은 프롬프트 크기에 따라 자동 선택(짧은 작업 flash-lite / 긴 작업 flash, pro 설정은 존중)
 * - quality 작업은 낮은 온도로 호출해 같은 입력에 최대한 같은 분석이 나오게 한다
 * - 모델 혼잡(503/429)은 백오프 재시도 후 대체 모델(lite↔flash)로 자동 전환
 * - 키가 없으면 AiKeyMissingError, 대체 모델까지 혼잡하면 AiBusyError를 던진다
 */
async function callGeminiWithMetadata({
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
  timeoutMs,
  responseMimeType,
  responseJsonSchema,
}: GenerateOptions): Promise<GenerateTextResult> {
  const cfg = apiKeyOverride
    ? { apiKey: apiKeyOverride, model: resolveGeminiModel(modelOverride) }
    : await resolveUserAiConfig(userId);
  if (!cfg.apiKey) throw new AiKeyMissingError();

  const fullPrompt = localize && req ? prompt + languageDirective(getRequestLocale(req)) : prompt;
  const configuredModel = resolveGeminiModel(modelOverride ?? cfg.model);
  const primary = quality ? chooseQualityModel(configuredModel) : chooseModelAuto(configuredModel, fullPrompt.length);
  const temp = temperature ?? (quality ? CONSISTENT_TEMPERATURE : undefined);

  const genAI = new GoogleGenAI({ apiKey: cfg.apiKey });
  const runWith = async (modelName: GeminiModel, attempts: number): Promise<GenerateTextResult> => {
    for (let attempt = 1; ; attempt++) {
      try {
        const config = {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(temp != null ? { temperature: temp } : {}),
          ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
          ...(timeoutMs !== undefined
            ? { httpOptions: { timeout: timeoutMs } }
            : {}),
          ...(responseMimeType !== undefined ? { responseMimeType } : {}),
          ...(responseJsonSchema !== undefined ? { responseJsonSchema } : {}),
        };
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: fullPrompt,
          ...(Object.keys(config).length > 0 ? { config } : {}),
        });
        return { text: (response.text ?? "").trim(), model: modelName };
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
    // 주 모델이 혼잡하거나 일일 한도를 소진하면 대체 모델로 페일오버
    // (모델별 용량·무료 한도 풀이 달라 대개 성공)
    if (!(err instanceof AiBusyError || err instanceof AiQuotaError)) throw err;
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
  const result = await callGeminiWithMetadata(opts);
  return extractJsonObject(result.text) as T;
}

/** JSON 배열 응답을 공통 파서(extractJsonArray)로 파싱해 반환한다. */
export async function generateJsonArray<T = unknown>(opts: GenerateOptions): Promise<T[]> {
  const result = await callGeminiWithMetadata(opts);
  return extractJsonArray(result.text) as T[];
}

/** JSON 응답과 실제 사용 모델을 함께 반환한다. */
export async function generateJsonWithMetadata<T = unknown>(opts: GenerateOptions): Promise<{
  data: T;
  model: GeminiModel;
}> {
  const result = await callGeminiWithMetadata(opts);
  return {
    data: extractJsonObject(result.text) as T,
    model: result.model,
  };
}
