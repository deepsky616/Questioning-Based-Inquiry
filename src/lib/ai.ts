import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { extractJsonObject } from "@/lib/json-extract";
import { getRequestLocale, languageDirective } from "@/lib/locale";
import { alternateModel, chooseModelAuto } from "@/lib/api-config";
import { AiBusyError, AiKeyMissingError, isTransientAiError } from "@/lib/ai-errors";

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
}

/**
 * 통합 AI 호출 계층. resolveUserAiConfig로 키를 결정하고 Gemini를 호출한다.
 * - 모델은 프롬프트 크기에 따라 자동 선택(짧은 작업 flash-lite / 긴 작업 flash, pro 설정은 존중)
 * - 모델 혼잡(503/429)은 백오프 재시도 후 대체 모델(lite↔flash)로 자동 전환
 * - 키가 없으면 AiKeyMissingError, 대체 모델까지 혼잡하면 AiBusyError를 던진다
 */
async function callGemini({ userId, prompt, req, localize, systemInstruction }: GenerateOptions): Promise<string> {
  const cfg = await resolveUserAiConfig(userId);
  if (!cfg.apiKey) throw new AiKeyMissingError();

  const fullPrompt = localize && req ? prompt + languageDirective(getRequestLocale(req)) : prompt;
  const primary = chooseModelAuto(cfg.model, fullPrompt.length);

  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const runWith = async (modelName: string, attempts: number): Promise<string> => {
    const model = genAI.getGenerativeModel(
      systemInstruction ? { model: modelName, systemInstruction } : { model: modelName },
    );
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await model.generateContent(fullPrompt);
        return result.response.text().trim();
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
export function generateText(opts: GenerateOptions): Promise<string> {
  return callGemini(opts);
}

/** JSON 응답을 공통 파서(extractJsonObject)로 파싱해 반환한다. */
export async function generateJson<T = unknown>(opts: GenerateOptions): Promise<T> {
  const text = await callGemini(opts);
  return extractJsonObject(text) as T;
}
