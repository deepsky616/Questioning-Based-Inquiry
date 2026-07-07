import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { extractJsonObject } from "@/lib/json-extract";
import { getRequestLocale, languageDirective } from "@/lib/locale";
import { alternateModel, chooseModelAuto, chooseQualityModel } from "@/lib/api-config";
import { AiBusyError, AiKeyMissingError, isTransientAiError } from "@/lib/ai-errors";
import type { GeminiModel } from "@/lib/api-config";

// 기존 import 경로 호환을 위해 재노출 (라우트들은 @/lib/ai에서 가져온다)
export { AiBusyError, AiKeyMissingError, isTransientAiError };

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
async function callGeminiWithMetadata({ userId, prompt, req, localize, systemInstruction, quality, temperature }: GenerateOptions): Promise<GenerateTextResult> {
  const cfg = await resolveUserAiConfig(userId);
  if (!cfg.apiKey) throw new AiKeyMissingError();

  const fullPrompt = localize && req ? prompt + languageDirective(getRequestLocale(req)) : prompt;
  const primary = quality ? chooseQualityModel(cfg.model) : chooseModelAuto(cfg.model, fullPrompt.length);
  const temp = temperature ?? (quality ? CONSISTENT_TEMPERATURE : undefined);

  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const runWith = async (modelName: GeminiModel, attempts: number): Promise<GenerateTextResult> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(temp != null ? { generationConfig: { temperature: temp } } : {}),
    });
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await model.generateContent(fullPrompt);
        return { text: result.response.text().trim(), model: modelName };
      } catch (err) {
        if (!isTransientAiError(err)) throw err;
        if (attempt >= attempts) throw new AiBusyError();
        await sleep(800 * attempt);
      }
    }
  };

  try {
    return await runWith(primary, 2);
  } catch (err) {
    // 주 모델이 계속 혼잡하면 대체 모델로 페일오버(모델별 용량 풀이 달라 대개 성공)
    if (!(err instanceof AiBusyError)) throw err;
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
