// AI 호출 공통 에러·판별 (의존성 없음 — 클라이언트/테스트에서도 안전하게 import 가능)

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
