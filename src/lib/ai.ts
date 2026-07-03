import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { extractJsonObject } from "@/lib/json-extract";
import { getRequestLocale, languageDirective } from "@/lib/locale";

/** AI 키가 없을 때(교사 미설정 등) 던지는 에러. 라우트에서 503 응답으로 매핑한다. */
export class AiKeyMissingError extends Error {
  constructor() {
    super("AI_KEY_MISSING");
    this.name = "AiKeyMissingError";
  }
}

/** Gemini가 일시적으로 혼잡(503/429)할 때 던지는 에러. 라우트에서 사용자 안내로 매핑한다. */
export class AiBusyError extends Error {
  constructor() {
    super("AI_BUSY");
    this.name = "AiBusyError";
  }
}

/** 일시 오류(모델 혼잡·레이트 리밋) 판별 — 재시도 대상 */
export function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429)\b|Service Unavailable|high demand|overloaded|Resource has been exhausted|Too Many Requests/i.test(msg);
}

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
 * 통합 AI 호출 계층. resolveUserAiConfig로 키·모델을 결정하고 Gemini를 호출한다.
 * 키가 없으면 AiKeyMissingError를 던진다(라우트에서 503 처리).
 * 모델 혼잡(503/429)은 짧은 백오프로 최대 3회 재시도하고, 그래도 실패하면
 * AiBusyError를 던진다(라우트에서 "잠시 후 다시" 안내로 매핑).
 */
async function callGemini({ userId, prompt, req, localize, systemInstruction }: GenerateOptions): Promise<string> {
  const cfg = await resolveUserAiConfig(userId);
  if (!cfg.apiKey) throw new AiKeyMissingError();

  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel(systemInstruction ? { model: cfg.model, systemInstruction } : { model: cfg.model });
  const fullPrompt = localize && req ? prompt + languageDirective(getRequestLocale(req)) : prompt;

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await model.generateContent(fullPrompt);
      return result.response.text().trim();
    } catch (err) {
      if (!isTransientAiError(err)) throw err;
      if (attempt >= MAX_ATTEMPTS) throw new AiBusyError();
      await sleep(800 * attempt); // 0.8s, 1.6s
    }
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
